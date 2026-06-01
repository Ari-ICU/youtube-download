import { spawn } from "child_process";

const YTDLP = "yt-dlp";

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

    // Determine extension from format_id heuristic: audio-only formats end in
    // 'a', 'm4a', 'webm', etc. We let yt-dlp decide and read the content-type.
    // We pass --no-part so yt-dlp writes directly to stdout.
    const args = [
      "--no-playlist",
      "-f", formatId,         // exact format requested
      "-o", "-",              // pipe to stdout
      "--no-part",
      decodedUrl,
    ];

    ytdlpProcess = spawn(YTDLP, args);

    // Collect stderr for error reporting
    const stderrChunks: Buffer[] = [];
    ytdlpProcess.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    // Infer mime type from format_id: audio-only ids often contain 'audio' or end in 'a'
    const isLikelyAudio =
      formatId.includes("audio") ||
      formatId.endsWith("a") ||
      parseInt(formatId, 10) > 600; // heuristic: high format_ids are often audio

    const mimeType = isLikelyAudio ? "audio/mp4" : "video/mp4";
    const ext = isLikelyAudio ? "m4a" : "mp4";
    const filename = `${sanitizedTitle}.${ext}`;

    const headers = new Headers({
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Transfer-Encoding": "chunked",
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
