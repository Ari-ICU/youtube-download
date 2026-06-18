import { spawn } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { randomUUID } from "crypto";

const YTDLP = "yt-dlp";

// Player clients:
// - web:         broad compatibility, standard streams up to 1080p
// - android:     works for region-restricted & geo-blocked videos
// - android_vr:  unlocks 1440p/2160p (4K) adaptive streams
// Note: --js-runtimes and --remote-components removed; they fetch JS solvers
// from GitHub at runtime and break downloads when the network is unavailable.
const YTDLP_BASE_ARGS = [
  "--extractor-args", "youtube:player_client=web,android,android_vr",
  "--no-warnings",
];

function getYtDlpArgs(): string[] {
  const args = [...YTDLP_BASE_ARGS];
  const cookiesPath = join(process.cwd(), "cookies.txt");
  if (existsSync(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  }
  return args;
}

// ─── Token registry ───────────────────────────────────────────────────────────
// Maps a short-lived token → { path, tmpDir } so /api/download/file can serve it.
// Entries expire after 10 minutes automatically.

interface FileEntry {
  filePath: string;
  tmpDir: string;
  createdAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __downloadTokens: Map<string, FileEntry> | undefined;
}

function getRegistry(): Map<string, FileEntry> {
  if (!global.__downloadTokens) {
    global.__downloadTokens = new Map();
  }
  // Prune entries older than 10 min
  const now = Date.now();
  for (const [k, v] of global.__downloadTokens) {
    if (now - v.createdAt > 10 * 60 * 1000) {
      rm(v.tmpDir, { recursive: true, force: true }).catch(() => {});
      global.__downloadTokens.delete(k);
    }
  }
  return global.__downloadTokens;
}

export function registerToken(filePath: string, tmpDir: string): string {
  const token = randomUUID();
  getRegistry().set(token, { filePath, tmpDir, createdAt: Date.now() });
  return token;
}

export function consumeToken(token: string): FileEntry | undefined {
  const reg = getRegistry();
  const entry = reg.get(token);
  if (entry) reg.delete(token); // one-use
  return entry;
}

// ─── Security ─────────────────────────────────────────────────────────────────

const ALLOWED_HOSTS = [
  "youtube.com", "www.youtube.com", "youtu.be",
  "m.youtube.com", "music.youtube.com",
  "wetv.vip", "www.wetv.vip",
  "instagram.com", "www.instagram.com",
];

function isAllowedUrl(raw: string): boolean {
  try {
    const p = new URL(raw);
    if (p.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((h) => p.hostname === h || p.hostname.endsWith(`.${h}`));
  } catch { return false; }
}

// yt-dlp format IDs are numeric or alphanumeric strings. The + operator is used
// for merge selectors. Slash is NOT a valid format ID character and is removed
// to prevent any path-like injection into yt-dlp -o arguments.
const FORMAT_ID_RE = /^[a-zA-Z0-9\-_.+]{1,60}$/;

// ─── Progress line parser ─────────────────────────────────────────────────────

interface ProgressEvent {
  percent: number;       // 0-100
  downloadedMb: string;  // e.g. "12.3"
  speedMbps: string;     // e.g. "1.20 MiB/s"
  phase: "downloading" | "merging";
}

function toMib(val: string, unit: string): number {
  const n = parseFloat(val);
  if (unit === "GiB") return n * 1024;
  if (unit === "KiB") return n / 1024;
  return n; // MiB
}

function parseLine(line: string): ProgressEvent | null {
  // yt-dlp --newline output format:
  // [download]  12.3% of  164.86MiB at    1.20MiB/s ETA 02:10
  // Capture: percent, total size (with unit), speed (with unit)
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

  // Fallback: percent only line (no size info available yet)
  // [download]  12.3% of Unknown at    1.20MiB/s
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

  // ffmpeg merge phase
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
    return new Response("Only YouTube, WeTV, and Instagram URLs are supported.", { status: 400 });
  }

  if (!FORMAT_ID_RE.test(formatId)) {
    return new Response("Invalid format ID.", { status: 400 });
  }

  const sanitizedTitle = title.replace(/[^\w\s\-]/g, "").trim().slice(0, 200) || "youtube-download";
  // Use the explicit ?audio=true flag sent by the client — the format ID alone
  // cannot reliably distinguish audio-only from 4K video (both have high numeric IDs).
  const isAudioOnly = !merge && searchParams.get("audio") === "true";
  const ext = isAudioOnly ? "m4a" : "mp4";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {

      let tmpDir: string | null = null;
      let proc: ReturnType<typeof spawn> | null = null;
      let controllerClosed = false;

      // Safe close: idempotent, prevents double-close crashes
      const closeController = () => {
        if (controllerClosed) return;
        controllerClosed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      // Safe send: no-ops once the controller is closed
      const safeSend = (name: string, data: unknown) => {
        if (controllerClosed) return;
        try { controller.enqueue(encoder.encode(sseEvent(name, data))); } catch { /* closed */ }
      };

      try {
        tmpDir = await mkdtemp(join(tmpdir(), "ytdl-"));
        const outPath = resolve(join(tmpDir, `output.${ext}`));

        // Build yt-dlp args
        const ytArgs: string[] = [...getYtDlpArgs(), "--no-playlist", "--newline", "--progress"];

        const isWeTvUrl = decodedUrl.includes("wetv.vip");
        const isInstagramUrl = decodedUrl.includes("instagram.com");

        if (isInstagramUrl && !isAudioOnly) {
          // Instagram: always merge + recode to H.264/AAC for QuickTime compatibility
          const formatSelector =
            `${formatId}[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/` +
            `${formatId}+bestaudio[ext=m4a]/` +
            `bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/` +
            `bestvideo[ext=mp4]+bestaudio[ext=m4a]/` +
            `bestvideo+bestaudio/best[ext=mp4]/best`;
          ytArgs.push(
            "-f", formatSelector,
            "--merge-output-format", "mp4",
            "--recode-video", "mp4",
            "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart",
          );
        } else if (merge && !isWeTvUrl) {
          const formatSelector =
            `${formatId}+bestaudio[ext=m4a]/` +
            `${formatId}+bestaudio/` +
            `bestvideo+bestaudio[ext=m4a]/` +
            `bestvideo+bestaudio/best`;
          ytArgs.push("-f", formatSelector, "--merge-output-format", "mp4");
        } else {
          ytArgs.push("-f", formatId);
        }

        ytArgs.push("-o", outPath, "--no-part", decodedUrl);

        proc = spawn(YTDLP, ytArgs);

        // yt-dlp writes [download] progress lines to stderr.
        // We collect them in a buffer and flush on each newline.
        let stderrBuf = "";

        const onStderrData = (chunk: Buffer) => {
          if (controllerClosed) return;
          stderrBuf += chunk.toString("utf8");
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
            // Detach the data listener before flushing so stale events
            // can't fire after we close the controller below.
            proc!.stderr?.removeListener("data", onStderrData);

            // Flush any remaining buffered line (no trailing newline)
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
          safeSend("error", { message: `yt-dlp exited with code ${exitCode}` });
          closeController();
          if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          return;
        }

        // File is ready — register token and tell the client
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
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const dynamic = "force-dynamic";
