import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, stat } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);
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

function getYtDlpArgs(): string[] {
  const args = [...YTDLP_BASE_ARGS];
  const cookiesPath = join(process.cwd(), "cookies.txt");
  if (existsSync(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  }
  return args;
}

// ─── Security: allowlist YouTube domains ─────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Write a temp clip (with optional section cut) and return readable stream + size. */
async function buildMergedClip(
  decodedUrl: string,
  formatSelector: string,
  sectionArg: string | null,
  tmpDir: string,
): Promise<{ nodeStream: ReturnType<typeof createReadStream>; size: number }> {
  const outPath = join(tmpDir, "preview.mp4");

  await new Promise<void>((resolve, reject) => {
    const args = [
      ...getYtDlpArgs(),
      "--no-playlist",
      "-f", formatSelector,
      "--merge-output-format", "mp4",
      "-o", outPath,
      "--no-part",
    ];
    if (sectionArg) args.push("--download-sections", sectionArg);
    args.push(decodedUrl);

    const proc = spawn(YTDLP, args);
    const errChunks: Buffer[] = [];
    proc.stderr?.on("data", (c: Buffer | string) =>
      errChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    );
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited ${code}: ${Buffer.concat(errChunks).toString().slice(0, 500)}`));
    });
    proc.on("error", reject);
  });

  const { size } = await stat(outPath);
  return { nodeStream: createReadStream(outPath), size };
}

function makeReadable(
  nodeStream: ReturnType<typeof createReadStream>,
  tmpDir: string,
): ReadableStream {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        controller.enqueue(new Uint8Array(buf));
      });
      nodeStream.on("end", () => {
        controller.close();
        rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      });
      nodeStream.on("error", (err) => {
        controller.error(err);
        rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      });
    },
    cancel() {
      nodeStream.destroy();
      rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    },
  });
}

export async function GET(request: Request) {
  let tmpDir: string | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const url       = searchParams.get("url");
    const formatId  = searchParams.get("itag") ?? "18";
    // clip=true  → adaptive stream, grab first 30s and merge (quality preview clip)
    // clip=false → combined stream, proxy directly (instant, no muxing)
    const isClip    = searchParams.get("clip") === "true";

    if (!url) {
      return Response.json({ error: "url is required" }, { status: 400 });
    }

    const decodedUrl = decodeURIComponent(url);

    if (!isAllowedUrl(decodedUrl)) {
      return Response.json({ error: "Only YouTube, WeTV, and Instagram URLs are supported." }, { status: 400 });
    }

    if (!FORMAT_ID_RE.test(formatId)) {
      return Response.json({ error: "Invalid format ID." }, { status: 400 });
    }

    // ── Clip path: adaptive (video-only) format — grab 30s, merge audio, stream ─
    // Used when the user wants to preview a high-res format that has no combined
    // stream. We cut to 30s so the merge completes in ~5-10 seconds instead of
    // processing the whole file.
    if (isClip) {
      tmpDir = await mkdtemp(join(tmpdir(), "ytpreview-"));

      const formatSelector =
        `${formatId}+bestaudio[ext=m4a]/` +
        `${formatId}+bestaudio/` +
        `bestvideo+bestaudio[ext=m4a]/` +
        `bestvideo+bestaudio/best`;

      const { nodeStream, size } = await buildMergedClip(
        decodedUrl,
        formatSelector,
        "*0:00-0:30",   // first 30 seconds only
        tmpDir,
      );

      return new Response(makeReadable(nodeStream, tmpDir), {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "X-Preview-Clip": "true",
        },
      });
    }

    // ── Direct proxy path: combined (video+audio) stream ─────────────────────
    // Resolve the direct stream URL server-side then proxy it back.
    // We cannot give the browser the raw googlevideo.com URL — it's IP-locked
    // and CORS-blocked.
    const { stdout } = await execFileAsync(
      YTDLP,
      [...getYtDlpArgs(), "--get-url", "--no-playlist", "-f", formatId, decodedUrl],
      { maxBuffer: 1 * 1024 * 1024, timeout: 15_000 }
    );

    const streamUrl = stdout.trim().split("\n")[0];
    if (!streamUrl || !streamUrl.startsWith("https://")) {
      return Response.json({ error: "Could not resolve stream URL." }, { status: 500 });
    }

    // Forward Range header so the browser can seek
    const rangeHeader = request.headers.get("range");
    const upstreamHeaders: HeadersInit = {
      "User-Agent": "Mozilla/5.0 (compatible; YouTubePreview/1.0)",
    };
    if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

    const upstream = await fetch(streamUrl, { headers: upstreamHeaders });

    const responseHeaders = new Headers();
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(h);
      if (v) responseHeaders.set(h, v);
    }
    responseHeaders.set("Cache-Control", "no-store");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });

  } catch (error: unknown) {
    if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    const msg = error instanceof Error ? error.message : "Failed to get preview.";
    console.error("Error in /api/preview:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
