import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const YTDLP = "yt-dlp";

// ─── Per-URL yt-dlp args builder ─────────────────────────────────────────────
const YTDLP_YOUTUBE_ARGS = [
  "--extractor-args", "youtube:player_client=web,android,android_vr",
  "--js-runtimes", "node",
];

const YTDLP_BILIBILI_ARGS = [
  "--geo-bypass",
  "--extractor-args", "BiliBiliTV:lang=en",
];

const YTDLP_BASE_ARGS = ["--no-warnings"];

function buildYtDlpArgs(url: string): string[] {
  const args = [...YTDLP_BASE_ARGS];
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    args.push(...YTDLP_YOUTUBE_ARGS);
  } else if (url.includes("bilibili.tv")) {
    args.push(...YTDLP_BILIBILI_ARGS);
  }
  const cookiesPath = join(process.cwd(), "cookies.txt");
  if (existsSync(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  }
  return args;
}

// ─── Security: allowlist YouTube, WeTV, Instagram, and Bilibili TV domains ────
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
  "bilibili.tv",
  "www.bilibili.tv",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
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
        { error: "Only YouTube, WeTV, Instagram, Bilibili TV, and X URLs are supported." },
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
                      let carIdx = 0;
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
                              carousel_index: carIdx++,
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
                const baseId = node.shortcode ?? node.id;
                const id = baseId + (node.carousel_index !== undefined ? `-${node.carousel_index}` : "");
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
                  url: `https://www.instagram.com/p/${baseId}/`,
                  index,
                  isVideo: !!node.is_video,
                };
              };

              const uniqueVideosMap = new Map<string, any>();
              allEdges
                .map((edge: any, i: number) => mapEdge(edge, i))
                .filter((v: any) => v.isVideo)
                .forEach((v: any) => {
                  if (!uniqueVideosMap.has(v.id)) {
                    uniqueVideosMap.set(v.id, v);
                  }
                });

              const videos = Array.from(uniqueVideosMap.values()).map((v: any, i: number) => ({
                ...v,
                index: i,
              }));

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

    const isXUrl = decodedUrl.includes("x.com") || decodedUrl.includes("twitter.com");
    const isXProfile = isXUrl && !decodedUrl.includes("/status/");

    if (isXProfile) {
      let username = "";
      try {
        const parsed = new URL(decodedUrl);
        username = parsed.pathname.split("/").filter(Boolean)[0] || "";
      } catch {
        return NextResponse.json({ error: "Invalid X Profile URL." }, { status: 400 });
      }

      if (username) {
        try {
          const stdout = await runYtDlp([
            ...buildYtDlpArgs(decodedUrl),
            "--flat-playlist",
            "--dump-single-json",
            decodedUrl,
          ]);

          const info = JSON.parse(stdout);
          const entries: any[] = info.entries ?? [];
          const playlistThumb = info.thumbnail ?? (entries[0]?.thumbnail ?? "");

          const videos = entries.map((e, index) => {
            const id = e.id ?? `video-${index + 1}`;
            
            const formats = e.formats ?? [];
            const formatsWithVideo = formats.filter((f: any) => f.vcodec !== "none" && (f.height ?? 0) > 0);
            const bestFormat = formatsWithVideo.sort((a: any, b: any) => (b.height ?? 0) - (a.height ?? 0))[0]
              || formats.sort((a: any, b: any) => (b.height ?? 0) - (a.height ?? 0))[0];
            const videoUrl = bestFormat?.url ?? e.url ?? e.webpage_url ?? `https://x.com/i/status/${id}`;

            const videoTitle = e.title ?? `X Video ${index + 1}`;
            const thumb = e.thumbnail ?? playlistThumb ?? "";

            return {
              id,
              title: videoTitle,
              thumbnail: thumb,
              duration: Math.round(e.duration ?? 0),
              durationText: e.duration_string ?? (e.duration ? `${Math.floor(e.duration / 60)}:${String(Math.round(e.duration % 60)).padStart(2, "0")}` : ""),
              author: info.title ?? info.id ?? `@${username}`,
              url: videoUrl,
              index,
            };
          });

          const playlist = {
            id: info.id ?? username,
            title: info.title ?? `@${username} on X`,
            author: info.uploader ?? info.id ?? username,
            videoCountText: `${videos.length} video${videos.length !== 1 ? "s" : ""}`,
            thumbnail: playlistThumb,
            videos,
          };

          return NextResponse.json({ playlist });
        } catch (err: unknown) {
          console.error("X profile parse error:", err instanceof Error ? err.message : String(err));
          return NextResponse.json(
            { error: "Failed to scrape X profile. Make sure the profile is public and has videos." },
            { status: 500 }
          );
        }
      }
    }

    const isWeTvUrl = decodedUrl.includes("wetv.vip");
    if (isWeTvUrl) {
      try {
        const pageRes = await fetch(decodedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          }
        });
        if (!pageRes.ok) throw new Error(`WeTV returned status ${pageRes.status}`);
        const html = await pageRes.text();
        const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
        if (nextMatch) {
          const nextJson = JSON.parse(nextMatch[1]);
          const dataStr = nextJson.props?.pageProps?.data;
          if (dataStr) {
            const data = JSON.parse(dataStr);
            const coverInfo = data.coverInfo || {};
            const videoList = data.videoList || [];
            
            const cid = coverInfo.cid || decodedUrl.split("/").pop() || "";
            const playlistThumb = coverInfo.posterHz || coverInfo.posterVt || "";
            
            const videos = videoList.map((v: any, index: number) => {
              const id = v.vid || `ep-${index + 1}`;
              const title = v.title || `Episode ${v.episode || (index + 1)}`;
              const thumb = v.pic_640_360 || v.pic_496_280 || v.pic_332_187 || playlistThumb || "";
              const duration = Math.round(v.duration || 0);
              
              return {
                id,
                title,
                thumbnail: thumb,
                duration,
                durationText: duration > 0 
                  ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` 
                  : "",
                author: coverInfo.title || "WeTV",
                url: `https://wetv.vip/en/play/${cid}/${id}`,
                index,
              };
            });
            
            const playlist = {
              id: cid,
              title: coverInfo.title || "WeTV Series",
              author: "WeTV",
              videoCountText: `${videos.length} video${videos.length !== 1 ? "s" : ""}`,
              thumbnail: playlistThumb,
              videos,
            };
            
            return NextResponse.json({ playlist });
          }
        }
      } catch (err: unknown) {
        console.error("WeTV series page parse error:", err instanceof Error ? err.message : String(err));
        return NextResponse.json({ error: "Failed to load WeTV series. Please verify the URL." }, { status: 500 });
      }
    }

    const stdout = await runYtDlp([
      ...buildYtDlpArgs(decodedUrl),
      "--flat-playlist",
      "--dump-single-json",
      decodedUrl,
    ]);

    const info = JSON.parse(stdout);

    const isBilibiliUrl = decodedUrl.includes("bilibili.tv");

    const entries: any[] = info.entries ?? [];

    const playlistThumb =
      info.thumbnail ??
      (entries[0]?.thumbnails ?? []).sort((a: { width?: number }, b: { width?: number }) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
      entries[0]?.thumbnail ??
      "";

    const videos = entries
      .map((e, index) => {
        const id = e.id ?? e.url?.split("/").pop() ?? `ep-${index + 1}`;

        let smuggled: any = {};
        if (isBilibiliUrl && e.url && e.url.includes("__youtubedl_smuggle=")) {
          try {
            const hash = e.url.split("#")[1] || "";
            const params = new URLSearchParams(hash);
            const smugStr = params.get("__youtubedl_smuggle");
            if (smugStr) {
              smuggled = JSON.parse(decodeURIComponent(smugStr));
            }
          } catch (err) {
            console.error("Failed to parse smuggled Bilibili metadata:", err);
          }
        }

        const thumbs = e.thumbnails ?? [];
        const thumb =
          thumbs.sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
          e.thumbnail ??
          smuggled.thumbnail ??
          playlistThumb ??
          ((isWeTvUrl || isInstagramUrl || isBilibiliUrl) ? "" : `https://img.youtube.com/vi/${id}/mqdefault.jpg`);

        const videoTitle = e.title ?? smuggled.title ?? (isWeTvUrl ? `Episode ${index + 1}` : isBilibiliUrl ? `Episode ${index + 1}` : isInstagramUrl ? `Instagram Video ${index + 1}` : `Video ${index + 1}`);
        const defaultUrl = isWeTvUrl
          ? `https://wetv.vip/en/play/${info.id}/${id}`
          : isBilibiliUrl
          ? `https://www.bilibili.tv/en/play/${info.id}/${id}`
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
          author: e.uploader ?? e.channel ?? (isWeTvUrl ? (info.title ?? "WeTV") : isBilibiliUrl ? "Bilibili TV" : isInstagramUrl ? (info.title ?? "Instagram") : ""),
          url: videoUrl,
          index,
        };
      });

    const playlist = {
      id: info.id ?? "",
      title: info.title ?? (isWeTvUrl ? "WeTV Series" : isBilibiliUrl ? "Bilibili TV Series" : isInstagramUrl ? `${info.id ?? "Instagram"} Profile` : "Untitled Playlist"),
      author: info.uploader ?? info.channel ?? info.uploader_id ?? (isWeTvUrl ? "WeTV" : isBilibiliUrl ? "Bilibili TV" : isInstagramUrl ? (info.id ?? "Instagram") : "Unknown"),
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
    } else if (
      rawMsg.includes("BiliIntl") ||
      rawMsg.includes("bilibili.tv") ||
      rawMsg.includes("NoneType") ||
      rawMsg.includes("Unknown error")
    ) {
      msg =
        "Bilibili TV's API is geo-restricted from this server location. " +
        "Make sure your server/VPN is in a region where bilibili.tv is accessible (Southeast Asia / global).";
    }
    console.error("Error in /api/playlist:", rawMsg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
