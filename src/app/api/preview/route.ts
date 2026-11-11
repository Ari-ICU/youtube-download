import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { mkdtemp, readdir, rm, stat } from "fs/promises";
import { createReadStream } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  YTDLP,
  FORMAT_ID_RE,
  isAllowedUrl,
  buildYtDlpArgs,
  buildMergeFormatSelector,
} from "@/utils/ytdlp-server";

const execFileAsync = promisify(execFile);

/** Write a temp clip (with optional section cut) and return readable stream + size. */
async function buildMergedClip(
  decodedUrl: string,
  formatSelector: string,
  sectionArg: string | null,
  tmpDir: string
): Promise<{ nodeStream: ReturnType<typeof createReadStream>; size: number }> {
  const outTemplate = resolve(join(tmpDir, "preview.%(ext)s"));
  const expectedOutPath = resolve(join(tmpDir, "preview.mp4"));

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

  let finalPath = expectedOutPath;
  try {
    await stat(finalPath);
  } catch {
    const files = await readdir(tmpDir);
    const candidate = files.find(
      (f) => f.startsWith("preview.") && !f.endsWith(".part") && !f.endsWith(".ytdl")
    );
    if (!candidate) throw new Error("Preview clip output file not found.");
    finalPath = resolve(join(tmpDir, candidate));
  }

  const { size } = await stat(finalPath);
  return { nodeStream: createReadStream(finalPath), size };
}

function makeReadable(
  nodeStream: ReturnType<typeof createReadStream>,
  tmpDir: string
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

    if (isClip) {
      tmpDir = await mkdtemp(join(tmpdir(), "ytpreview-"));

      const formatSelector = buildMergeFormatSelector(formatId);

      const { nodeStream, size } = await buildMergedClip(
        decodedUrl,
        formatSelector,
        "*0:00-0:30",
        tmpDir
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

    const { stdout } = await execFileAsync(
      YTDLP,
      [...buildYtDlpArgs(decodedUrl), "--get-url", "--no-playlist", "-f", formatId, decodedUrl],
      { maxBuffer: 1 * 1024 * 1024, timeout: 15_000 }
    );

    const streamUrl = stdout.trim().split("\n")[0];
    if (!streamUrl || !streamUrl.startsWith("https://")) {
      return Response.json({ error: "Could not resolve stream URL." }, { status: 500 });
    }

    const rangeHeader = request.headers.get("range");
    const upstreamHeaders: HeadersInit = {
      "User-Agent": "Mozilla/5.0 (compatible; MediaPreview/1.0)",
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
