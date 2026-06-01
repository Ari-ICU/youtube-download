import { spawn } from "child_process";

const YTDLP = "yt-dlp";

// ─── Security: allowlist YouTube domains to prevent SSRF ─────────────────────
const ALLOWED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
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

// ─── Security: validate format IDs to prevent argument injection ──────────────
// yt-dlp format IDs are alphanumeric with +, -, /, . and at most 60 chars.
// The merge pattern "videoId+audioId" is also valid.
const FORMAT_ID_RE = /^[a-zA-Z0-9\-_.+/]{1,60}$/;

function isValidFormatId(id: string): boolean {
  return FORMAT_ID_RE.test(id);
}

export async function GET(request: Request) {
  let ytdlpProcess: ReturnType<typeof spawn> | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const formatId = searchParams.get("itag");
    const title = searchParams.get("title") ?? "video";
    // merge=true means the client wants yt-dlp to merge a video-only + best audio
    const merge = searchParams.get("merge") === "true";

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
    if (!isValidFormatId(formatId)) {
      return new Response(
        JSON.stringify({ error: "Invalid format ID." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Sanitize filename — strip everything except word chars, spaces, hyphens
    const sanitizedTitle =
      title.replace(/[^\w\s\-]/g, "").trim() || "youtube-download";

    // ── Determine output format ───────────────────────────────────────────────
    // merge mode: video-only stream + best available audio merged into mkv/mp4
    // audio mode: audio-only itag → m4a
    // normal mode: combined stream → mp4
    const isAudioOnly =
      !merge &&
      (formatId.includes("audio") ||
        formatId.endsWith("a") ||
        parseInt(formatId, 10) > 600);

    const mimeType = isAudioOnly ? "audio/mp4" : "video/mp4";
    const ext = isAudioOnly ? "m4a" : "mp4";
    const filename = `${sanitizedTitle}.${ext}`;

    const headers = new Headers({
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache",
    });

    // ── Build yt-dlp args ─────────────────────────────────────────────────────
    let args: string[];

    if (merge) {
      // For 4K / video-only adaptive streams: merge with best audio.
      // yt-dlp writes the merged file to a temp path then we stream it.
      // We use --merge-output-format mp4 and pipe via -o -
      // Note: merging requires ffmpeg; yt-dlp handles this transparently.
      args = [
        "--no-playlist",
        "-f", `${formatId}+bestaudio[ext=m4a]/bestaudio`,
        "--merge-output-format", "mp4",
        "-o", "-",
        "--no-part",
        decodedUrl,
      ];
    } else {
      args = [
        "--no-playlist",
        "-f", formatId,
        "-o", "-",
        "--no-part",
        decodedUrl,
      ];
    }

    ytdlpProcess = spawn(YTDLP, args);

    const stderrChunks: Buffer[] = [];
    ytdlpProcess.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
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
