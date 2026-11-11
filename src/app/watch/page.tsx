"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Download,
  Sparkles,
  Music,
  ExternalLink,
  Eye,
  Clock,
  Share2,
  Check,
  Loader2,
  AlertCircle,
  Film,
  Tv,
  Radio,
  ChevronDown,
  PictureInPicture2,
} from "lucide-react";

import type { VideoDetails, VideoFormat, DownloadState, Platform } from "@/types";
import {
  executeDownload,
  formatDuration,
  estimateSize,
  getProxyUrl,
  detectPlatformFromUrl,
} from "@/utils/downloader";
import { PLATFORM_CONFIGS } from "@/utils/platforms";
import QualityPreview from "@/components/ui/QualityPreview";
import DownloadToast from "@/components/ui/DownloadToast";
import UrlInput from "@/components/ui/UrlInput";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractYouTubeId(url: string, fallbackId?: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id && id.length >= 10) return id;
    }
    const v = parsed.searchParams.get("v");
    if (v) return v;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "shorts" || p === "embed" || p === "live");
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  } catch {
    /* ignore */
  }
  if (fallbackId && /^[a-zA-Z0-9_-]{11}$/.test(fallbackId)) {
    return fallbackId;
  }
  return null;
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getCombinedFormats(formats: VideoFormat[]): VideoFormat[] {
  const sorted = formats
    .filter((f) => f.hasVideo && f.hasAudio)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const seen = new Set<number>();
  return sorted.filter((f) => {
    if (seen.has(f.height)) return false;
    seen.add(f.height);
    return true;
  });
}

function getAdaptiveFormats(formats: VideoFormat[]): VideoFormat[] {
  const sorted = formats
    .filter((f) => f.hasVideo && !f.hasAudio && f.height >= 720)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const seen = new Set<number>();
  return sorted.filter((f) => {
    if (seen.has(f.height)) return false;
    seen.add(f.height);
    return true;
  });
}

// ─── Main Watch Content ───────────────────────────────────────────────────────

function WatchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQueryUrl = searchParams.get("url") ?? "";

  const [inputUrl, setInputUrl] = useState(rawQueryUrl);
  const [activeUrl, setActiveUrl] = useState(rawQueryUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    details: VideoDetails;
    formats: VideoFormat[];
  } | null>(null);

  // Layout & player modes
  const [theaterMode, setTheaterMode] = useState(false);
  const [playerMode, setPlayerMode] = useState<"embed" | "stream">("embed");
  const [descExpanded, setDescExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Download state
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const [downloadTitle, setDownloadTitle] = useState("");

  // Direct HTML5 stream player states
  const [selectedStreamFormat, setSelectedStreamFormat] = useState<VideoFormat | null>(null);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [streamLoading, setStreamLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const platform: Platform = detectPlatformFromUrl(activeUrl) ?? "youtube";
  const cfg = PLATFORM_CONFIGS[platform];
  const youtubeId = platform === "youtube" ? extractYouTubeId(activeUrl, data?.details.videoId) : null;
  const effectivePlayerMode = youtubeId ? playerMode : "stream";

  const loadVideoInfo = useCallback(async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    setActiveUrl(trimmed);
    setInputUrl(trimmed);
    setError(null);
    setStreamError(null);

    const detected = detectPlatformFromUrl(trimmed);
    if (!detected) {
      setError("Please enter a valid YouTube, TikTok, or Facebook video URL.");
      return;
    }

    if (detected !== "youtube") {
      setPlayerMode("stream");
    } else {
      setPlayerMode("embed");
    }

    // Check sessionStorage cache first for instant 0ms navigation from Home page
    try {
      const cachedRaw = sessionStorage.getItem("anivora-watch-cache");
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as {
          url: string;
          details: VideoDetails;
          formats: VideoFormat[];
        };
        if (cached.url === trimmed && cached.details && Array.isArray(cached.formats)) {
          setData({ details: cached.details, formats: cached.formats });
          const combined = getCombinedFormats(cached.formats);
          const adaptive = getAdaptiveFormats(cached.formats);
          setSelectedStreamFormat(adaptive[0] ?? combined[0] ?? null);
          return;
        }
      }
    } catch {
      /* ignore cache errors */
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load video details");
      setData(json);
      const combined = getCombinedFormats(json.formats ?? []);
      const adaptive = getAdaptiveFormats(json.formats ?? []);
      setSelectedStreamFormat(adaptive[0] ?? combined[0] ?? null);
      try {
        sessionStorage.setItem(
          "anivora-watch-cache",
          JSON.stringify({ url: trimmed, details: json.details, formats: json.formats })
        );
      } catch {
        /* ignore quota errors */
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not load video details. Please check the URL."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!rawQueryUrl) return;
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (!cancelled) {
        void loadVideoInfo(rawQueryUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [rawQueryUrl, loadVideoInfo]);

  const handleWatchSubmit = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    router.replace(`/watch?url=${encodeURIComponent(trimmed)}`);
    if (trimmed === rawQueryUrl) {
      loadVideoInfo(trimmed);
    }
  };

  const handleDownload = (itag: string, needsMerge = false) => {
    if (!data) return;
    const format = data.formats.find((f) => f.itag === itag);
    const isAudio = !format?.hasVideo && !!format?.hasAudio;
    const height = format?.height ?? 0;
    const dur = data.details.duration;

    const size =
      format?.contentLength ??
      (dur > 0 ? estimateSize(dur, height, isAudio) : 10 * 1024 * 1024);

    setDownloadTitle(data.details.title);
    executeDownload(
      activeUrl,
      itag,
      data.details.title,
      itag,
      (state) => setDownloadState(state),
      size,
      needsMerge,
      isAudio
    );
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  // Stream player helpers (full-length playback for both adaptive 4K/2K/1080p and combined streams)
  const combinedFormats = data ? getCombinedFormats(data.formats) : [];
  const adaptiveFormats = data ? getAdaptiveFormats(data.formats) : [];
  const allStreamFormats = [...adaptiveFormats, ...combinedFormats];
  const needsDualAudio = selectedStreamFormat
    ? selectedStreamFormat.hasVideo && !selectedStreamFormat.hasAudio
    : false;

  const bestAudioItag =
    data?.formats.find((f) => !f.hasVideo && f.hasAudio && f.container === "m4a")?.itag ??
    data?.formats.find((f) => !f.hasVideo && f.hasAudio)?.itag ??
    "140";

  const streamSrc =
    effectivePlayerMode === "stream" && activeUrl && selectedStreamFormat
      ? `/api/preview?url=${encodeURIComponent(activeUrl)}&itag=${encodeURIComponent(
          selectedStreamFormat.itag
        )}&r=${retryCount}`
      : null;

  const audioStreamSrc =
    effectivePlayerMode === "stream" && activeUrl && needsDualAudio
      ? `/api/preview?url=${encodeURIComponent(activeUrl)}&itag=${encodeURIComponent(
          bestAudioItag
        )}&r=${retryCount}`
      : null;

  const syncAudioToVideo = () => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a || !needsDualAudio) return;
    if (Math.abs(a.currentTime - v.currentTime) > 0.25) {
      a.currentTime = v.currentTime;
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      if (a && needsDualAudio) {
        a.currentTime = v.currentTime;
        a.play().catch(() => {});
      }
      setPlaying(true);
    } else {
      v.pause();
      a?.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    const nextMuted = !muted;
    v.muted = nextMuted;
    if (a) a.muted = nextMuted;
    setMuted(nextMuted);
  };

  const handleVolumeChange = (val: number) => {
    const v = videoRef.current;
    const a = audioRef.current;
    setVolume(val);
    const isZero = val === 0;
    setMuted(isZero);
    if (v) {
      v.volume = val;
      v.muted = isZero;
    }
    if (a) {
      a.volume = val;
      a.muted = isZero;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    v.currentTime = targetTime;
    if (a && needsDualAudio) {
      a.currentTime = targetTime;
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    setSpeedMenuOpen(false);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch {
      /* ignore */
    }
  };

  const toggleFullscreen = () => {
    const el = playerContainerRef.current ?? videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  // Quick download targets
  const best4kFormat = data?.formats.find((f) => f.hasVideo && f.height >= 2160) ??
    data?.formats.find((f) => f.hasVideo);
  const bestHdFormat =
    data?.formats.find((f) => f.hasVideo && f.height === 1080) ??
    data?.formats.find((f) => f.hasVideo && f.height === 720);
  const bestAudioFormat =
    data?.formats.find((f) => !f.hasVideo && f.hasAudio && f.container === "m4a") ??
    data?.formats.find((f) => !f.hasVideo && f.hasAudio);

  const isDownloading = downloadState?.status === "downloading";

  return (
    <div className="min-h-screen bg-[#050508] text-zinc-100 flex flex-col">
      {/* Floating download progress toast */}
      <DownloadToast
        state={downloadState}
        title={downloadTitle}
        onDismiss={() => setDownloadState(null)}
      />

      {/* ── Top Sticky Watch Bar (YouTube-style Header) ── */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-[#050508]/90 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Left: Back + Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-bold text-zinc-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <Link href="/" className="flex items-center gap-2">
              <span className="text-sm font-black tracking-wider bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                ANIVORA
              </span>
              <span className="hidden md:inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/30">
                Theater
              </span>
            </Link>
          </div>

          {/* Center: Clean URL Watch Bar */}
          <div className="flex-1 max-w-xl mx-2">
            <UrlInput
              value={inputUrl}
              onChange={setInputUrl}
              onSubmit={handleWatchSubmit}
              placeholder="Paste any YouTube, TikTok, or Facebook link to watch & download…"
              isLoading={isLoading}
              submitLabel="Watch"
              loadingLabel="Loading…"
              buttonClassName={cfg.buttonClass}
              focusBorderClassName={cfg.focusBorderClass}
            />
          </div>

          {/* Right: Theater toggle + Platform badge */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTheaterMode((v) => !v)}
              title={theaterMode ? "Exit Theater View" : "Theater View"}
              className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                theaterMode
                  ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                  : "bg-white/[0.04] text-zinc-400 border-white/[0.08] hover:text-zinc-200 hover:bg-white/[0.08]"
              }`}
            >
              {theaterMode ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Standard View</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Theater View</span>
                </>
              )}
            </button>
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${cfg.accentBadge}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{cfg.shortLabel} 4K</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content Container ── */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-300">Could Not Load Video</p>
                <p className="text-xs text-red-400/90 mt-0.5">{error}</p>
              </div>
            </div>
            <Link
              href="/"
              className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-zinc-200 shrink-0"
            >
              Return Home
            </Link>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && !data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="w-full aspect-video rounded-2xl bg-white/[0.05] border border-white/10" />
              <div className="h-7 w-3/4 rounded-lg bg-white/[0.06]" />
              <div className="h-12 w-full rounded-xl bg-white/[0.04]" />
              <div className="h-28 w-full rounded-2xl bg-white/[0.03]" />
            </div>
            <div className="lg:col-span-4 flex flex-col gap-3">
              <div className="h-8 w-48 rounded-lg bg-white/[0.05]" />
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-20 rounded-xl bg-white/[0.03] border border-white/5" />
              ))}
            </div>
          </div>
        )}

        {/* Empty state if no URL provided */}
        {!activeUrl && !isLoading && !data && (
          <div className="my-16 flex flex-col items-center justify-center text-center max-w-md mx-auto gap-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Tv className="w-8 h-8 text-violet-400" />
            </div>
            <h1 className="text-xl font-extrabold text-zinc-100">Anivora 4K Watch Studio</h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Paste any YouTube, TikTok, or Facebook video link in the bar above to watch in a clean theater view and download up to 4K Ultra HD.
            </p>
            <Link
              href="/"
              className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-bold text-white transition-colors"
            >
              Go to Downloader Home
            </Link>
          </div>
        )}

        {/* ── Loaded Watch Layout ── */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── Player Section (Full 12 cols in Theater Mode, 8 cols in Standard Mode) ── */}
            <div className={theaterMode ? "lg:col-span-12 flex flex-col gap-4" : "lg:col-span-8 flex flex-col gap-4"}>
              {/* Player Mode Switcher Bar */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {youtubeId && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPlayerMode("embed")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          effectivePlayerMode === "embed"
                            ? "bg-red-500/20 text-red-300 border-red-500/40 shadow-sm"
                            : "bg-white/[0.03] text-zinc-400 border-white/[0.07] hover:text-zinc-200 hover:bg-white/[0.06]"
                        }`}
                      >
                        <Tv className="w-3.5 h-3.5" />
                        <span>YouTube HD/4K Player</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPlayerMode("stream");
                          setStreamLoading(true);
                          setStreamError(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          effectivePlayerMode === "stream"
                            ? "bg-violet-500/20 text-violet-300 border-violet-500/40 shadow-sm"
                            : "bg-white/[0.03] text-zinc-400 border-white/[0.07] hover:text-zinc-200 hover:bg-white/[0.06]"
                        }`}
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>Direct Stream Player</span>
                      </button>
                    </>
                  )}
                  {!youtubeId && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      <Radio className="w-3.5 h-3.5" />
                      <span>Direct HD Stream Player</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] font-semibold">
                    Top Quality:{" "}
                    <strong className="text-zinc-200">
                      {data.formats.find((f) => f.hasVideo)?.qualityLabel ?? "HD"}
                    </strong>
                  </span>
                </div>
              </div>

              {/* ── Widescreen Cinema Video Box ── */}
              <div
                ref={playerContainerRef}
                className={`relative w-full bg-black rounded-2xl overflow-hidden border border-white/10 shadow-[0_20px_70px_rgba(0,0,0,0.8)] ${
                  theaterMode ? "max-h-[78vh] aspect-video mx-auto" : "aspect-video"
                }`}
              >
                {effectivePlayerMode === "embed" && youtubeId ? (
                  <iframe
                    key={youtubeId}
                    src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                    title={data.details.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                ) : (
                  /* Direct HTML5 Video Stream Player (Full-Length 4K/2K/HD/SD) */
                  <div className="relative w-full h-full flex flex-col justify-between bg-black group select-none">
                    {/* Resolution badge */}
                    {selectedStreamFormat && (
                      <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/75 border border-white/15 backdrop-blur-md">
                        {selectedStreamFormat.height >= 1440 && (
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span className="text-[11px] font-bold text-zinc-200">
                          {selectedStreamFormat.qualityLabel} Full Stream
                        </span>
                      </div>
                    )}

                    {/* Loading spinner */}
                    {streamLoading && !streamError && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-xs">
                        <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                        <p className="text-xs font-semibold text-zinc-300">
                          Loading {selectedStreamFormat?.qualityLabel ?? "video"} full stream…
                        </p>
                      </div>
                    )}

                    {/* Stream error state */}
                    {streamError && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
                        <AlertCircle className="w-10 h-10 text-red-400" />
                        <p className="text-sm font-bold text-zinc-200">{streamError}</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setStreamError(null);
                              setStreamLoading(true);
                              setRetryCount((c) => c + 1);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer"
                          >
                            Retry Stream
                          </button>
                          {youtubeId && (
                            <button
                              type="button"
                              onClick={() => setPlayerMode("embed")}
                              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
                            >
                              Switch to YouTube HD Player
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Synchronized audio track for adaptive 4K/2K/1080p/720p streams */}
                    {audioStreamSrc && (
                      <audio
                        ref={audioRef}
                        key={audioStreamSrc}
                        src={audioStreamSrc}
                        preload="auto"
                      />
                    )}

                    {streamSrc && (
                      <video
                        ref={videoRef}
                        key={streamSrc}
                        src={streamSrc}
                        poster={getProxyUrl(data.details.thumbnail)}
                        className="w-full h-full object-contain"
                        style={
                          selectedStreamFormat && selectedStreamFormat.height >= 1440
                            ? { filter: "contrast(1.04) saturate(1.06)" }
                            : undefined
                        }
                        playsInline
                        autoPlay
                        onPlay={() => {
                          setPlaying(true);
                          if (audioRef.current && needsDualAudio) {
                            syncAudioToVideo();
                            audioRef.current.play().catch(() => {});
                          }
                        }}
                        onPause={() => {
                          setPlaying(false);
                          audioRef.current?.pause();
                        }}
                        onSeeking={syncAudioToVideo}
                        onSeeked={syncAudioToVideo}
                        onLoadedMetadata={() => {
                          const v = videoRef.current;
                          if (!v) return;
                          setDuration(v.duration || data.details.duration || 0);
                          v.playbackRate = playbackRate;
                          if (audioRef.current) {
                            audioRef.current.playbackRate = playbackRate;
                            audioRef.current.volume = volume;
                            audioRef.current.muted = muted;
                          }
                          setStreamLoading(false);
                        }}
                        onTimeUpdate={() => {
                          const v = videoRef.current;
                          if (!v) return;
                          setCurrentTime(v.currentTime);
                          if (v.buffered.length > 0) {
                            setBuffered(v.buffered.end(v.buffered.length - 1));
                          }
                          syncAudioToVideo();
                        }}
                        onWaiting={() => {
                          setStreamLoading(true);
                          audioRef.current?.pause();
                        }}
                        onCanPlay={() => {
                          setStreamLoading(false);
                          if (videoRef.current && !videoRef.current.paused && audioRef.current && needsDualAudio) {
                            syncAudioToVideo();
                            audioRef.current.play().catch(() => {});
                          }
                        }}
                        onEnded={() => {
                          setPlaying(false);
                          audioRef.current?.pause();
                        }}
                        onError={() => {
                          setStreamLoading(false);
                          audioRef.current?.pause();
                          setStreamError("Stream playback interrupted or unavailable in this format.");
                        }}
                        onClick={togglePlay}
                      />
                    )}

                    {/* Center Play button overlay when paused */}
                    {!playing && !streamLoading && !streamError && (
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="absolute inset-0 z-10 flex items-center justify-center bg-black/25 cursor-pointer"
                      >
                        <div className="w-16 h-16 rounded-full bg-black/75 border border-white/25 flex items-center justify-center hover:bg-violet-600/90 transition-all shadow-2xl">
                          <Play className="w-7 h-7 text-white fill-current ml-0.5" />
                        </div>
                      </button>
                    )}

                    {/* Bottom Controls Overlay */}
                    <div className="relative z-20 mt-auto bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8 pb-3 px-4">
                      {/* Seek bar */}
                      <div
                        onClick={handleSeek}
                        className="relative w-full h-1.5 hover:h-2 bg-white/20 rounded-full cursor-pointer mb-3 transition-all"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
                          style={{ width: `${bufferedPct}%` }}
                        />
                        <div
                          className="absolute inset-y-0 left-0 bg-violet-500 rounded-full"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        {/* Left controls: Play, Volume, Time */}
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={togglePlay}
                            className="p-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={toggleMute}
                              className="p-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            >
                              {muted || volume === 0 ? (
                                <VolumeX className="w-4 h-4" />
                              ) : (
                                <Volume2 className="w-4 h-4" />
                              )}
                            </button>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={muted ? 0 : volume}
                              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                              className="hidden sm:block w-16 accent-violet-500 cursor-pointer h-1"
                            />
                          </div>

                          <span className="text-xs font-semibold text-zinc-300 tabular-nums">
                            {formatTime(currentTime)} / {formatTime(duration || data.details.duration)}
                          </span>
                        </div>

                        {/* Right controls: Speed, Quality, PiP, Fullscreen */}
                        <div className="flex items-center gap-2">
                          {/* Playback speed */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => {
                                setSpeedMenuOpen((v) => !v);
                                setQualityMenuOpen(false);
                              }}
                              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-bold text-zinc-200 border border-white/10 cursor-pointer"
                            >
                              {playbackRate}x
                            </button>
                            {speedMenuOpen && (
                              <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[90px]">
                                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    onClick={() => handleSpeedChange(r)}
                                    className={`w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                                      playbackRate === r
                                        ? "bg-violet-500/25 text-violet-300"
                                        : "text-zinc-300 hover:bg-white/10"
                                    }`}
                                  >
                                    <span>{r}x</span>
                                    {playbackRate === r && <Check className="w-3 h-3" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Stream quality selector */}
                          {allStreamFormats.length > 0 && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => {
                                  setQualityMenuOpen((v) => !v);
                                  setSpeedMenuOpen(false);
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-bold text-zinc-200 border border-white/10 cursor-pointer"
                              >
                                <span>{selectedStreamFormat?.qualityLabel ?? "Quality"}</span>
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              {qualityMenuOpen && (
                                <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[170px] max-h-64 overflow-y-auto">
                                  <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest px-3 pt-2 pb-1">
                                    Stream Resolution
                                  </p>
                                  {allStreamFormats.map((f) => (
                                    <button
                                      key={f.itag}
                                      type="button"
                                      onClick={() => {
                                        setSelectedStreamFormat(f);
                                        setQualityMenuOpen(false);
                                        setStreamLoading(true);
                                        setStreamError(null);
                                      }}
                                      className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center justify-between cursor-pointer ${
                                        selectedStreamFormat?.itag === f.itag
                                          ? "bg-violet-500/25 text-violet-300"
                                          : "text-zinc-300 hover:bg-white/10"
                                      }`}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        {f.height >= 1440 && (
                                          <Sparkles className="w-3 h-3 text-amber-400" />
                                        )}
                                        {f.qualityLabel}
                                      </span>
                                      {selectedStreamFormat?.itag === f.itag && (
                                        <Check className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={togglePiP}
                            title="Picture in Picture"
                            className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <PictureInPicture2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={toggleFullscreen}
                            title="Fullscreen"
                            className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Left Column Below Player (in Theater mode, takes 7 cols; in Standard mode, stays inside the 8-col stack) ── */}
            <div className={theaterMode ? "lg:col-span-7 flex flex-col gap-4" : "lg:col-span-8 lg:col-start-1 flex flex-col gap-4"}>
              {/* Video Title & Channel Row (YouTube Watch Page Style) */}
              <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/[0.07] flex flex-col gap-4">
                <h1 className="text-base sm:text-xl font-extrabold text-zinc-100 leading-snug">
                  {data.details.title}
                </h1>

                {/* Channel + Action Buttons Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
                  {/* Creator info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border shrink-0 font-black text-sm ${cfg.accentBadge}`}>
                      {data.details.author.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      {data.details.authorUrl ? (
                        <a
                          href={data.details.authorUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-bold text-zinc-100 hover:text-violet-300 flex items-center gap-1.5 truncate"
                        >
                          <span className="truncate">{data.details.author}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                        </a>
                      ) : (
                        <p className="text-sm font-bold text-zinc-100 truncate">
                          {data.details.author}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-zinc-400 mt-0.5">
                        {data.details.views > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5 text-zinc-500" />
                            {data.details.views.toLocaleString()} views
                          </span>
                        )}
                        {data.details.duration > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-zinc-500" />
                            {formatDuration(data.details.duration)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick One-Click Download & Share Pill Bar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {best4kFormat && (
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() =>
                          handleDownload(
                            best4kFormat.itag,
                            best4kFormat.hasVideo && !best4kFormat.hasAudio
                          )
                        }
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-xs font-extrabold text-white shadow-lg cursor-pointer disabled:opacity-50 transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Download {best4kFormat.qualityLabel}</span>
                      </button>
                    )}

                    {bestHdFormat && bestHdFormat.itag !== best4kFormat?.itag && (
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() =>
                          handleDownload(
                            bestHdFormat.itag,
                            bestHdFormat.hasVideo && !bestHdFormat.hasAudio
                          )
                        }
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/35 text-xs font-bold text-violet-200 cursor-pointer disabled:opacity-50 transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{bestHdFormat.qualityLabel}</span>
                      </button>
                    )}

                    {bestAudioFormat && (
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownload(bestAudioFormat.itag, false)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-xs font-bold text-pink-200 cursor-pointer disabled:opacity-50 transition-all"
                      >
                        <Music className="w-3.5 h-3.5" />
                        <span>M4A Audio</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-300 cursor-pointer transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share</span>
                        </>
                      )}
                    </button>

                    <a
                      href={activeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-300 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Original</span>
                    </a>
                  </div>
                </div>

                {/* YouTube-style Description & Metadata Box */}
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3.5">
                  <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-zinc-300 mb-2">
                    <span>{data.formats.length} Available Streams</span>
                    <span>•</span>
                    <span>Platform: {cfg.label}</span>
                    {data.details.duration > 0 && (
                      <>
                        <span>•</span>
                        <span>Length: {formatDuration(data.details.duration)}</span>
                      </>
                    )}
                  </div>
                  {data.details.description ? (
                    <div>
                      <p
                        className={`text-xs text-zinc-400 whitespace-pre-line leading-relaxed ${
                          descExpanded ? "" : "line-clamp-3"
                        }`}
                      >
                        {data.details.description}
                      </p>
                      {data.details.description.length > 180 && (
                        <button
                          type="button"
                          onClick={() => setDescExpanded((v) => !v)}
                          className="mt-2 text-xs font-bold text-violet-400 hover:text-violet-300 cursor-pointer"
                        >
                          {descExpanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      Select any stream on the right panel to download video or audio directly to your device.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right Sidebar: Stream & Quality Download Studio ── */}
            <aside
              className={
                theaterMode
                  ? "lg:col-span-5 glass-panel rounded-2xl p-4 sm:p-5 border border-white/[0.07]"
                  : "lg:col-span-4 lg:row-span-2 lg:col-start-9 lg:row-start-1 glass-panel rounded-2xl p-4 sm:p-5 border border-white/[0.07] sticky top-20"
              }
            >
              <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-violet-400" />
                  <h2 className="text-xs font-extrabold text-zinc-200 uppercase tracking-widest">
                    Download Formats
                  </h2>
                </div>
                <span className="text-[11px] text-zinc-400 font-semibold">
                  Click any stream
                </span>
              </div>

              <QualityPreview
                formats={data.formats}
                duration={data.details.duration}
                isDownloading={isDownloading}
                onDownload={handleDownload}
              />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050508] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      }
    >
      <WatchPageContent />
    </Suspense>
  );
}
