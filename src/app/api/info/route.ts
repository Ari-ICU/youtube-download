import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const YTDLP = "yt-dlp";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }

    const decodedUrl = decodeURIComponent(url);

    // Dump all formats + video metadata as JSON
    const { stdout } = await execFileAsync(YTDLP, [
      "--dump-json",
      "--no-playlist",
      decodedUrl,
    ]);

    const info = JSON.parse(stdout);

    // Build thumbnail — prefer the highest resolution entry
    const thumbnails: { url: string; width?: number }[] = info.thumbnails ?? [];
    const thumbnail =
      thumbnails.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
      `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg`;

    const details = {
      videoId: info.id,
      title: info.title,
      author: info.uploader ?? info.channel ?? "Unknown Channel",
      authorUrl: info.uploader_url ?? info.channel_url ?? "",
      thumbnail,
      duration: Math.round(info.duration ?? 0),
      views: info.view_count ?? 0,
      description: info.description ?? "",
    };

    // Map yt-dlp format objects → our VideoFormat shape
    const rawFormats: {
      format_id: string;
      ext: string;
      vcodec?: string;
      acodec?: string;
      height?: number;
      width?: number;
      fps?: number;
      filesize?: number;
      filesize_approx?: number;
      abr?: number;
      vbr?: number;
      format_note?: string;
      protocol?: string;
    }[] = info.formats ?? [];

    const formats = rawFormats
      .filter((f) => {
        // Skip storyboard, dash manifests, etc.
        if (f.protocol && (f.protocol.includes("m3u8") || f.protocol.includes("dash"))) return false;
        const hasVideo = f.vcodec && f.vcodec !== "none";
        const hasAudio = f.acodec && f.acodec !== "none";
        return hasVideo || hasAudio;
      })
      .map((f) => {
        const hasVideo = !!(f.vcodec && f.vcodec !== "none");
        const hasAudio = !!(f.acodec && f.acodec !== "none");
        const height = f.height ?? 0;
        const qualityLabel = hasVideo
          ? `${height}p`
          : f.abr
          ? `${Math.round(f.abr)}kbps`
          : "Audio";

        return {
          // We use format_id as the "itag" equivalent
          itag: f.format_id,
          qualityLabel,
          container: f.ext ?? "mp4",
          hasVideo,
          hasAudio,
          mimeType: hasVideo
            ? `video/${f.ext ?? "mp4"}`
            : `audio/${f.ext ?? "m4a"}`,
          contentLength: f.filesize ?? f.filesize_approx ?? null,
          fps: f.fps ?? null,
        };
      })
      // Sort: combined first (video+audio), then video-only, then audio-only; by quality desc
      .sort((a, b) => {
        const score = (f: typeof a) =>
          (f.hasVideo && f.hasAudio ? 300 : f.hasVideo ? 200 : 100) +
          parseInt(f.qualityLabel) || 0;
        return score(b) - score(a);
      });

    return NextResponse.json({ details, formats });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to retrieve video information.";
    console.error("Error in /api/info:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
