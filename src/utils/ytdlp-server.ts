// ─── Shared Server-Side yt-dlp Configuration & Validation ────────────────────

export const YTDLP = "yt-dlp";

export const FORMAT_ID_RE = /^[a-zA-Z0-9\-_.+]{1,60}$/;

export const ALLOWED_HOSTS = [
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

export function isAllowedUrl(raw: string): boolean {
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

const YTDLP_YOUTUBE_ARGS = [
  "--extractor-args",
  "youtube:player_client=web,android,android_vr",
  "--js-runtimes",
  "node",
];

const YTDLP_BILIBILI_ARGS = [
  "--extractor-args",
  "BiliBiliTV:lang=en",
];

const YTDLP_BASE_ARGS = ["--no-warnings"];

export function buildYtDlpArgs(url: string): string[] {
  const args = [...YTDLP_BASE_ARGS];

  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    args.push(...YTDLP_YOUTUBE_ARGS);
  } else if (url.includes("bilibili.tv")) {
    args.push(...YTDLP_BILIBILI_ARGS);
  }

  return args;
}

