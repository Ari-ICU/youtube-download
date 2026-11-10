import type { Platform } from "@/types";

export interface PlatformConfig {
  id: Platform;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
  singleTabLabel: string;
  singleTabShort: string;
  playlistTabLabel: string;
  playlistTabShort: string;
  singlePlaceholder: string;
  playlistPlaceholder: string;
  accentText: string;
  accentBg: string;
  accentBadge: string;
  buttonClass: string;
  activeNavClass: string;
  activeTabClass: string;
  focusBorderClass: string;
  cardBorderClass: string;
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    shortLabel: "YouTube",
    badge: "4K UHD · 60fps · M4A Audio",
    description:
      "Download YouTube videos, Shorts, and playlists in up to 4K 60fps Ultra HD with automatic FFmpeg audio muxing.",
    singleTabLabel: "Single Video",
    singleTabShort: "Video",
    playlistTabLabel: "Playlist Extractor",
    playlistTabShort: "Playlist",
    singlePlaceholder: "Paste YouTube video or Shorts URL (https://www.youtube.com/watch?v=…)",
    playlistPlaceholder: "Paste YouTube playlist URL (https://www.youtube.com/playlist?list=…)",
    accentText: "text-red-400",
    accentBg: "bg-red-500",
    accentBadge: "bg-red-500/15 text-red-300 border-red-500/30",
    buttonClass:
      "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:from-red-950 disabled:to-rose-950 text-white shadow-red-500/20",
    activeNavClass:
      "bg-red-500/15 text-red-300 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.18)]",
    activeTabClass:
      "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-[0_4px_20px_rgba(239,68,68,0.35)]",
    focusBorderClass: "focus-within:border-red-500/50 focus-within:ring-2 focus-within:ring-red-500/15",
    cardBorderClass: "border-red-500/20 bg-red-500/10 text-red-300",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    shortLabel: "TikTok",
    badge: "4K & HD · No Watermark · Creator Feeds",
    description:
      "Save public TikTok videos, clips, and creator profile feeds in crystal-clear MP4 up to 4K or standalone M4A audio.",
    singleTabLabel: "TikTok Video",
    singleTabShort: "Video",
    playlistTabLabel: "Creator Feed",
    playlistTabShort: "Creator",
    singlePlaceholder: "Paste TikTok video URL (https://www.tiktok.com/@user/video/… or https://vm.tiktok.com/…)",
    playlistPlaceholder: "Paste TikTok profile URL (https://www.tiktok.com/@username)",
    accentText: "text-cyan-400",
    accentBg: "bg-cyan-500",
    accentBadge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    buttonClass:
      "bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-400 hover:to-pink-400 disabled:from-cyan-950 disabled:to-pink-950 text-white shadow-cyan-500/20",
    activeNavClass:
      "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.18)]",
    activeTabClass:
      "bg-gradient-to-r from-cyan-500 to-pink-500 text-white shadow-[0_4px_20px_rgba(6,182,212,0.35)]",
    focusBorderClass: "focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/15",
    cardBorderClass: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    shortLabel: "Facebook",
    badge: "4K & HD Watch · Reels · Public Videos",
    description:
      "Download public Facebook Watch videos, Reels, and video posts in up to 4K Ultra HD with automatic FFmpeg audio muxing.",
    singleTabLabel: "Video / Reel",
    singleTabShort: "Video",
    playlistTabLabel: "Page / Batch",
    playlistTabShort: "Batch",
    singlePlaceholder: "Paste Facebook Watch, Reel, or video URL (https://www.facebook.com/watch?v=… or https://fb.watch/…)",
    playlistPlaceholder: "Paste Facebook page or multi-video post URL (https://www.facebook.com/…)",
    accentText: "text-blue-400",
    accentBg: "bg-blue-500",
    accentBadge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    buttonClass:
      "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-950 disabled:to-indigo-950 text-white shadow-blue-500/20",
    activeNavClass:
      "bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.18)]",
    activeTabClass:
      "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_4px_20px_rgba(59,130,246,0.35)]",
    focusBorderClass: "focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/15",
    cardBorderClass: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  },
};

export const PLATFORM_LIST: PlatformConfig[] = [
  PLATFORM_CONFIGS.youtube,
  PLATFORM_CONFIGS.tiktok,
  PLATFORM_CONFIGS.facebook,
];
