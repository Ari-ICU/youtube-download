import { spawn } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { createReadStream } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { checkHevcVideotoolbox } from "@/utils/ffmpeg";
import { YTDLP, FORMAT_ID_RE, isAllowedUrl, buildYtDlpArgs } from "@/utils/ytdlp-server";

export async function GET(request: Request) {
  let ytdlpProcess: ReturnType<typeof spawn> | null = null;
  let tmpDir: string | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const formatId = searchParams.get("itag");
    const title = searchParams.get("title") ?? "video";
    const merge = searchParams.get("merge") === "true";
    const sizeHint = parseInt(searchParams.get("size") ?? "0", 10) || 0;

    if (!url || !formatId) {
      return new Response(
        JSON.stringify({ error: "url and itag (format_id) are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const decodedUrl = decodeURIComponent(url);

    if (!isAllowedUrl(decodedUrl)) {
      return new Response(
        JSON.stringify({ error: "This URL is not supported by the whitelist configuration." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!FORMAT_ID_RE.test(formatId)) {
      return new Response(
        JSON.stringify({ error: "Invalid format ID." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const sanitizedTitle =
      title.replace(/[^\w\s\-]/g, "").trim().slice(0, 200) || "youtube-download";

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

    if (!merge && sizeHint > 0) {
      headers.set("Content-Length", String(sizeHint));
    }

    // ── Merge path: write to temp file, then stream back ─────────────────────
    if (merge) {
      tmpDir = await mkdtemp(join(tmpdir(), "ytdl-"));
      const outPath = join(tmpDir, `output.mp4`);

      const isWeTvUrl = decodedUrl.includes("wetv.vip");
      const isInstagramUrl = decodedUrl.includes("instagram.com");
      const isBilibiliUrl = decodedUrl.includes("bilibili.tv");
      const isXUrl = decodedUrl.includes("x.com") || decodedUrl.includes("twitter.com");

      let formatSelector: string;
      if (isWeTvUrl || isBilibiliUrl || isXUrl) {
        formatSelector = formatId;
      } else if (isInstagramUrl) {
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
      if (!isWeTvUrl && !isInstagramUrl && !isBilibiliUrl && !isXUrl) {
        const hasVtb = await checkHevcVideotoolbox();
        if (hasVtb) {
          recodeArgs.push(
            "--recode-video",
            "mp4",
            "--postprocessor-args",
            "VideoConvertor:-c:v hevc_videotoolbox -c:a aac -movflags +faststart"
          );
        } else {
          recodeArgs.push("--merge-output-format", "mp4");
        }
      }

      const ytdlpArgs = [
        ...buildYtDlpArgs(decodedUrl),
        "--no-playlist",
        "-f",
        formatSelector,
        ...(isInstagramUrl
          ? [
              "--recode-video",
              "mp4",
              "--postprocessor-args",
              "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart",
            ]
          : []),
        ...recodeArgs,
        "-o",
        outPath,
        "--no-part",
        decodedUrl,
      ];

      await new Promise<void>((resolve, reject) => {
        ytdlpProcess = spawn(YTDLP, ytdlpArgs);

        const stderrChunks: Buffer[] = [];
        ytdlpProcess.stderr?.on("data", (chunk: Buffer | string) =>
          stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        );
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
    const isInstagramDirect = decodedUrl.includes("instagram.com");
    if (isInstagramDirect && !isAudioOnly) {
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
          "-f",
          formatSelector,
          "--merge-output-format",
          "mp4",
          "--recode-video",
          "mp4",
          "--postprocessor-args",
          "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart",
          "-o",
          outPath,
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

    ytdlpProcess = spawn(YTDLP, [
      ...buildYtDlpArgs(decodedUrl),
      "--no-playlist",
      "-f",
      formatId,
      "-o",
      "-",
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
