import { spawn } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { checkHevcVideotoolbox } from "@/utils/ffmpeg";
import { YTDLP, FORMAT_ID_RE, isAllowedUrl, buildYtDlpArgs } from "@/utils/ytdlp-server";
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
  return n;
}

function parseLine(line: string): ProgressEvent | null {
  const m = line.match(
    /\[download\]\s+([\d.]+)%\s+of\s+([\d.]+)(MiB|KiB|GiB|B)\s+at\s+([\d.]+)(MiB|KiB|GiB|B)\/s/
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
    /\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+)(MiB|KiB|GiB|B)\s/
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

  if (line.includes("[ffmpeg]") || line.includes("Merging") || line.includes("Destination")) {
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
    return new Response("This URL is not supported by the whitelist configuration.", { status: 400 });
  }

  if (!FORMAT_ID_RE.test(formatId)) {
    return new Response("Invalid format ID.", { status: 400 });
  }

  const sanitizedTitle = title.replace(/[^\w\s\-]/g, "").trim().slice(0, 200) || "youtube-download";
  const isAudioOnly = !merge && searchParams.get("audio") === "true";
  const ext = isAudioOnly ? "m4a" : "mp4";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let tmpDir: string | null = null;
      let proc: ReturnType<typeof spawn> | null = null;
      let controllerClosed = false;

      const closeController = () => {
        if (controllerClosed) return;
        controllerClosed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      const safeSend = (name: string, data: unknown) => {
        if (controllerClosed) return;
        try { controller.enqueue(encoder.encode(sseEvent(name, data))); } catch { /* closed */ }
      };

      try {
        tmpDir = await mkdtemp(join(tmpdir(), "ytdl-"));
        const outPath = resolve(join(tmpDir, `output.${ext}`));

        const ytArgs: string[] = [
          ...buildYtDlpArgs(decodedUrl),
          "--no-playlist",
          "--newline",
          "--progress",
        ];

        const isWeTvUrl = decodedUrl.includes("wetv.vip");
        const isInstagramUrl = decodedUrl.includes("instagram.com");
        const isBilibiliUrl = decodedUrl.includes("bilibili.tv");
        const isXUrl = decodedUrl.includes("x.com") || decodedUrl.includes("twitter.com");

        if (isInstagramUrl && !isAudioOnly) {
          const formatSelector =
            `${formatId}[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/` +
            `${formatId}+bestaudio[ext=m4a]/` +
            `bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/` +
            `bestvideo[ext=mp4]+bestaudio[ext=m4a]/` +
            `bestvideo+bestaudio/best[ext=mp4]/best`;
          ytArgs.push(
            "-f",
            formatSelector,
            "--merge-output-format",
            "mp4",
            "--recode-video",
            "mp4",
            "--postprocessor-args",
            "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart"
          );
        } else if (merge && !isWeTvUrl && !isBilibiliUrl && !isXUrl) {
          const formatSelector =
            `${formatId}+bestaudio[ext=m4a]/` +
            `${formatId}+bestaudio/` +
            `bestvideo+bestaudio[ext=m4a]/` +
            `bestvideo+bestaudio/best`;
          ytArgs.push("-f", formatSelector);

          const hasVtb = await checkHevcVideotoolbox();
          if (hasVtb) {
            ytArgs.push(
              "--recode-video",
              "mp4",
              "--postprocessor-args",
              "VideoConvertor:-c:v hevc_videotoolbox -c:a aac -movflags +faststart"
            );
          } else {
            ytArgs.push("--merge-output-format", "mp4");
          }
        } else {
          ytArgs.push("-f", formatId);
        }

        ytArgs.push("-o", outPath, "--no-part", decodedUrl);

        proc = spawn(YTDLP, ytArgs);

        let stderrBuf = "";
        let fullStderr = "";

        const onStderrData = (chunk: Buffer) => {
          if (controllerClosed) return;
          const str = chunk.toString("utf8");
          stderrBuf += str;
          fullStderr += str;
          const lines = stderrBuf.split("\n");
          stderrBuf = lines.pop() ?? "";
          for (const line of lines) {
            const evt = parseLine(line);
            if (evt) safeSend("progress", evt);
          }
        };

        proc.stderr?.on("data", onStderrData);

        const exitCode = await new Promise<number>((res, rej) => {
          proc!.on("close", (code) => {
            proc!.stderr?.removeListener("data", onStderrData);

            if (stderrBuf.trim()) {
              const evt = parseLine(stderrBuf.trim());
              if (evt) safeSend("progress", evt);
              stderrBuf = "";
            }
            res(code ?? 1);
          });
          proc!.on("error", rej);
        });

        if (exitCode !== 0) {
          const errMsg = fullStderr.trim() || `yt-dlp exited with code ${exitCode}`;
          console.error("yt-dlp progress error:", errMsg);
          safeSend("error", { message: errMsg });
          closeController();
          if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          return;
        }

        const { size } = await stat(outPath);
        const token = registerToken(outPath, tmpDir);

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
        safeSend("error", { message: err instanceof Error ? err.message : "Unknown error" });
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
