import { execFile, spawn } from "child_process";
import { createHash } from "crypto";
import { promisify } from "util";
import { mkdir, readdir, stat } from "fs/promises";
import { createReadStream } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  YTDLP,
  FORMAT_ID_RE,
  isAllowedUrl,
  isTikTokUrl,
  buildYtDlpArgs,
  buildMergeFormatSelector,
  parseUpscaleFormatId,
} from "@/utils/ytdlp-server";

const execFileAsync = promisify(execFile);

const PREVIEW_CACHE_DIR = join(tmpdir(), "anivora-preview-cache");
const inFlightBuilds = new Map<string, Promise<string>>();

/** Serve a local MP4 file with full HTTP Range (206 Partial Content) support for HTML5 <video>. */
async function serveFileWithRange(
  filePath: string,
  rangeHeader: string | null,
  isClip = false
): Promise<Response> {
  const { size } = await stat(filePath);

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;

      if (start >= 0 && start < size && start <= end) {
        const chunkLength = end - start + 1;
        const nodeStream = createReadStream(filePath, { start, end });
        const readable = new ReadableStream({
          start(controller) {
            nodeStream.on("data", (chunk: Buffer | string) => {
              const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              controller.enqueue(new Uint8Array(buf));
            });
            nodeStream.on("end", () => controller.close());
            nodeStream.on("error", (err) => controller.error(err));
          },
          cancel() {
            nodeStream.destroy();
          },
        });

        return new Response(readable, {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(chunkLength),
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=300",
            ...(isClip ? { "X-Preview-Clip": "true" } : {}),
          },
        });
      }
    }
  }

  const nodeStream = createReadStream(filePath);
  const readable = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        controller.enqueue(new Uint8Array(buf));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
      ...(isClip ? { "X-Preview-Clip": "true" } : {}),
    },
  });
}

/** Build or reuse a cached MP4 file for reliable HTML5 <video> playback and scrubbing. */
async function getOrBuildCachedFile(
  decodedUrl: string,
  formatSelector: string,
  sectionArg: string | null,
  cacheKey: string
): Promise<string> {
  await mkdir(PREVIEW_CACHE_DIR, { recursive: true });
  const expectedPath = resolve(join(PREVIEW_CACHE_DIR, `${cacheKey}.mp4`));

  try {
    const st = await stat(expectedPath);
    if (st.size > 0) return expectedPath;
  } catch {
    /* not cached yet */
  }

  const existingPromise = inFlightBuilds.get(cacheKey);
  if (existingPromise) return existingPromise;

  const buildPromise = (async () => {
    try {
      const outTemplate = resolve(join(PREVIEW_CACHE_DIR, `${cacheKey}.%(ext)s`));
      await new Promise<void>((resolvePromise, rejectPromise) => {
        const args = [
          ...buildYtDlpArgs(decodedUrl),
          "--no-playlist",
          "-f",
          formatSelector,
          "--merge-output-format",
          "mp4",
          "--remux-video",
          "mp4",
          "--postprocessor-args",
          "Merger+ffmpeg_o:-movflags +faststart",
          "-o",
          outTemplate,
        ];
        if (sectionArg) args.push("--download-sections", sectionArg);
        args.push(decodedUrl);

        const proc = spawn(YTDLP, args);
        proc.stdout?.on("data", () => {});
        const errChunks: Buffer[] = [];
        proc.stderr?.on("data", (c: Buffer | string) =>
          errChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
        );
        proc.on("close", (code) => {
          if (code === 0) resolvePromise();
          else
            rejectPromise(
              new Error(`yt-dlp exited ${code}: ${Buffer.concat(errChunks).toString().slice(0, 500)}`)
            );
        });
        proc.on("error", rejectPromise);
      });

      try {
        await stat(expectedPath);
        return expectedPath;
      } catch {
        const files = await readdir(PREVIEW_CACHE_DIR);
        const candidate = files.find(
          (f) => f.startsWith(`${cacheKey}.`) && !f.endsWith(".part") && !f.endsWith(".ytdl")
        );
        if (!candidate) throw new Error("Preview output file not found.");
        return resolve(join(PREVIEW_CACHE_DIR, candidate));
      }
    } finally {
      inFlightBuilds.delete(cacheKey);
    }
  })();

  inFlightBuilds.set(cacheKey, buildPromise);
  return buildPromise;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url      = searchParams.get("url");
    const formatId = searchParams.get("itag") ?? "18";
    const isClip   = searchParams.get("clip") === "true";

    if (!url) {
      return Response.json({ error: "url is required" }, { status: 400 });
    }

    const decodedUrl = decodeURIComponent(url);

    if (!isAllowedUrl(decodedUrl)) {
      return Response.json(
        { error: "Only YouTube, TikTok, and Facebook URLs are supported." },
        { status: 400 }
      );
    }

    if (!FORMAT_ID_RE.test(formatId)) {
      return Response.json({ error: "Invalid format ID." }, { status: 400 });
    }

    const rangeHeader = request.headers.get("range");
    const { rawFormatId } = parseUpscaleFormatId(formatId);
    const cacheKey = createHash("sha1")
      .update(`${decodedUrl}|${rawFormatId}|${isClip ? "clip" : "full"}`)
      .digest("hex")
      .slice(0, 24);

    // 1. Adaptive clip or TikTok stream (TikTok CDN requires yt-dlp's session cookies)
    if (isClip || isTikTokUrl(decodedUrl)) {
      const formatSelector = isClip
        ? buildMergeFormatSelector(rawFormatId)
        : `${rawFormatId}/best[ext=mp4]/best`;

      const filePath = await getOrBuildCachedFile(
        decodedUrl,
        formatSelector,
        isClip ? "*0:00-0:30" : null,
        cacheKey
      );
      return await serveFileWithRange(filePath, rangeHeader, isClip);
    }

    // 2. Direct combined stream (YouTube / Facebook): resolve URL + exact client headers
    try {
      const { stdout } = await execFileAsync(
        YTDLP,
        [
          ...buildYtDlpArgs(decodedUrl),
          "--dump-single-json",
          "--no-playlist",
          "-f",
          `${rawFormatId}/18/best[ext=mp4]/best`,
          decodedUrl,
        ],
        { maxBuffer: 10 * 1024 * 1024, timeout: 15_000 }
      );

      const info = JSON.parse(stdout);
      const streamUrl: string | undefined = info.url ?? info.requested_formats?.[0]?.url;
      const ytHeaders: Record<string, string> =
        info.http_headers ?? info.requested_formats?.[0]?.http_headers ?? {};

      // Only proxy directly if it's a single combined stream (not separate video+audio)
      if (streamUrl && streamUrl.startsWith("https://") && !info.requested_formats) {
        const upstreamHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(ytHeaders)) {
          if (typeof v === "string") upstreamHeaders[k] = v;
        }
        if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

        const upstream = await fetch(streamUrl, { headers: upstreamHeaders });
        if (upstream.ok || upstream.status === 206) {
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
        }
      }
    } catch {
      /* Fall through to cached file build */
    }

    // 3. Fallback: download/mux into cached file and serve with Range support
    const fallbackSelector = buildMergeFormatSelector(rawFormatId);
    const filePath = await getOrBuildCachedFile(decodedUrl, fallbackSelector, null, cacheKey);
    return await serveFileWithRange(filePath, rangeHeader, false);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to get preview.";
    console.error("Error in /api/preview:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
