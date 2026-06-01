// ─── Domain Types ────────────────────────────────────────────────────────────
// Central type definitions for the VibeTube downloader.
// Import from "@/types" in any component or utility.

export interface VideoDetails {
  videoId: string;
  title: string;
  author: string;
  authorUrl: string;
  thumbnail: string;
  duration: number; // seconds
  views: number;
  description: string;
}

export interface VideoFormat {
  /** yt-dlp format_id (string, e.g. "22" or "bestvideo+bestaudio") */
  itag: string;
  qualityLabel: string;
  container: string;
  hasVideo: boolean;
  hasAudio: boolean;
  mimeType: string;
  contentLength: number | null;
  fps: number | null;
}

export interface PlaylistVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number; // seconds
  durationText: string;
  author: string;
  url: string;
  index: number;
}

export interface PlaylistDetails {
  id: string;
  title: string;
  author: string;
  videoCountText: string;
  thumbnail: string;
  videos: PlaylistVideo[];
}

// ─── Download State ───────────────────────────────────────────────────────────

export type DownloadStatus = "idle" | "downloading" | "completed" | "failed";

export interface DownloadState {
  /** Identifier: itag for single videos, videoId for playlist items */
  id: string;
  status: DownloadStatus;
  /** 0-100 %. Only meaningful when status === 'downloading' */
  progress: number;
  /** Human-readable size of data received so far, e.g. "12.4" (MB) */
  downloadedMb: string;
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export type ActiveTab = "single" | "playlist";
