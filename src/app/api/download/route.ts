import { spawn } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { checkHevcVideotoolbox } from "@/utils/ffmpeg";

const YTDLP = "yt-dlp";

// ─── Per-URL yt-dlp args builder ─────────────────────────────────────────────
const YTDLP_YOUTUBE_ARGS = [
  "--extractor-args", "youtube:player_client=web,android,android_vr",
  "--js-runtimes", "node",
];

const YTDLP_BILIBILI_ARGS = [
  "--geo-bypass",
  "--extractor-args", "BiliBiliTV:lang=en",
];

const YTDLP_BASE_ARGS = ["--no-warnings"];

function buildYtDlpArgs(url: string): string[] {
  const args = [...YTDLP_BASE_ARGS];
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    args.push(...YTDLP_YOUTUBE_ARGS);
  } else if (url.includes("bilibili.tv")) {
    args.push(...YTDLP_BILIBILI_ARGS);
  }
  const cookiesPath = join(process.cwd(), "cookies.txt");
  if (existsSync(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  }
  return args;
}

// ─── Security: allowlist YouTube domains to prevent SSRF ─────────────────────
const ALLOWED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
  "wetv.vip",
  "www.wetv.vip",
  "instagram.com",
  "www.instagram.com",
  "bilibili.tv",
  "www.bilibili.tv",
];

function isAllowedUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

// yt-dlp format IDs are numeric or alphanumeric strings. The + operator is used
// for merge selectors (e.g. "137+140"). Slash is NOT a valid format ID character
// and is removed to prevent any path-like injection into yt-dlp -o arguments.
const FORMAT_ID_RE = /^[a-zA-Z0-9\-_.+]{1,60}$/;

