import { spawn } from "child_process";
import { createReadStream, promises as fsp } from "fs";
import { tmpdir } from "os";
import path from "path";

const YTDLP = "yt-dlp";

/**
 * Resolves the file size for a given format by running:
 *   yt-dlp --print "%(filesize,filesize_approx)s" -f <formatId> <url>
 *
 * Returns the byte count, or null if yt-dlp cannot determine it.
 * Only used for single-stream (non-merge) downloads.
 */
function resolveFileSize(
  decodedUrl: string,
  formatId: string
): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(YTDLP, [
      "--no-playlist",
      "--print", "%(filesize,filesize_approx)s",
      "-f", formatId,
      decodedUrl,
    ]);

    let output = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.on("close", () => {
      const raw = output.trim();
      // yt-dlp prints "NA" when size is unknown
      if (!raw || raw === "NA" || raw === "None") return resolve(null);
      const bytes = parseInt(raw, 10);
      resolve(isNaN(bytes) || bytes <= 0 ? null : bytes);
    });

    proc.on("error", () => resolve(null));

    // Don't wait more than 8 s for the size lookup
    setTimeout(() => {
      proc.kill("SIGTERM");
      resolve(null);
    }, 8000);
  });
}

export async function GET(request: Request) {
  let ytdlpProcess: ReturnType<typeof spawn> | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const formatId = searchParams.get("itag"); // format_id from yt-dlp
    const title = searchParams.get("title") ?? "video";

    if (!url || !formatId) {
      return new Response(
        JSON.stringify({ error: "url and itag (format_id) are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const decodedUrl = decodeURIComponent(url);

    // Sanitize filename (strip non-ASCII / special chars that break headers)
    const sanitizedTitle =
      title.replace(/[^\w\s\-]/g, "").trim() || "youtube-download";

    // Infer mime type from format_id: audio-only ids often contain 'audio' or end in 'a'
    const isLikelyAudio =
      formatId.includes("audio") ||
      formatId.endsWith("a") ||
      parseInt(formatId, 10) > 600; // heuristic: high format_ids are often audio

    const mimeType = isLikelyAudio ? "audio/mp4" : "video/mp4";
    const ext = isLikelyAudio ? "m4a" : "mp4";
    const filename = `${sanitizedTitle}.${ext}`;

    // ── Pre-flight: resolve file size so the client can show real-time progress ──
    const fileSize = await resolveFileSize(decodedUrl, formatId);

    const headers = new Headers({
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });

    // Only set Content-Length when we actually know the size.
    // Setting it to 0 / wrong value would break the browser download.
    if (fileSize) {
      headers.set("Content-Length", String(fileSize));
    }

    // We pass --no-part so yt-dlp writes directly to stdout.
    const args = [
      "--no-playlist",
      "-f", formatId,    // exact format requested
      "-o", "-",         // pipe to stdout
      "--no-part",
      decodedUrl,
    ];

    ytdlpProcess = spawn(YTDLP, args);

    // Collect stderr for error reporting
    const stderrChunks: Buffer[] = [];
    ytdlpProcess.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    // Stream yt-dlp stdout directly to the browser
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
            // Stream may already be closed; ignore further errors
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
