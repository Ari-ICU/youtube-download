// ─── Shared Server-Side yt-dlp Configuration & Validation ────────────────────

export const YTDLP = "yt-dlp";

export const FORMAT_ID_RE = /^[a-zA-Z0-9\-_.+]{1,60}$/;

export const ALLOWED_HOSTS = [
  // YouTube
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  // TikTok
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "m.tiktok.com",
  // Facebook
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.watch",
  "fb.com",
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

export function isYouTubeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("youtube.com") || lower.includes("youtu.be") || lower.includes("youtube-nocookie.com");
}

export function isTikTokUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("tiktok.com");
}

export function isFacebookUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("facebook.com") || lower.includes("fb.watch") || lower.includes("fb.com");
}

const YTDLP_YOUTUBE_ARGS = [
  "--extractor-args",
  "youtube:player_client=default,tv",
  "--js-runtimes",
  "node",
];

const YTDLP_BASE_ARGS = [
  "--no-warnings",
  "--continue",
  "--retries",
  "10",
  "--fragment-retries",
  "10",
];

export function buildYtDlpArgs(url: string): string[] {
  const args = [...YTDLP_BASE_ARGS];

  if (isYouTubeUrl(url)) {
    args.push(...YTDLP_YOUTUBE_ARGS);
  }

  return args;
}
