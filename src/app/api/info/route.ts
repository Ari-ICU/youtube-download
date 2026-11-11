import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  YTDLP,
  isAllowedUrl,
  isFacebookUrl,
  isTikTokUrl,
  buildYtDlpArgs,
} from "@/utils/ytdlp-server";

const execFileAsync = promisify(execFile);

// ─── Quality label & resolution helpers ───────────────────────────────────────

function normalizeResolutionHeight(
  width?: number,
  height?: number,
  formatId?: string,
  formatNote?: string
): number {
  const w = width ?? 0;
  const h = height ?? 0;

  if (w > 0 && h > 0) {
    const longSide = Math.max(w, h);
    const shortSide = Math.min(w, h);

    if (longSide >= 7680 || shortSide >= 4320) return 4320;
    if (longSide >= 3840 || shortSide >= 2160) return 2160;
    if (longSide >= 2560 || shortSide >= 1440) return 1440;
    if (longSide >= 1920 || shortSide >= 1080) return 1080;
    if (longSide >= 1280 || shortSide >= 720) return 720;
    if (longSide >= 960 || shortSide >= 540) return 540;
    if (longSide >= 854 || shortSide >= 480) return 480;
    if (longSide >= 640 || shortSide >= 360) return 360;
    if (longSide >= 426 || shortSide >= 240) return 240;
    return shortSide;
  }

  if (h > 0) return h;

  const note = (formatNote ?? "").toLowerCase();
  const id = (formatId ?? "").toLowerCase();
  if (note.includes("2160") || note.includes("4k") || id.includes("2160")) return 2160;
  if (note.includes("1440") || note.includes("2k") || id.includes("1440")) return 1440;
  if (note.includes("1080") || id.includes("1080")) return 1080;
  if (note.includes("720") || id === "hd" || id.includes("hd")) return 720;
  if (note.includes("540") || id.includes("540")) return 540;
  if (note.includes("480") || id === "sd" || id.includes("sd")) return 480;
  if (note.includes("360") || id.includes("360")) return 360;
  return 0;
}

function heightToLabel(height: number): string {
  if (height >= 4320) return "8K (4320p)";
  if (height >= 2160) return "4K (2160p)";
  if (height >= 1440) return "2K (1440p)";
  if (height >= 1080) return "1080p";
  if (height >= 720)  return "720p";
  if (height >= 540)  return "540p";
  if (height >= 480)  return "480p";
  if (height >= 360)  return "360p";
  if (height >= 240)  return "240p";
  if (height > 0)     return `${height}p`;
  return "HD Video";
}

// Short root codec name: av01.x.x → av01, vp09.x → vp09, avc1.x → avc1
function shortCodec(raw: string | undefined | null): string | null {
  if (!raw || raw === "none") return null;
  const root = raw.split(".")[0].toLowerCase();
  if (root === "bytevc1" || root === "h265" || root === "hev1" || root === "hvc1") {
    return "hev1";
  }
  if (root === "h264" || root === "avc1" || root === "avc") {
    return "avc1";
  }
  if (root === "aac" || root === "mp4a") {
    return "mp4a";
  }
  return root;
}

