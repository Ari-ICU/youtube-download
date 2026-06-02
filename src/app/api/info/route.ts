import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const YTDLP = "yt-dlp";

// Use web + android + android_vr clients:
// - web/android: broad compatibility, works for region-restricted & low-format videos
// - android_vr:  unlocks 1440p/2160p (4K) adaptive streams that other clients omit
const YTDLP_BASE_ARGS = [
  "--extractor-args", "youtube:player_client=web,android,android_vr",
  "--no-warnings",
];

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
    // Only allow https
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }

    const decodedUrl = decodeURIComponent(url);

    // ── Security: reject non-YouTube URLs ──────────────────────────────────────
    if (!isAllowedUrl(decodedUrl)) {
      return NextResponse.json(
        { error: "Only YouTube URLs are supported." },
        { status: 400 }
      );
    }

    // Dump all formats + video metadata as JSON.
    // execFile (not exec) prevents shell injection — args are passed as an array.
    const { stdout } = await execFileAsync(
      YTDLP,
      [...YTDLP_BASE_ARGS, "--dump-json", "--no-playlist", decodedUrl],
      { maxBuffer: 10 * 1024 * 1024 } // 10 MB cap
    );

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
        // Skip HLS manifests and storyboards — keep HTTP/HTTPS and DASH
        if (f.protocol && f.protocol.includes("m3u8")) return false;
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
          // Expose height so the client can sort/filter by resolution
          height,
          // Short codec identifiers for display
          vcodec: hasVideo ? (f.vcodec?.split(".")[0] ?? null) : null,
          acodec: hasAudio ? (f.acodec?.split(".")[0] ?? null) : null,
        };
      })
      // Sort: combined first, then video-only (highest res first), then audio-only
      .sort((a, b) => {
        const tier = (f: typeof a) =>
          f.hasVideo && f.hasAudio ? 3 : f.hasVideo ? 2 : 1;
        if (tier(b) !== tier(a)) return tier(b) - tier(a);
        return (b.height ?? 0) - (a.height ?? 0);
      });

    return NextResponse.json({ details, formats });
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : "Failed to retrieve video information.";
    console.error("Error in /api/info:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
