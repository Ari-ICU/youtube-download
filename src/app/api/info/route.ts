import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { YTDLP, isAllowedUrl, buildYtDlpArgs } from "@/utils/ytdlp-server";

const execFileAsync = promisify(execFile);

// ─── Quality label helpers ────────────────────────────────────────────────────

function heightToLabel(height: number): string {
  if (height >= 2160) return "4K (2160p)";
  if (height >= 1440) return "2K (1440p)";
  if (height >= 1080) return "1080p";
  if (height >= 720)  return "720p";
  if (height >= 480)  return "480p";
  if (height >= 360)  return "360p";
  if (height >= 240)  return "240p";
  return `${height}p`;
}

// Short root codec name: av01.x.x → av01, vp09.x → vp09, avc1.x → avc1
function shortCodec(raw: string | undefined | null): string | null {
  if (!raw || raw === "none") return null;
  return raw.split(".")[0];
}

// Codec preference rank for deduplication — higher = preferred
// We prefer: av01 > vp09 > avc1 for video; mp4a > opus for audio
const VIDEO_CODEC_RANK: Record<string, number> = {
  av01: 3,
  vp09: 2,
  vp9:  2,
  avc1: 1,
  avc:  1,
};
const AUDIO_CODEC_RANK: Record<string, number> = {
  mp4a: 2,
  opus: 1,
};

