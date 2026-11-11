import { spawn } from "child_process";
import { mkdtemp, readdir, rm, stat } from "fs/promises";
import { createReadStream } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  YTDLP,
  FORMAT_ID_RE,
  isAllowedUrl,
  isYouTubeUrl,
  buildYtDlpArgs,
  buildMergeFormatSelector,
} from "@/utils/ytdlp-server";

export async function GET(request: Request) {
  let ytdlpProcess = null as ReturnType<typeof spawn> | null;
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
        JSON.stringify({ error: "Only YouTube, TikTok, and Facebook URLs are supported." }),
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
      title.replace(/[^\w\s\-]/g, "").trim().slice(0, 200) || "media-download";

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

    // ── Merge or Audio Conversion path: write to temp file, then stream back ──
    if (merge || isAudioOnly) {
      tmpDir = await mkdtemp(join(tmpdir(), "ytdl-"));
      const outTemplate = resolve(join(tmpDir, `output.%(ext)s`));
      const expectedOutPath = resolve(join(tmpDir, `output.${ext}`));

      const buildCommandArgs = (useFallback = false): string[] => {
        const baseArgs = useFallback && isYouTubeUrl(decodedUrl)
          ? [
              "--no-warnings",
              "--retries",
              "10",
              "--fragment-retries",
              "10",
              "--extractor-args",
              "youtube:player_client=android_vr",
              "--js-runtimes",
              "node",
            ]
          : buildYtDlpArgs(decodedUrl);

        const ytdlpArgs: string[] = [...baseArgs, "--no-playlist"];
        const baseId = formatId.replace(/-[0-9]+$/, "");

        if (isAudioOnly) {
          ytdlpArgs.push(
            "-f",
            `${formatId}/${baseId}/140/251/bestaudio[ext=m4a]/bestaudio`,
            "-x",
            "--audio-format",
            "m4a"
          );
        } else {
          const formatSelector = useFallback
            ? `${baseId}+140/${baseId}+251/${baseId}+bestaudio/bestvideo[height<=2160]+bestaudio/best`
            : buildMergeFormatSelector(formatId);

          ytdlpArgs.push(
            "-f",
            formatSelector,
            "--merge-output-format",
            "mp4",
            "--remux-video",
            "mp4",
            "--postprocessor-args",
            "Merger+ffmpeg_o:-movflags +faststart"
          );
        }

        ytdlpArgs.push("-o", outTemplate, decodedUrl);
        return ytdlpArgs;
      };

      const runMerge = (ytdlpArgs: string[]): Promise<void> =>
        new Promise<void>((resolvePromise, rejectPromise) => {
          ytdlpProcess = spawn(YTDLP, ytdlpArgs);

          // Drain stdout so the child process pipe never blocks on long 4K downloads
          ytdlpProcess.stdout?.on("data", () => {});

          const stderrChunks: Buffer[] = [];
          ytdlpProcess.stderr?.on("data", (chunk: Buffer | string) =>
            stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          );
          ytdlpProcess.on("close", (code) => {
            if (code === 0) {
              resolvePromise();
            } else {
              const stderr = Buffer.concat(stderrChunks).toString();
              console.error(`yt-dlp merge exited with code ${code}:`, stderr);
              rejectPromise(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
            }
          });
          ytdlpProcess.on("error", rejectPromise);
        });

      try {
        await runMerge(buildCommandArgs(false));
      } catch {
        const leftover = await readdir(tmpDir).catch(() => []);
        await Promise.all(
          leftover.map((f) => rm(join(tmpDir!, f), { force: true }).catch(() => {}))
        );
        await runMerge(buildCommandArgs(true));
      }

      let finalFilePath = expectedOutPath;
      try {
        await stat(finalFilePath);
      } catch {
        const files = await readdir(tmpDir);
        const candidate = files.find(
          (f) => f.startsWith("output.") && !f.endsWith(".part") && !f.endsWith(".ytdl")
        );
        if (!candidate) {
          throw new Error("Downloaded output file was not found.");
        }
        finalFilePath = resolve(join(tmpDir, candidate));
      }

      const { size } = await stat(finalFilePath);
      headers.set("Content-Length", String(size));

      const nodeStream = createReadStream(finalFilePath);
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

    // ── Direct pipe path (combined MP4 streams) ───────────────────────────────
    if (sizeHint > 0) {
      headers.set("Content-Length", String(sizeHint));
    }

    ytdlpProcess = spawn(YTDLP, [
      ...buildYtDlpArgs(decodedUrl),
      "--no-playlist",
      "-f",
      formatId,
      "-o",
      "-",
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
