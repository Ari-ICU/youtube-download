import { NextResponse } from "next/server";
import { execFile } from "child_process";

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
        { error: "Only YouTube URLs are supported." },
        { status: 400 }
      );
    }

    const stdout = await runYtDlp([
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      decodedUrl,
    ]);

    const info = JSON.parse(stdout);

    const entries: {
      id: string;
      title?: string;
      url?: string;
      thumbnail?: string;
      thumbnails?: { url: string; width?: number }[];
      duration?: number;
      duration_string?: string;
      uploader?: string;
      channel?: string;
    }[] = info.entries ?? [];

    const videos = entries
      .filter((e) => !!e.id)
      .map((e, index) => {
        const thumbs = e.thumbnails ?? [];
        const thumb =
          thumbs.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
          e.thumbnail ??
          `https://img.youtube.com/vi/${e.id}/mqdefault.jpg`;

        return {
          id: e.id,
          title: e.title ?? `Video ${index + 1}`,
          thumbnail: thumb,
          duration: Math.round(e.duration ?? 0),
          durationText: e.duration_string ?? "",
          author: e.uploader ?? e.channel ?? "",
          url: `https://www.youtube.com/watch?v=${e.id}`,
          index,
        };
      });

    const playlistThumb =
      videos[0]?.thumbnail ??
      `https://img.youtube.com/vi/${entries[0]?.id ?? ""}/mqdefault.jpg`;

    const playlist = {
      id: info.id ?? "",
      title: info.title ?? "Untitled Playlist",
      author: info.uploader ?? info.channel ?? info.uploader_id ?? "Unknown",
      videoCountText: `${videos.length} video${videos.length !== 1 ? "s" : ""}`,
      thumbnail: playlistThumb,
      videos,
    };

    return NextResponse.json({ playlist });
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : "Failed to retrieve playlist information.";
    console.error("Error in /api/playlist:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
