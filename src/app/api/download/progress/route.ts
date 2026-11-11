import { spawn } from "child_process";
import { mkdtemp, readdir, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  YTDLP,
  FORMAT_ID_RE,
  isAllowedUrl,
  isYouTubeUrl,
  buildYtDlpArgs,
  buildMergeFormatSelector,
  parseUpscaleFormatId,
} from "@/utils/ytdlp-server";
import { registerToken } from "@/utils/token-registry";

// ─── Progress line parser ─────────────────────────────────────────────────────

interface ProgressEvent {
  percent: number;
  downloadedMb: string;
  speedMbps: string;
  phase: "downloading" | "merging";
}

function toMib(val: string, unit: string): number {
  const n = parseFloat(val);
  if (unit === "GiB") return n * 1024;
  if (unit === "KiB") return n / 1024;
  if (unit === "B") return n / (1024 * 1024);
  return n;
}

function parseLine(line: string): ProgressEvent | null {
  const m = line.match(
    /\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+)(MiB|KiB|GiB|B)\s+at\s+([\d.]+)(MiB|KiB|GiB|B)\/s/
  );
  if (m) {
    const pct   = parseFloat(m[1]);
    const total = toMib(m[2], m[3]);
    const speed = toMib(m[4], m[5]);
    const done  = (pct / 100) * total;
    return {
      percent: pct,
      downloadedMb: done.toFixed(1),
      speedMbps: `${speed.toFixed(2)} MB/s`,
      phase: "downloading",
    };
  }

  const m2 = line.match(
    /\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+)(MiB|KiB|GiB|B)/
  );
  if (m2) {
    const pct   = parseFloat(m2[1]);
    const total = toMib(m2[2], m2[3]);
    const done  = (pct / 100) * total;
    return {
      percent: pct,
      downloadedMb: done.toFixed(1),
      speedMbps: "",
      phase: "downloading",
    };
  }

  if (
    line.includes("[Merger]") ||
    line.includes("[VideoRemuxer]") ||
    line.includes("[ExtractAudio]") ||
    line.includes("[Fixup") ||
    line.includes("Merging formats")
  ) {
    return { percent: 99, downloadedMb: "—", speedMbps: "merging…", phase: "merging" };
  }

  return null;
}

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sseEvent(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url      = searchParams.get("url");
  const formatId = searchParams.get("itag");
  const title    = searchParams.get("title") ?? "video";
  const merge    = searchParams.get("merge") === "true";

  if (!url || !formatId) {
    return new Response("url and itag are required", { status: 400 });
  }

  const decodedUrl = decodeURIComponent(url);

  if (!isAllowedUrl(decodedUrl)) {
    return new Response(
      "Only YouTube, TikTok, and Facebook URLs are supported.",
      { status: 400 }
    );
  }

  if (!FORMAT_ID_RE.test(formatId)) {
    return new Response("Invalid format ID.", { status: 400 });
  }

  const sanitizedTitle =
    title.replace(/[^\w\s\-]/g, "").trim().slice(0, 200) || "media-download";
  const isAudioOnly = !merge && searchParams.get("audio") === "true";
  const ext = isAudioOnly ? "m4a" : "mp4";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let tmpDir: string | null = null;
      let proc = null as ReturnType<typeof spawn> | null;
      let controllerClosed = false;

      const closeController = () => {
        if (controllerClosed) return;
        controllerClosed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const safeSend = (name: string, data: unknown) => {
        if (controllerClosed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(name, data)));
        } catch {
          /* closed */
        }
      };

      try {
        tmpDir = await mkdtemp(join(tmpdir(), "ytdl-"));
        const outTemplate = resolve(join(tmpDir, `output.%(ext)s`));
        const expectedOutPath = resolve(join(tmpDir, `output.${ext}`));

        const { rawFormatId, upscaleTarget } = parseUpscaleFormatId(formatId);
        const baseId = rawFormatId.replace(/-[0-9]+$/, "");

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

          const args: string[] = [
            ...baseArgs,
            "--no-playlist",
            "--newline",
            "--progress",
          ];

          if (isAudioOnly) {
            args.push(
              "-f",
              `${rawFormatId}/${baseId}/140/251/bestaudio[ext=m4a]/bestaudio`,
              "-x",
              "--audio-format",
              "m4a"
            );
          } else if (merge || upscaleTarget) {
            const selector = useFallback
              ? `${baseId}+140/${baseId}+251/${baseId}+bestaudio/bestvideo[height<=2160]+bestaudio/best`
              : buildMergeFormatSelector(formatId);
            args.push(
              "-f",
              selector,
              "--merge-output-format",
              "mp4",
              "--remux-video",
              "mp4",
              "--postprocessor-args",
              "Merger+ffmpeg_o:-movflags +faststart"
            );
          } else {
            args.push(
              "-f",
              `${rawFormatId}/${baseId}/best[ext=mp4]/best`,
              "--merge-output-format",
              "mp4",
              "--remux-video",
              "mp4"
            );
          }

          args.push("-o", outTemplate, decodedUrl);
          return args;
        };

        const runAttempt = async (ytArgs: string[]): Promise<{ code: number; stderr: string }> => {
          const child = spawn(YTDLP, ytArgs);
          proc = child;

          let stdoutBuf = "";
          let stderrBuf = "";
          let fullStderr = "";

          const handleLines = (chunk: Buffer, isStderr: boolean) => {
            if (controllerClosed) return;
            const str = chunk.toString("utf8");
            if (isStderr) {
              stderrBuf += str;
              fullStderr += str;
              const lines = stderrBuf.split(/[\r\n]+/);
              stderrBuf = lines.pop() ?? "";
              for (const line of lines) {
                const evt = parseLine(line);
                if (evt) safeSend("progress", evt);
              }
            } else {
              stdoutBuf += str;
              const lines = stdoutBuf.split(/[\r\n]+/);
              stdoutBuf = lines.pop() ?? "";
              for (const line of lines) {
                const evt = parseLine(line);
                if (evt) safeSend("progress", evt);
              }
            }
          };

          const onStdoutData = (chunk: Buffer) => handleLines(chunk, false);
          const onStderrData = (chunk: Buffer) => handleLines(chunk, true);

          child.stdout?.on("data", onStdoutData);
          child.stderr?.on("data", onStderrData);

          const code = await new Promise<number>((res, rej) => {
            child.on("close", (exitCode) => {
              child.stdout?.removeListener("data", onStdoutData);
              child.stderr?.removeListener("data", onStderrData);

              for (const rem of [stdoutBuf.trim(), stderrBuf.trim()]) {
                if (rem) {
                  const evt = parseLine(rem);
                  if (evt) safeSend("progress", evt);
                }
              }
              stdoutBuf = "";
              stderrBuf = "";
              res(exitCode ?? 1);
            });
            child.on("error", rej);
          });

          return { code, stderr: fullStderr };
        };

        let result = await runAttempt(buildCommandArgs(false));

        if (result.code !== 0 && !controllerClosed) {
          // Clean partial files before retry
          const leftover = await readdir(tmpDir).catch(() => []);
          await Promise.all(
            leftover.map((f) => rm(join(tmpDir!, f), { force: true }).catch(() => {}))
          );
          result = await runAttempt(buildCommandArgs(true));
        }

        if (result.code !== 0) {
          const errMsg = result.stderr.trim() || `yt-dlp exited with code ${result.code}`;
          console.error("yt-dlp progress error:", errMsg);
          safeSend("error", { message: errMsg });
          closeController();
          if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          return;
        }

        // Resolve final output file path in tmpDir
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

        // If user selected a synthesized 4K (2160p) or 2K (1440p) Ultra HD stream,
        // scale the merged source MP4 to 3840×2160 or 2560×1440 via FFmpeg.
        if (upscaleTarget && !controllerClosed) {
          const targetLong = upscaleTarget === "4k" ? 3840 : 2560;
          const upscaledPath = resolve(join(tmpDir, `upscaled-${upscaleTarget}.mp4`));

          safeSend("progress", {
            percent: 99,
            downloadedMb: "—",
            speedMbps: `${upscaleTarget.toUpperCase()} UHD encoding…`,
            phase: "merging",
          });

          const ffExit = await new Promise<number>((res, rej) => {
            const ffProc = spawn("ffmpeg", [
              "-y",
              "-i",
              finalFilePath,
              "-c:v",
              "libx264",
              "-preset",
              "ultrafast",
              "-crf",
              "20",
              "-vf",
              `scale='if(gt(iw,ih),${targetLong},-2)':'if(gt(iw,ih),-2,${targetLong})',format=yuv420p`,
              "-c:a",
              "copy",
              "-movflags",
              "+faststart",
              upscaledPath,
            ]);
            proc = ffProc;
            ffProc.stdout?.on("data", () => {});
            ffProc.stderr?.on("data", () => {});
            ffProc.on("close", (c) => res(c ?? 1));
            ffProc.on("error", rej);
          });

          if (ffExit === 0) {
            await rm(finalFilePath, { force: true }).catch(() => {});
            finalFilePath = upscaledPath;
          }
        }

        const { size } = await stat(finalFilePath);
        const token = registerToken(finalFilePath, tmpDir);

        safeSend("ready", {
          token,
          filename: `${sanitizedTitle}.${ext}`,
          sizeMb: (size / 1024 / 1024).toFixed(1),
          mimeType: isAudioOnly ? "audio/mp4" : "video/mp4",
        });

        closeController();
      } catch (err) {
        proc?.kill("SIGTERM");
        if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        safeSend("error", {
          message: err instanceof Error ? err.message : "Unknown error",
        });
        closeController();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const dynamic = "force-dynamic";
