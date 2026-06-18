import { spawn } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { createReadStream } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const YTDLP = "yt-dlp";

// Use web + android + android_vr clients:
// - web/android: broad compatibility, works for region-restricted & low-format videos
// - android_vr:  unlocks 1440p/2160p (4K) adaptive streams that other clients omit
const YTDLP_BASE_ARGS = [
  "--extractor-args", "youtube:player_client=web,android,android_vr",
  "--no-warnings",
  "--js-runtimes", "node",
  "--remote-components", "ejs:github",
];

// ─── Security: allowlist YouTube domains to prevent SSRF ─────────────────────
const ALLOWED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
  "wetv.vip",
  "www.wetv.vip",
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
        JSON.stringify({ error: "Only YouTube URLs are supported." }),
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
      const formatSelector = isWeTvUrl
        ? formatId
        : `${formatId}+bestaudio[ext=m4a]/` +
          `${formatId}+bestaudio/` +
          `bestvideo+bestaudio[ext=m4a]/` +
          `bestvideo+bestaudio/` +
          `best`;

      await new Promise<void>((resolve, reject) => {
        ytdlpProcess = spawn(YTDLP, [
          ...YTDLP_BASE_ARGS,
          "--no-playlist",
          "-f", formatSelector,
          "--merge-output-format", "mp4",
          "-o", outPath,
          "--no-part",
          decodedUrl,
        ]);

        const stderrChunks: Buffer[] = [];
        ytdlpProcess.stderr?.on("data", (chunk: Buffer | string) => stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        ytdlpProcess.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            const stderr = Buffer.concat(stderrChunks).toString();
            console.error(`yt-dlp merge exited with code ${code}:`, stderr);
            reject(new Error(`yt-dlp exited with code ${code}`));
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
    ytdlpProcess = spawn(YTDLP, [
      ...YTDLP_BASE_ARGS,
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
