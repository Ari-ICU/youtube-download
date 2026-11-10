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
    shortLabel: "YT",
    badge: "4K UHD · 60fps · M4A Audio",
    description:
      "Download YouTube videos, Shorts, and playlists in up to 4K 60fps with automatic FFmpeg audio muxing.",
    singleTabLabel: "Single Video",
    singleTabShort: "Video",
    playlistTabLabel: "Playlist Extractor",
    playlistTabShort: "Playlist",
    singlePlaceholder: "Paste YouTube video or Shorts URL (https://www.youtube.com/watch?v=…)",
    playlistPlaceholder: "Paste YouTube playlist URL (https://www.youtube.com/playlist?list=…)",
    accentText: "text-violet-400",
    accentBg: "bg-violet-500",
    accentBadge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    buttonClass:
      "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-violet-950 disabled:to-indigo-950 shadow-violet-500/20",
    activeNavClass:
      "bg-red-500/15 text-red-300 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.15)]",
    activeTabClass:
      "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_4px_20px_rgba(139,92,246,0.35)]",
    focusBorderClass: "focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/15",
    cardBorderClass: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  },
  wetv: {
    id: "wetv",
    label: "WeTV",
    shortLabel: "WeTV",
    badge: "Full Episodes · Series Batch",
    description:
      "Save public WeTV dramas, anime episodes, and full series playlists as clean, seekable MP4 files.",
    singleTabLabel: "Episode Downloader",
    singleTabShort: "Episode",
    playlistTabLabel: "Series Extractor",
    playlistTabShort: "Series",
    singlePlaceholder: "Paste WeTV episode URL (https://wetv.vip/en/play/…)",
    playlistPlaceholder: "Paste WeTV series URL (https://wetv.vip/en/play/…)",
    accentText: "text-sky-400",
    accentBg: "bg-sky-500",
    accentBadge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    buttonClass:
      "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:from-sky-950 disabled:to-blue-950 shadow-sky-500/20",
    activeNavClass:
      "bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-[0_0_20px_rgba(14,165,233,0.15)]",
    activeTabClass:
      "bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-[0_4px_20px_rgba(14,165,233,0.35)]",
    focusBorderClass: "focus-within:border-sky-500/50 focus-within:ring-2 focus-within:ring-sky-500/15",
    cardBorderClass: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    shortLabel: "IG",
    badge: "Reels · Videos · Public Feeds",
    description:
      "Download public Instagram Reels, video posts, and profile video feeds in QuickTime-ready H.264 MP4.",
    singleTabLabel: "Reel / Video",
    singleTabShort: "Reel",
    playlistTabLabel: "Profile Feed",
    playlistTabShort: "Profile",
    singlePlaceholder: "Paste Instagram Reel or Post URL (https://www.instagram.com/reel/…)",
    playlistPlaceholder: "Paste Instagram Profile URL (https://www.instagram.com/username/)",
    accentText: "text-pink-400",
    accentBg: "bg-pink-500",
    accentBadge: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    buttonClass:
      "bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:from-pink-950 disabled:to-rose-950 shadow-pink-500/20",
    activeNavClass:
      "bg-pink-500/15 text-pink-300 border border-pink-500/30 shadow-[0_0_20px_rgba(236,72,153,0.15)]",
    activeTabClass:
      "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-[0_4px_20px_rgba(236,72,153,0.35)]",
    focusBorderClass: "focus-within:border-pink-500/50 focus-within:ring-2 focus-within:ring-pink-500/15",
    cardBorderClass: "border-pink-500/20 bg-pink-500/10 text-pink-300",
  },
  bilibili: {
    id: "bilibili",
    label: "Bilibili TV",
    shortLabel: "Bili",
    badge: "Anime · Creators · HD Streams",
    description:
      "Download public Bilibili TV anime episodes, creator videos, and series playlists in high definition.",
    singleTabLabel: "Video Downloader",
    singleTabShort: "Video",
    playlistTabLabel: "Series Extractor",
    playlistTabShort: "Series",
    singlePlaceholder: "Paste Bilibili TV video URL (https://www.bilibili.tv/en/video/…)",
    playlistPlaceholder: "Paste Bilibili TV series URL (https://www.bilibili.tv/en/play/…)",
    accentText: "text-orange-400",
    accentBg: "bg-orange-500",
    accentBadge: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    buttonClass:
      "bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 disabled:from-orange-950 disabled:to-amber-950 shadow-orange-500/20",
    activeNavClass:
      "bg-orange-500/15 text-orange-300 border border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.15)]",
    activeTabClass:
      "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-[0_4px_20px_rgba(249,115,22,0.35)]",
    focusBorderClass: "focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/15",
    cardBorderClass: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  },
  x: {
    id: "x",
    label: "X (Twitter)",
    shortLabel: "X",
    badge: "Post Videos · Profile Media",
    description:
      "Save public X (Twitter) post videos, clips, and user timeline media feeds directly to MP4.",
    singleTabLabel: "Post Video",
    singleTabShort: "Post",
    playlistTabLabel: "Profile Media",
    playlistTabShort: "Profile",
    singlePlaceholder: "Paste X / Twitter post URL (https://x.com/username/status/…)",
    playlistPlaceholder: "Paste X / Twitter profile URL (https://x.com/username)",
    accentText: "text-zinc-200",
    accentBg: "bg-zinc-200",
    accentBadge: "bg-zinc-500/15 text-zinc-200 border-zinc-500/30",
    buttonClass:
      "bg-zinc-100 hover:bg-white text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-500 shadow-white/10",
    activeNavClass:
      "bg-white/12 text-white border border-white/25 shadow-[0_0_20px_rgba(255,255,255,0.08)]",
    activeTabClass:
      "bg-zinc-100 text-zinc-950 shadow-[0_4px_20px_rgba(255,255,255,0.15)]",
    focusBorderClass: "focus-within:border-zinc-400/50 focus-within:ring-2 focus-within:ring-zinc-400/15",
    cardBorderClass: "border-zinc-700 bg-zinc-800/40 text-zinc-200",
  },
};

export const PLATFORM_LIST: PlatformConfig[] = [
  PLATFORM_CONFIGS.youtube,
  PLATFORM_CONFIGS.wetv,
  PLATFORM_CONFIGS.instagram,
  PLATFORM_CONFIGS.bilibili,
  PLATFORM_CONFIGS.x,
];