// Codec preference rank for sorting — prefer H.264 (avc1) & HEVC for native
// QuickTime / universal hardware playback without transcoding overhead.
const VIDEO_CODEC_RANK: Record<string, number> = {
  avc1: 4,
  hev1: 3,
  vp09: 2,
  vp9:  2,
  av01: 1,
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
        { error: "Only YouTube, TikTok, and Facebook URLs are supported." },
        { status: 400 }
      );
    }

    // Dump all formats + video metadata as JSON.
    // execFile (not exec) prevents shell injection — args are passed as an array.
    const { stdout } = await execFileAsync(
      YTDLP,
      [...buildYtDlpArgs(decodedUrl), "--dump-json", "--no-playlist", decodedUrl],
      { maxBuffer: 15 * 1024 * 1024 }
    );

    const info = JSON.parse(stdout);

    // Build thumbnail — prefer the highest resolution entry
    const thumbnails: { url: string; width?: number; preference?: number }[] =
      info.thumbnails ?? [];
    const bestThumb =
      info.thumbnail ??
      thumbnails.sort(
        (a, b) =>
          (b.width ?? 0) - (a.width ?? 0) ||
          (b.preference ?? 0) - (a.preference ?? 0)
      )[0]?.url ??
      (info.id ? `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg` : "/logo.png");

    const details = {
      videoId: info.id ?? "video",
      title: info.title || info.fulltitle || `${info.uploader ?? "Media"} Video`,
      author: info.uploader ?? info.channel ?? info.creator ?? "Unknown Creator",
      authorUrl: info.uploader_url ?? info.channel_url ?? info.webpage_url ?? "",
      thumbnail: bestThumb,
      duration: Math.round(info.duration ?? 0),
      views: info.view_count ?? 0,
      description: info.description ?? "",
    };

    // ── Raw format normalisation ──────────────────────────────────────────────
    const rawFormats: {
      format_id: string;
      ext?: string;
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

    const isFb = isFacebookUrl(decodedUrl);
    const isTt = isTikTokUrl(decodedUrl);

    const mapped: MappedFormat[] = rawFormats
      .filter((f) => {
        const proto = f.protocol ?? "";
        if (proto === "mhtml") return false;
        // Skip TikTok unplayable proprietary H.266 (bytevc2) streams
        if (f.vcodec === "bytevc2" || (f.format_note ?? "").includes("UNPLAYABLE")) {
          return false;
        }
        // Skip HLS m3u8 formats on YouTube where direct HTTPS/DASH streams exist
        if (proto.includes("m3u8") && !isFb && !isTt) return false;

        const vNone = f.vcodec === "none";
        const aNone = f.acodec === "none";
        if (vNone && aNone) return false;

        return true;
      })
      .map((f) => {
        const vExplicitNone = f.vcodec === "none";
        const aExplicitNone = f.acodec === "none";
        const bothMissing = !f.vcodec && !f.acodec;

        const hasVideo = bothMissing ? true : !vExplicitNone && !!(f.vcodec || (f.height ?? 0) > 0 || isFb || isTt);
        const hasAudio = bothMissing ? true : !aExplicitNone && !!(f.acodec || isFb || isTt);

        const height = hasVideo
          ? normalizeResolutionHeight(f.width, f.height, f.format_id, f.format_note)
          : 0;
        const vc = shortCodec(f.vcodec) ?? (hasVideo && (isFb || isTt) ? "avc1" : null);
        const ac = shortCodec(f.acodec) ?? (hasAudio && (isFb || isTt) ? "mp4a" : null);
        const vbr = f.vbr ?? (hasVideo ? (f.tbr ?? null) : null);

        const isWatermarked = (f.format_note ?? "").toLowerCase().includes("watermark");
        const baseLabel = hasVideo
          ? heightToLabel(height)
          : f.abr
          ? `${Math.round(f.abr)}kbps`
          : "Audio";
        const qualityLabel = isWatermarked ? `${baseLabel} (WM)` : baseLabel;

        const container = f.ext ?? (hasVideo ? "mp4" : "m4a");

        return {
          itag: f.format_id,
          qualityLabel,
          container,
          hasVideo,
          hasAudio,
          mimeType: hasVideo ? `video/${container}` : `audio/${container}`,
          contentLength: f.filesize ?? f.filesize_approx ?? null,
          fps: f.fps ? Math.round(f.fps) : null,
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
    const audioBuckets = new Map<BucketKey, MappedFormat>();

    for (const f of mapped) {
      if (f.hasVideo && f.hasAudio) {
        // Group combined formats by height + codec + watermark status
        const isWm = f.qualityLabel.includes("(WM)");
        const key = `combined|${f.height}|${f.vcodec ?? "avc1"}|${isWm ? "wm" : "clean"}`;
        const existing = combinedBuckets.get(key);
        if (
          !existing ||
          (f.vbr ?? 0) > (existing.vbr ?? 0) ||
          (f.contentLength ?? 0) > (existing.contentLength ?? 0)
        ) {
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

    // ── Ensure 4K (2160p) & 2K (1440p) options are always reachable ───────────
    // When a video's native upload maxes out below 4K (e.g., 1080p episodes on
    // YouTube, or TikTok/Facebook streams), synthesize 4K (2160p) and 2K (1440p)
    // Ultra HD formats backed by the highest-quality native video stream so the
    // downloader can remux + upscale to 3840×2160 / 2560×1440 via FFmpeg.
    const videoFormats = deduped.filter((f) => f.hasVideo && !f.qualityLabel.includes("(WM)"));
    const hasNative4K = videoFormats.some((f) => f.height >= 2160);
    const hasNative2K = videoFormats.some((f) => f.height >= 1440 && f.height < 2160);

    if (videoFormats.length > 0 && (!hasNative4K || !hasNative2K)) {
      // Prefer the highest-resolution H.264 (avc1) stream as the upscale source
      // for fast decoding, or fall back to the highest-resolution video stream.
      const maxNativeHeight = Math.max(...videoFormats.map((f) => f.height));
      const topHeightVideos = videoFormats.filter((f) => f.height === maxNativeHeight);
      const bestSource =
        topHeightVideos.find((f) => f.vcodec === "avc1") ??
        topHeightVideos.sort((a, b) => (b.vbr ?? 0) - (a.vbr ?? 0))[0] ??
        videoFormats[0];

      const baseVbr = bestSource.vbr ?? 2800;
      const baseSize = bestSource.contentLength;

      if (!hasNative4K) {
        deduped.push({
          itag: `${bestSource.itag}-4k`,
          qualityLabel: "4K (2160p)",
          container: "mp4",
          hasVideo: true,
          hasAudio: false,
          mimeType: "video/mp4",
          contentLength: baseSize ? Math.round(baseSize * 2.4) : null,
          fps: bestSource.fps,
          height: 2160,
          vcodec: "avc1",
          acodec: "mp4a",
          vbr: Math.max(Math.round(baseVbr * 2.8), 12000),
        });
      }

      if (!hasNative2K && maxNativeHeight < 1440) {
        deduped.push({
          itag: `${bestSource.itag}-2k`,
          qualityLabel: "2K (1440p)",
          container: "mp4",
          hasVideo: true,
          hasAudio: false,
          mimeType: "video/mp4",
          contentLength: baseSize ? Math.round(baseSize * 1.6) : null,
          fps: bestSource.fps,
          height: 1440,
          vcodec: "avc1",
          acodec: "mp4a",
          vbr: Math.max(Math.round(baseVbr * 1.8), 6500),
        });
      }
    }

    // ── Final sort: Highest video resolution first (4K -> 2K -> 1080p -> ...), then Audio ──
    const formats = deduped.sort((a, b) => {
      // Video formats always come before audio-only formats
      if (a.hasVideo !== b.hasVideo) return a.hasVideo ? -1 : 1;

      if (a.hasVideo) {
        // 1. Resolution height descending (4K 2160p first!)
        const hDiff = (b.height ?? 0) - (a.height ?? 0);
        if (hDiff !== 0) return hDiff;
        // 2. Non-watermarked before watermarked
        const wmA = a.qualityLabel.includes("(WM)") ? 1 : 0;
        const wmB = b.qualityLabel.includes("(WM)") ? 1 : 0;
        if (wmA !== wmB) return wmA - wmB;
        // 3. Frame rate descending (60fps before 30fps)
        const fpsDiff = (b.fps ?? 0) - (a.fps ?? 0);
        if (fpsDiff !== 0) return fpsDiff;
        // 4. Codec preference (AV1 > VP9 > HEVC > H.264)
        const cDiff = videoCodecRank(b.vcodec) - videoCodecRank(a.vcodec);
        if (cDiff !== 0) return cDiff;
        // 5. Combined video+audio slightly preferred at identical resolution/codec
        if (a.hasAudio !== b.hasAudio) return a.hasAudio ? -1 : 1;
        // 6. Bitrate descending
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
    if (
      rawMsg.includes("only available for registered users") ||
      rawMsg.includes("login required") ||
      rawMsg.includes("Log in for access")
    ) {
      msg = "This video requires account sign-in or is not publicly accessible.";
    }
    console.error("Error in /api/info:", rawMsg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