function videoCodecRank(codec: string | null): number {
  return VIDEO_CODEC_RANK[codec ?? ""] ?? 0;
}
function audioCodecRank(codec: string | null): number {
  return AUDIO_CODEC_RANK[codec ?? ""] ?? 0;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "Video URL is required" }, { status: 400 });
    }

    const decodedUrl = decodeURIComponent(url);

    // ── Security: reject non-allowlisted URLs ────────────────────────────────
    if (!isAllowedUrl(decodedUrl)) {
      return NextResponse.json(
        { error: "This URL is not supported by the whitelist configuration." },
        { status: 400 }
      );
    }

    // Dump all formats + video metadata as JSON.
    // execFile (not exec) prevents shell injection — args are passed as an array.
    const { stdout } = await execFileAsync(
      YTDLP,
      [...buildYtDlpArgs(decodedUrl), "--dump-json", "--no-playlist", decodedUrl],
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

    // ── Raw format normalisation ──────────────────────────────────────────────
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
      tbr?: number;
      format_note?: string;
      protocol?: string;
    }[] = info.formats ?? [];

    type MappedFormat = {
      itag: string;
      qualityLabel: string;
      container: string;
      hasVideo: boolean;
      hasAudio: boolean;
      mimeType: string;
      contentLength: number | null;
      fps: number | null;
      height: number;
      vcodec: string | null;
      acodec: string | null;
      vbr: number | null;
    };

    const isWeTvUrl = decodedUrl.includes("wetv.vip");
    const isBilibiliTvUrl = decodedUrl.includes("bilibili.tv");
    const isXUrl = decodedUrl.includes("x.com") || decodedUrl.includes("twitter.com");
    const isHlsSite = isWeTvUrl || isBilibiliTvUrl || isXUrl;

    const mapped: MappedFormat[] = rawFormats
      .filter((f) => {
        const proto = f.protocol ?? "";
        if (proto === "mhtml") return false;
        if (proto.includes("m3u8") && !isHlsSite) return false;
        const hasVideo = f.vcodec && f.vcodec !== "none";
        const hasAudio = f.acodec && f.acodec !== "none";
        return !!(hasVideo || hasAudio || isHlsSite);
      })
      .map((f) => {
        const hasVideo = isHlsSite ? true : !!(f.vcodec && f.vcodec !== "none");
        const hasAudio = isHlsSite ? true : !!(f.acodec && f.acodec !== "none");
        const height = f.height ?? 0;
        const vc = shortCodec(f.vcodec);
        const ac = shortCodec(f.acodec);
        const vbr = f.vbr ?? (hasVideo && !hasAudio ? (f.tbr ?? null) : null);

        const qualityLabel = (isHlsSite && f.format_note)
          ? f.format_note
          : hasVideo
          ? heightToLabel(height)
          : f.abr
          ? `${Math.round(f.abr)}kbps`
          : "Audio";

        return {
          itag: f.format_id,
          qualityLabel,
          container: f.ext ?? "mp4",
          hasVideo,
          hasAudio,
          mimeType: hasVideo ? `video/${f.ext ?? "mp4"}` : `audio/${f.ext ?? "m4a"}`,
          contentLength: f.filesize ?? f.filesize_approx ?? null,
          fps: f.fps ?? null,
          height,
          vcodec: vc,
          acodec: ac,
          vbr: vbr ? Math.round(vbr) : null,
        };
      });

    // ── Deduplication ─────────────────────────────────────────────────────────
    type BucketKey = string;

    function videoBucketKey(f: MappedFormat): BucketKey {
      return `video|${f.height}|${f.fps ?? 0}|${f.vcodec ?? "?"}`;
    }
    function audioBucketKey(f: MappedFormat): BucketKey {
      return `audio|${f.acodec ?? "?"}`;
    }

    const videoBuckets = new Map<BucketKey, MappedFormat>();
    const combinedBuckets = new Map<BucketKey, MappedFormat>();
    const audioBuckets   = new Map<BucketKey, MappedFormat>();

    for (const f of mapped) {
      if (f.hasVideo && f.hasAudio) {
        const key = `combined|${f.height}|${f.container}`;
        const existing = combinedBuckets.get(key);
        if (!existing || (f.vbr ?? 0) > (existing.vbr ?? 0)) {
          combinedBuckets.set(key, f);
        }
      } else if (f.hasVideo) {
        const key = videoBucketKey(f);
        const existing = videoBuckets.get(key);
        if (!existing || (f.vbr ?? 0) > (existing.vbr ?? 0)) {
          videoBuckets.set(key, f);
        }
      } else if (f.hasAudio) {
        const key = audioBucketKey(f);
        const existing = audioBuckets.get(key);
        if (!existing || (f.contentLength ?? 0) > (existing.contentLength ?? 0)) {
          audioBuckets.set(key, f);
        }
      }
    }

    const deduped: MappedFormat[] = [
      ...combinedBuckets.values(),
      ...videoBuckets.values(),
      ...audioBuckets.values(),
    ];

    // ── Final sort ────────────────────────────────────────────────────────────
    const formats = deduped.sort((a, b) => {
      const tierA = a.hasVideo && a.hasAudio ? 3 : a.hasVideo ? 2 : 1;
      const tierB = b.hasVideo && b.hasAudio ? 3 : b.hasVideo ? 2 : 1;
      if (tierB !== tierA) return tierB - tierA;
      if (a.hasVideo) {
        const hDiff = (b.height ?? 0) - (a.height ?? 0);
        if (hDiff !== 0) return hDiff;
        const fpsDiff = (b.fps ?? 0) - (a.fps ?? 0);
        if (fpsDiff !== 0) return fpsDiff;
        const cDiff = videoCodecRank(b.vcodec) - videoCodecRank(a.vcodec);
        if (cDiff !== 0) return cDiff;
        return (b.vbr ?? 0) - (a.vbr ?? 0);
      }
      const cDiff = audioCodecRank(b.acodec) - audioCodecRank(a.acodec);
      if (cDiff !== 0) return cDiff;
      return (b.contentLength ?? 0) - (a.contentLength ?? 0);
    });

    return NextResponse.json({ details, formats });
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    let msg = rawMsg;
    if (rawMsg.includes("instagram") && (rawMsg.includes("Unable to extract data") || rawMsg.includes("login") || rawMsg.includes("cookies"))) {
      msg = "Instagram could not return public metadata for this URL. Make sure it is a direct link to a public reel or post.";
    } else if (rawMsg.includes("only available for registered users") || rawMsg.includes("login required")) {
      msg = "This video requires account sign-in or is not publicly accessible.";
    }
    console.error("Error in /api/info:", rawMsg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
