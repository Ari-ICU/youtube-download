import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const YTDLP = "yt-dlp";

// Player clients:
// - web:         broad compatibility, standard streams up to 1080p
// - android:     works for region-restricted & geo-blocked videos
// - android_vr:  unlocks 1440p/2160p (4K) adaptive streams
// Note: --js-runtimes and --remote-components removed; they fetch JS solvers
// from GitHub at runtime and break downloads when the network is unavailable.
const YTDLP_BASE_ARGS = [
  "--extractor-args", "youtube:player_client=web,android,android_vr",
  "--no-warnings",
  "--js-runtimes", "node",
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

    const isInstagramUrl = decodedUrl.includes("instagram.com");
    // Detect profile-level URLs (not individual posts/reels)
    const isInstagramProfile = isInstagramUrl && !decodedUrl.includes("/reel/") && !decodedUrl.includes("/tv/");
    // Detect if URL points specifically to the /reels/ tab
    const isReelsTab = isInstagramUrl && /\/reels\/?$/.test(new URL(decodedUrl).pathname);

    if (isInstagramProfile) {
      let username = "";
      try {
        const parsed = new URL(decodedUrl);
        const parts = parsed.pathname.split("/").filter(Boolean);
        // Handle /username/ and /username/reels/ etc.
        username = parts[0] === "reels" || parts[0] === "explore" ? "" : parts[0];
      } catch {
        return NextResponse.json({ error: "Invalid Instagram Profile URL." }, { status: 400 });
      }

      if (username) {
        try {
          const IG_HEADERS = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
            "X-IG-App-ID": "936619743392459",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": "https://www.instagram.com",
            "Referer": `https://www.instagram.com/${username}/`,
          };

          // ── Step 1: Fetch profile to get user info + first batch of posts ─────
          const profileRes = await fetch(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
            { headers: IG_HEADERS }
          );

          if (profileRes.ok) {
            const profileJson = await profileRes.json();
            const user = profileJson.data?.user;

            if (user) {
              const userId: string = user.id ?? "";
              const playlistThumb: string = user.profile_pic_url_hd ?? user.profile_pic_url ?? "";

              // Collect all edges across pages (up to MAX_POSTS)
              const MAX_POSTS = 200;
              let allEdges: any[] = user.edge_owner_to_timeline_media?.edges ?? [];
              let moreAvailable: boolean = user.edge_owner_to_timeline_media?.page_info?.has_next_page ?? false;
              let maxId: string | null = user.edge_owner_to_timeline_media?.page_info?.end_cursor ?? null;

              // ── Step 2: Paginate via /api/v1/feed/user/{userId}/?max_id=… ─
              while (moreAvailable && maxId && allEdges.length < MAX_POSTS) {
                try {
                  const feedRes = await fetch(
                    `https://www.instagram.com/api/v1/feed/user/${userId}/?count=12&max_id=${encodeURIComponent(maxId)}`,
                    { headers: IG_HEADERS }
                  );
                  if (!feedRes.ok) break;
                  const feedJson = await feedRes.json();
                  if (feedJson.status !== "ok") break;
                  const feedItems: any[] = feedJson.items ?? [];
                  if (feedItems.length === 0) break;
                  // Convert feed items to edge-like objects for uniform processing
                  // media_type: 1=photo, 2=video/reel, 8=carousel
                  const feedEdges: any[] = [];
                  for (const item of feedItems) {
                    const captionEdges = item.caption ? [{ node: { text: item.caption.text ?? "" } }] : [];
                    if (item.media_type === 2) {
                      // Direct video/reel
                      feedEdges.push({
                        node: {
                          shortcode: item.code ?? item.pk,
                          id: item.pk,
                          is_video: true,
                          video_duration: item.video_duration ?? 0,
                          display_url: item.image_versions2?.candidates?.[0]?.url ?? "",
                          edge_media_to_caption: { edges: captionEdges },
                        },
                      });
                    } else if (item.media_type === 8) {
                      // Carousel — check each carousel item for embedded videos
                      for (const carItem of (item.carousel_media ?? [])) {
                        if (carItem.media_type === 2) {
                          feedEdges.push({
                            node: {
                              shortcode: carItem.code ?? item.code ?? item.pk,
                              id: carItem.pk ?? item.pk,
                              is_video: true,
                              video_duration: carItem.video_duration ?? 0,
                              display_url: carItem.image_versions2?.candidates?.[0]?.url ?? "",
                              edge_media_to_caption: { edges: captionEdges },
                            },
                          });
                        }
                      }
                    }
                    // media_type 1 = photo — skip
                  }
                  allEdges = [...allEdges, ...feedEdges];
                  moreAvailable = feedJson.more_available ?? false;
                  maxId = feedJson.next_max_id ?? null;
                  // Small delay to avoid rate-limiting
                  await new Promise((r) => setTimeout(r, 150));
                } catch {
                  break;
                }
              }

              // ── Step 3: Map all collected edges to playlist video objects ──
              const mapEdge = (edge: any, index: number) => {
                const node = edge.node;
                const id = node.shortcode ?? node.id;
                const caption = node.edge_media_to_caption?.edges[0]?.node?.text ?? "";
                const title = caption.trim()
                  ? caption.replace(/\n/g, " ").slice(0, 120)
                  : `Instagram Video ${index + 1}`;
                const thumb = node.display_url ?? playlistThumb;

                let duration = 0;
                if (node.video_duration) {
                  duration = Math.round(node.video_duration);
                }

                return {
                  id,
                  title,
                  thumbnail: thumb,
                  duration,
                  durationText: duration > 0
                    ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`
                    : "",
                  author: user.full_name ?? user.username ?? "Instagram User",
                  url: `https://www.instagram.com/p/${id}/`,
                  index,
                  isVideo: !!node.is_video,
                };
              };

              const videos = allEdges
                .map((edge: any, i: number) => mapEdge(edge, i))
                .filter((v: any) => v.isVideo)
                .map((v: any, i: number) => ({ ...v, index: i }));

              const playlist = {
                id: user.username ?? username,
                title: user.full_name
                  ? `${user.full_name} (@${user.username})`
                  : `@${user.username} Profile`,
                author: user.username,
                videoCountText: `${videos.length} video${videos.length !== 1 ? "s" : ""}`,
                thumbnail: playlistThumb,
                videos,
              };

              return NextResponse.json({ playlist });
            }
          }
        } catch (err: unknown) {
          console.error("Instagram profile API error:", err instanceof Error ? err.message : String(err));
        }
      }
    }

    const stdout = await runYtDlp([
      ...getYtDlpArgs(),
      "--flat-playlist",
      "--dump-single-json",
      decodedUrl,
    ]);

    const info = JSON.parse(stdout);

    const isWeTvUrl = decodedUrl.includes("wetv.vip");

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
