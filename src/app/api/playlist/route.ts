import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

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

// ─── Security: allowlist YouTube domains to prevent SSRF ─────────────────────
const ALLOWED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
  "wetv.vip",
  "www.wetv.vip",
  "instagram.com",
  "www.instagram.com",
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

/**
 * Run yt-dlp with the given args and return stdout as a string.
 * Uses execFile (not exec) so args are never passed through a shell — no injection risk.
 */
function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      YTDLP,
      args,
      { maxBuffer: 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          if (stderr) console.error("[yt-dlp stderr]", stderr.slice(0, 500));
          reject(new Error(stderr?.trim() || err.message));
        } else {
          resolve(stdout);
        }
      }
    );
    proc.stderr?.on("data", (d: Buffer) => process.stderr.write(d));
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "Playlist URL is required" },
        { status: 400 }
      );
    }

    const decodedUrl = decodeURIComponent(url);

    // ── Security: reject non-YouTube URLs ─────────────────────────────────────
    if (!isAllowedUrl(decodedUrl)) {
      return NextResponse.json(
        { error: "Only YouTube, WeTV, and Instagram URLs are supported." },
        { status: 400 }
      );
    }

    const stdout = await runYtDlp([
      ...getYtDlpArgs(),
      "--flat-playlist",
      "--dump-single-json",
      decodedUrl,
    ]);

    const info = JSON.parse(stdout);

    const isWeTvUrl = decodedUrl.includes("wetv.vip");
    const isInstagramUrl = decodedUrl.includes("instagram.com");

    const entries: any[] = info.entries ?? [];

    const playlistThumb =
      info.thumbnail ??
      (entries[0]?.thumbnails ?? []).sort((a: { width?: number }, b: { width?: number }) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
      entries[0]?.thumbnail ??
      "";

    const videos = entries
      .map((e, index) => {
        const id = e.id ?? e.url?.split("/").pop() ?? `ep-${index + 1}`;
        const thumbs = e.thumbnails ?? [];
        const thumb =
          thumbs.sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
          e.thumbnail ??
          playlistThumb ??
          ((isWeTvUrl || isInstagramUrl) ? "" : `https://img.youtube.com/vi/${id}/mqdefault.jpg`);

        const videoTitle = e.title ?? (isWeTvUrl ? `Episode ${index + 1}` : isInstagramUrl ? `Instagram Video ${index + 1}` : `Video ${index + 1}`);
        const defaultUrl = isWeTvUrl
          ? `https://wetv.vip/en/play/${info.id}/${id}`
          : isInstagramUrl
          ? `https://www.instagram.com/p/${id}/`
          : `https://www.youtube.com/watch?v=${id}`;
        const videoUrl = e.url ?? defaultUrl;

        return {
          id,
          title: videoTitle,
          thumbnail: thumb,
          duration: Math.round(e.duration ?? 0),
          durationText: e.duration_string ?? "",
          author: e.uploader ?? e.channel ?? (isWeTvUrl ? (info.title ?? "WeTV") : isInstagramUrl ? (info.title ?? "Instagram") : ""),
          url: videoUrl,
          index,
        };
      });

    const playlist = {
      id: info.id ?? "",
      title: info.title ?? (isWeTvUrl ? "WeTV Series" : isInstagramUrl ? `${info.id ?? "Instagram"} Profile` : "Untitled Playlist"),
      author: info.uploader ?? info.channel ?? info.uploader_id ?? (isWeTvUrl ? "WeTV" : isInstagramUrl ? (info.id ?? "Instagram") : "Unknown"),
      videoCountText: `${videos.length} video${videos.length !== 1 ? "s" : ""}`,
      thumbnail: playlistThumb || (videos[0]?.thumbnail ?? ""),
      videos,
    };

    return NextResponse.json({ playlist });
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    let msg = rawMsg;
    if (rawMsg.includes("instagram") && (rawMsg.includes("Unable to extract data") || rawMsg.includes("login") || rawMsg.includes("cookies"))) {
      msg = "Instagram restricts scanning profile pages without account cookies. Please download individual videos/reels directly using the Single Downloader, or place a cookies.txt file in the project root to authenticate.";
    } else if (rawMsg.includes("instagram")) {
      msg = "Failed to retrieve Instagram profile. Try downloading the reel directly in the Single tab using its specific URL.";
    }
    console.error("Error in /api/playlist:", rawMsg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
