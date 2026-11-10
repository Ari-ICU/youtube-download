import { NextResponse } from "next/server";
import { execFile } from "child_process";
import {
  YTDLP,
  isAllowedUrl,
  isTikTokUrl,
  isFacebookUrl,
  buildYtDlpArgs,
} from "@/utils/ytdlp-server";

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

    if (!isAllowedUrl(decodedUrl)) {
      return NextResponse.json(
        { error: "Only YouTube, TikTok, and Facebook URLs are supported." },
        { status: 400 }
      );
    }

    const isTt = isTikTokUrl(decodedUrl);
    const isFb = isFacebookUrl(decodedUrl);

    const stdout = await runYtDlp([
      ...buildYtDlpArgs(decodedUrl),
      "--flat-playlist",
      "--dump-single-json",
      decodedUrl,
    ]);

    const info = JSON.parse(stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = info.entries ?? (info.id ? [info] : []);

    const playlistThumb =
      info.thumbnail ??
      (info.thumbnails ?? [])
        .sort((a: { width?: number }, b: { width?: number }) => (b.width ?? 0) - (a.width ?? 0))[0]
        ?.url ??
      (entries[0]?.thumbnails ?? [])
        .sort((a: { width?: number }, b: { width?: number }) => (b.width ?? 0) - (a.width ?? 0))[0]
        ?.url ??
      entries[0]?.thumbnail ??
      "";

    const videos = entries.map((e, index) => {
      const id = e.id ?? e.url?.split("/").filter(Boolean).pop() ?? `item-${index + 1}`;
      const thumbs = e.thumbnails ?? [];
      const thumb =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thumbs.sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
        e.thumbnail ??
        playlistThumb ??
        (isTt || isFb ? "/logo.png" : `https://img.youtube.com/vi/${id}/mqdefault.jpg`);

      const defaultTitle = isTt
        ? `TikTok Video #${index + 1}`
        : isFb
        ? `Facebook Video #${index + 1}`
        : `Video #${index + 1}`;

      const videoTitle = (e.title || e.description || defaultTitle)
        .replace(/\n/g, " ")
        .trim()
        .slice(0, 140);

      const uploaderHandle = info.uploader_id || info.uploader || info.id || "_";
      const defaultUrl = isTt
        ? `https://www.tiktok.com/@${uploaderHandle}/video/${id}`
        : isFb
        ? `https://www.facebook.com/watch/?v=${id}`
        : `https://www.youtube.com/watch?v=${id}`;

      const videoUrl = e.webpage_url ?? e.url ?? defaultUrl;
      const duration = Math.round(e.duration ?? 0);

      return {
        id: String(id),
        title: videoTitle,
        thumbnail: thumb,
        duration,
        durationText:
          e.duration_string ??
          (duration > 0
            ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`
            : ""),
        author:
          e.uploader ??
          e.channel ??
          info.uploader ??
          info.channel ??
          info.title ??
          (isTt ? "TikTok Creator" : isFb ? "Facebook" : "YouTube"),
        url: videoUrl,
        index,
      };
    });

    const defaultPlaylistTitle = isTt
      ? `${info.uploader ?? info.id ?? "TikTok"} Creator Feed`
      : isFb
      ? `${info.uploader ?? info.title ?? "Facebook"} Videos`
      : "YouTube Playlist";

    const playlist = {
      id: String(info.id ?? "playlist"),
      title: info.title || defaultPlaylistTitle,
      author:
        info.uploader ??
        info.channel ??
        info.uploader_id ??
        (isTt ? "TikTok" : isFb ? "Facebook" : "YouTube"),
      videoCountText: `${videos.length} video${videos.length !== 1 ? "s" : ""}`,
      thumbnail: playlistThumb || (videos[0]?.thumbnail ?? "/logo.png"),
      videos,
    };

    return NextResponse.json({ playlist });
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    console.error("Error in /api/playlist:", rawMsg);
    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