export async function GET(request: Request) {
  let ytdlpProcess: ReturnType<typeof spawn> | null = null;
  let tmpDir: string | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const formatId = searchParams.get("itag");
    const title = searchParams.get("title") ?? "video";
    // merge=true means the client wants yt-dlp to merge a video-only + best audio
    const merge = searchParams.get("merge") === "true";
    // size hint from the client (yt-dlp contentLength) — used to set Content-Length
    const sizeHint = parseInt(searchParams.get("size") ?? "0", 10) || 0;

    if (!url || !formatId) {
      return new Response(
        JSON.stringify({ error: "url and itag (format_id) are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const decodedUrl = decodeURIComponent(url);

    // ── Security: reject non-YouTube URLs ─────────────────────────────────────
    if (!isAllowedUrl(decodedUrl)) {
      return new Response(
        JSON.stringify({ error: "Only YouTube, WeTV, Instagram, and Bilibili TV URLs are supported." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Security: validate format ID to prevent argument injection ────────────
    if (!FORMAT_ID_RE.test(formatId)) {
      return new Response(
        JSON.stringify({ error: "Invalid format ID." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Sanitize filename — strip everything except word chars, spaces, hyphens; cap at 200 chars
    const sanitizedTitle =
      title.replace(/[^\w\s\-]/g, "").trim().slice(0, 200) || "youtube-download";

    // ── Determine output format ───────────────────────────────────────────────
    // merge mode: video-only stream + best available audio → temp file + ffmpeg
    // audio mode: audio-only itag → m4a  (signalled by explicit ?audio=true)
    // normal mode: combined stream → mp4 (can pipe directly)
    //
    // We rely on the explicit ?audio=true flag from the client rather than
    // guessing from the format ID — high numeric IDs (700+) are 4K video, not audio.
    const isAudioOnly = !merge && searchParams.get("audio") === "true";

    const mimeType = isAudioOnly ? "audio/mp4" : "video/mp4";
    const ext = isAudioOnly ? "m4a" : "mp4";
    const filename = `${sanitizedTitle}.${ext}`;

    const headers = new Headers({
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache",
    });

    // Set Content-Length when we have a reliable size so the browser can show
    // download progress. Only set it on the direct-pipe path (non-merge); the
    // merge path gets its own Content-Length from stat() after ffmpeg finishes.
    if (!merge && sizeHint > 0) {
      headers.set("Content-Length", String(sizeHint));
    }

    // ── Merge path: write to temp file, then stream back ─────────────────────
    // ffmpeg (used by yt-dlp for muxing) requires a seekable output container.
    // Piping to stdout produces a broken file with no audio track.
    if (merge) {
      tmpDir = await mkdtemp(join(tmpdir(), "ytdl-"));
      const outPath = join(tmpDir, `output.mp4`);

      const isWeTvUrl = decodedUrl.includes("wetv.vip");
      const isInstagramUrl = decodedUrl.includes("instagram.com");
      const isBilibiliUrl = decodedUrl.includes("bilibili.tv");

      let formatSelector: string;
      if (isWeTvUrl || isBilibiliUrl) {
        // HLS sites: format ID is the full stream selector, no merge needed
        formatSelector = formatId;
      } else if (isInstagramUrl) {
        // Instagram: prefer H.264 MP4 + M4A audio — QuickTime compatible
        formatSelector =
          `${formatId}[ext=mp4]+bestaudio[ext=m4a]/` +
          `${formatId}+bestaudio[ext=m4a]/` +
          `bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/` +
          `bestvideo[ext=mp4]+bestaudio[ext=m4a]/` +
          `bestvideo+bestaudio[ext=m4a]/` +
          `bestvideo+bestaudio/best[ext=mp4]/best`;
      } else {
        formatSelector =
          `${formatId}+bestaudio[ext=m4a]/` +
          `${formatId}+bestaudio/` +
          `bestvideo+bestaudio[ext=m4a]/` +
          `bestvideo+bestaudio/` +
          `best`;
      }

      const recodeArgs: string[] = [];
      if (!isWeTvUrl && !isInstagramUrl && !isBilibiliUrl) {
        const hasVtb = await checkHevcVideotoolbox();
        if (hasVtb) {
          recodeArgs.push(
            "--recode-video", "mp4",
            "--postprocessor-args", "VideoConvertor:-c:v hevc_videotoolbox -c:a aac -movflags +faststart"
          );
        } else {
          recodeArgs.push("--merge-output-format", "mp4");
        }
      }

      const ytdlpArgs = [
        ...buildYtDlpArgs(decodedUrl),
        "--no-playlist",
        "-f", formatSelector,
        // For Instagram, recode to H.264 to guarantee QuickTime compatibility
        ...(isInstagramUrl ? ["--recode-video", "mp4", "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart"] : []),
        ...recodeArgs,
        "-o", outPath,
        "--no-part",
        decodedUrl,
      ];

      await new Promise<void>((resolve, reject) => {
        ytdlpProcess = spawn(YTDLP, ytdlpArgs);

        const stderrChunks: Buffer[] = [];
        ytdlpProcess.stderr?.on("data", (chunk: Buffer | string) => stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        ytdlpProcess.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            const stderr = Buffer.concat(stderrChunks).toString();
            console.error(`yt-dlp merge exited with code ${code}:`, stderr);
            reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
          }
        });
        ytdlpProcess.on("error", reject);
      });

      // Get file size for Content-Length
      const { size } = await stat(outPath);
      headers.set("Content-Length", String(size));

      const nodeStream = createReadStream(outPath);
      const readableStream = new ReadableStream({
        start(controller) {
          nodeStream.on("data", (chunk: Buffer | string) => {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            controller.enqueue(new Uint8Array(buf));
          });
          nodeStream.on("end", () => {
            controller.close();
            // Clean up temp dir after streaming
            if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          });
          nodeStream.on("error", (err) => {
            controller.error(err);
            if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          });
        },
        cancel() {
          nodeStream.destroy();
          if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        },
      });

      return new Response(readableStream, { headers });
    }

    // ── Direct pipe path (combined or audio-only streams) ────────────────────
    // For Instagram URLs: use merge path via temp file to ensure H.264/AAC MP4
    // that is compatible with QuickTime Player on Mac.
    const isInstagramDirect = decodedUrl.includes("instagram.com");
    if (isInstagramDirect && !isAudioOnly) {
      // Redirect to merge path — write to temp dir with recode
      tmpDir = await mkdtemp(join(tmpdir(), "ytdl-ig-"));
      const outPath = join(tmpDir, `output.mp4`);
      const formatSelector =
        `${formatId}[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/` +
        `${formatId}+bestaudio[ext=m4a]/` +
        `bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/` +
        `bestvideo[ext=mp4]+bestaudio[ext=m4a]/` +
        `bestvideo+bestaudio/best[ext=mp4]/best`;

      await new Promise<void>((resolve, reject) => {
        ytdlpProcess = spawn(YTDLP, [
          ...buildYtDlpArgs(decodedUrl),
          "--no-playlist",
          "-f", formatSelector,
          "--merge-output-format", "mp4",
          "--recode-video", "mp4",
          "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart",
          "-o", outPath,
          "--no-part",
          decodedUrl,
        ]);

        const stderrChunks2: Buffer[] = [];
        ytdlpProcess.stderr?.on("data", (chunk: Buffer | string) =>
          stderrChunks2.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        );
        ytdlpProcess.on("close", (code) => {
          if (code === 0) resolve();
          else {
            const stderr = Buffer.concat(stderrChunks2).toString();
            console.error(`yt-dlp Instagram recode exited with code ${code}:`, stderr);
            reject(new Error(`yt-dlp exited with code ${code}`));
          }
        });
        ytdlpProcess.on("error", reject);
      });

      const { size: igSize } = await stat(outPath);
      const igFilename = `${sanitizedTitle}.mp4`;
      const igHeaders = new Headers({
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(igFilename)}`,
        "Content-Length": String(igSize),
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache",
      });
      const igStream = createReadStream(outPath);
      const igReadable = new ReadableStream({
        start(controller) {
          igStream.on("data", (chunk: Buffer | string) =>
            controller.enqueue(new Uint8Array(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
          );
          igStream.on("end", () => {
            controller.close();
            if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          });
          igStream.on("error", (err) => {
            controller.error(err);
            if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          });
        },
        cancel() {
          igStream.destroy();
          if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        },
      });
      return new Response(igReadable, { headers: igHeaders });
    }

    // ── Direct pipe path (combined or audio-only streams) ────────────────────
    ytdlpProcess = spawn(YTDLP, [
      ...buildYtDlpArgs(decodedUrl),
      "--no-playlist",
      "-f", formatId,
      "-o", "-",
      "--no-part",
      decodedUrl,
    ]);

    const stderrChunks: Buffer[] = [];
    ytdlpProcess.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const readableStream = new ReadableStream({
      start(controller) {
        ytdlpProcess!.stdout?.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        ytdlpProcess!.stdout?.on("end", () => {
          controller.close();
        });

        ytdlpProcess!.stdout?.on("error", (err) => {
          console.error("yt-dlp stdout error:", err);
          controller.error(err);
        });

        ytdlpProcess!.on("close", (code) => {
          if (code !== 0) {
            const stderr = Buffer.concat(stderrChunks).toString();
            console.error(`yt-dlp exited with code ${code}:`, stderr);
          }
        });
      },
      cancel() {
        ytdlpProcess?.kill("SIGTERM");
      },
    });

    return new Response(readableStream, { headers });
  } catch (error: unknown) {
    ytdlpProcess?.kill("SIGTERM");
    if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    const msg =
      error instanceof Error ? error.message : "Failed to start download.";
    console.error("Error in /api/download:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const dynamic = "force-dynamic";
