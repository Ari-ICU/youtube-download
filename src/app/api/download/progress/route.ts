import { spawn } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { randomUUID } from "crypto";

const YTDLP = "yt-dlp";

const YTDLP_BASE_ARGS = [
  "--extractor-args", "youtube:player_client=web,android,android_vr",
  "--no-warnings",
];

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
];

function isAllowedUrl(raw: string): boolean {
  try {
    const p = new URL(raw);
    if (p.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((h) => p.hostname === h || p.hostname.endsWith(`.${h}`));
  } catch { return false; }
}

const FORMAT_ID_RE = /^[a-zA-Z0-9\-_.+/]{1,60}$/;

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
  // [download]  12.3% of  164.86MiB at    1.20MiB/s ETA 02:10
  const m = line.match(
    /\[download\]\s+([\d.]+)%\s+of\s+[\d.]+\S+\s+at\s+([\d.]+)(MiB|KiB|GiB)\/s/
  );
  if (m) {
    const speedMb = toMib(m[2], m[3]);
    return {
      percent: parseFloat(m[1]),
      downloadedMb: (parseFloat(m[1]) / 100).toFixed(1), // approximate; overridden below
      speedMbps: `${speedMb.toFixed(1)} MB/s`,
      phase: "downloading",
    };
  }

  // Better: extract downloaded bytes from lines like:
  // [download]  12.3% of  164.86MiB at ... (164.86MiB total, 20.25MiB downloaded)
  const m2 = line.match(
    /\[download\]\s+([\d.]+)%\s+of\s+([\d.]+)(MiB|KiB|GiB)\s+at\s+([\d.]+)(MiB|KiB|GiB)\/s/
  );
  if (m2) {
    const pct    = parseFloat(m2[1]);
    const total  = toMib(m2[2], m2[3]);
    const speed  = toMib(m2[4], m2[5]);
    const done   = (pct / 100) * total;
    return {
      percent: pct,
      downloadedMb: done.toFixed(1),
      speedMbps: `${speed.toFixed(1)} MB/s`,
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
    return new Response("Only YouTube URLs are supported.", { status: 400 });
  }

  if (!FORMAT_ID_RE.test(formatId)) {
    return new Response("Invalid format ID.", { status: 400 });
  }

  const sanitizedTitle = title.replace(/[^\w\s\-]/g, "").trim() || "youtube-download";
  const isAudioOnly = !merge && (
    formatId.includes("audio") || formatId.endsWith("a") || parseInt(formatId, 10) > 600
  );
  const ext = isAudioOnly ? "m4a" : "mp4";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (name: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(sseEvent(name, data))); } catch { /* closed */ }
      };

      let tmpDir: string | null = null;
      let proc: ReturnType<typeof spawn> | null = null;

      try {
        tmpDir = await mkdtemp(join(tmpdir(), "ytdl-"));
        const outPath = resolve(join(tmpDir, `output.${ext}`));

        // Build yt-dlp args
        const ytArgs: string[] = [...YTDLP_BASE_ARGS, "--no-playlist", "--newline", "--progress"];

        if (merge) {
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

        // Parse progress from stderr
        let stderrBuf = "";
        proc.stderr?.on("data", (chunk: Buffer) => {
          stderrBuf += chunk.toString("utf8");
          const lines = stderrBuf.split("\n");
          stderrBuf = lines.pop() ?? "";
          for (const line of lines) {
            const evt = parseLine(line);
            if (evt) send("progress", evt);
          }
        });

        const exitCode = await new Promise<number>((res, rej) => {
          proc!.on("close", (code) => res(code ?? 1));
          proc!.on("error", rej);
        });

        if (exitCode !== 0) {
          send("error", { message: `yt-dlp exited with code ${exitCode}` });
          controller.close();
          if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          return;
        }

        // File is ready — register token and tell the client
        const { size } = await stat(outPath);
        const token = registerToken(outPath, tmpDir);

        send("ready", {
          token,
          filename: `${sanitizedTitle}.${ext}`,
          sizeMb: (size / 1024 / 1024).toFixed(1),
          mimeType: isAudioOnly ? "audio/mp4" : "video/mp4",
        });

        controller.close();
      } catch (err) {
        proc?.kill("SIGTERM");
        if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        send("error", { message: err instanceof Error ? err.message : "Unknown error" });
        controller.close();
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
