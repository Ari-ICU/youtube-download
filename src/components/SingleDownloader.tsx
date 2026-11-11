"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Clock,
  Eye,
  ExternalLink,
  Play,
  RefreshCw,
  Sparkles,
  Zap,
  Music,
  Film,
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
import UrlInput from "@/components/ui/UrlInput";
import ErrorBanner from "@/components/ui/ErrorBanner";
import DownloadToast from "@/components/ui/DownloadToast";
import QualityPreview from "@/components/ui/QualityPreview";

interface SingleDownloaderProps {
  platform: Platform;
  onPlatformChange?: (platform: Platform) => void;
}

export default function SingleDownloader({
  platform,
  onPlatformChange,
}: SingleDownloaderProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [data, setData] = useState<{
    details: VideoDetails;
    formats: VideoFormat[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const [downloadTitle, setDownloadTitle] = useState<string>("");

  const cfg = PLATFORM_CONFIGS[platform];

  const handleUrlChange = (val: string) => {
    setUrl(val);
    const detected = detectPlatformFromUrl(val.trim());
    if (detected && detected !== platform && onPlatformChange) {
      onPlatformChange(detected);
    }
  };

  const handleAnalyze = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const detected = detectPlatformFromUrl(trimmedUrl);
    if (!detected) {
      setError(
        `Please enter a valid ${cfg.label} URL (or a link from YouTube, TikTok, or Facebook).`
      );
      setData(null);
      return;
    }

    if (detected !== platform && onPlatformChange) {
      onPlatformChange(detected);
    }

    setIsAnalyzing(true);
    setError(null);
    setData(null);
    setDownloadState(null);

    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(trimmedUrl)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to analyze video URL");
      setData(json);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Check the URL and try again."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownload = (itag: string, needsMerge = false) => {
    if (!data) return;
    const format = data.formats.find((f) => f.itag === itag);
    const isAudio = !format?.hasVideo && !!format?.hasAudio;
    const height = format?.height ?? 0;
    const duration = data.details.duration;

    const size =
      format?.contentLength ??
      (duration > 0 ? estimateSize(duration, height, isAudio) : 10 * 1024 * 1024);

    setDownloadTitle(data.details.title);
    executeDownload(
      url.trim(),
      itag,
      data.details.title,
      itag,
      (state) => setDownloadState(state),
      size,
      needsMerge,
      isAudio
    );
  };

  const handleReset = () => {
    setData(null);
    setError(null);
    setUrl("");
  };

  const handleOpenWatch = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (data) {
      try {
        sessionStorage.setItem(
          "anivora-watch-cache",
          JSON.stringify({
            url: trimmed,
            details: data.details,
            formats: data.formats,
          })
        );
      } catch {
        /* ignore storage quota */
      }
    }
    router.push(`/watch?url=${encodeURIComponent(trimmed)}`);
  };

  const isDownloading = downloadState?.status === "downloading";

  return (
    <div className="w-full flex flex-col items-center">
      <UrlInput
        value={url}
        onChange={handleUrlChange}
        onSubmit={handleAnalyze}
        placeholder={cfg.singlePlaceholder}
        isLoading={isAnalyzing}
        submitLabel="Analyze"
        loadingLabel="Fetching…"
        buttonClassName={cfg.buttonClass}
        focusBorderClassName={cfg.focusBorderClass}
      />

      {error && <ErrorBanner title="Could Not Analyze Media" message={error} />}

      {/* Floating download progress toast */}
      <DownloadToast
        state={downloadState}
        title={downloadTitle}
        onDismiss={() => setDownloadState(null)}
      />

      {/* ── Idle Feature Highlights ── */}
      {!data && !isAnalyzing && !error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 sm:mt-8"
        >
          {[
            {
              icon: Sparkles,
              title: "Up to 4K Ultra HD",
              desc: "Adaptive streams automatically muxed with crystal-clear audio via FFmpeg.",
            },
            {
              icon: Zap,
              title: "Smart Auto-Detect",
              desc: "Paste any supported link—platform and optimal stream settings adjust automatically.",
            },
            {
              icon: Music,
              title: "Video & M4A Audio",
              desc: "Choose full video resolutions or extract standalone high-bitrate audio tracks.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="glass-panel rounded-2xl p-4 border border-white/[0.06] flex items-start gap-3"
            >
              <div className={`p-2 rounded-xl border shrink-0 ${cfg.accentBadge}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-zinc-200">{title}</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Loading Skeleton ── */}
      {isAnalyzing && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 mt-6 sm:mt-8 border border-white/[0.07]"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start animate-pulse">
            <div className="md:col-span-5 flex flex-col gap-4">
              <div className="aspect-video w-full rounded-xl bg-white/[0.05] border border-white/5" />
              <div className="h-5 w-4/5 rounded-lg bg-white/[0.06]" />
              <div className="h-3.5 w-1/2 rounded-lg bg-white/[0.04]" />
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="h-14 rounded-xl bg-white/[0.03] border border-white/5" />
                <div className="h-14 rounded-xl bg-white/[0.03] border border-white/5" />
                <div className="h-14 rounded-xl bg-white/[0.03] border border-white/5" />
              </div>
            </div>
            <div className="md:col-span-7 flex flex-col gap-3">
              <div className="h-4 w-44 rounded bg-white/[0.05] mb-1" />
              <div className="flex gap-2 mb-2">
                <div className="h-6 w-16 rounded-lg bg-white/[0.05]" />
                <div className="h-6 w-16 rounded-lg bg-white/[0.04]" />
                <div className="h-6 w-16 rounded-lg bg-white/[0.04]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="h-24 rounded-xl bg-white/[0.03] border border-white/5"
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Analyzed Video Card ── */}
      {data && !isAnalyzing && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 mt-6 sm:mt-8 border border-white/[0.07]"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start">
            {/* ── Left: Thumbnail + Info ── */}
            <div className="md:col-span-5 flex flex-col gap-3.5 sm:gap-4">
              <div className="relative aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/10 group bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getProxyUrl(data.details.thumbnail)}
                  alt={data.details.title}
                  className="w-full h-full object-cover thumb-hover"
                  onError={(e) => {
                    e.currentTarget.src = "/logo.png";
                  }}
                />
                {data.details.duration > 0 && (
                  <div className="absolute bottom-2.5 right-2.5 bg-black/80 px-2 py-0.5 rounded-md text-[10px] font-bold text-zinc-100 backdrop-blur-sm flex items-center gap-1 border border-white/10">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    {formatDuration(data.details.duration)}
                  </div>
                )}

                {/* Watch / Preview button */}
                <button
                  type="button"
                  onClick={handleOpenWatch}
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/45 cursor-pointer"
                >
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/80 border border-white/20 text-xs font-bold text-white hover:bg-violet-600/90 transition-colors shadow-xl">
                    <Play className="w-4 h-4 fill-current" />
                    <span>Watch Video</span>
                  </div>
                </button>
              </div>

              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-zinc-100 leading-snug line-clamp-2">
                  {data.details.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 mt-2.5 text-xs text-zinc-400">
                  {data.details.authorUrl ? (
                    <a
                      href={data.details.authorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`font-semibold ${cfg.accentText} hover:underline flex items-center gap-1 shrink-0`}
                    >
                      {data.details.author}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className={`font-semibold ${cfg.accentText} flex items-center gap-1 shrink-0`}>
                      <Film className="w-3.5 h-3.5" />
                      {data.details.author}
                    </span>
                  )}
                  {data.details.views > 0 && (
                    <span className="flex items-center gap-1 shrink-0 text-zinc-400">
                      <Eye className="w-3.5 h-3.5 text-zinc-500" />
                      {data.details.views.toLocaleString()} views
                    </span>
                  )}
                </div>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: "Duration",
                    value:
                      data.details.duration > 0
                        ? formatDuration(data.details.duration)
                        : "—",
                  },
                  { label: "Streams", value: String(data.formats.length) },
                  {
                    label: "Top Quality",
                    value:
                      data.formats.find((f) => f.hasVideo)?.qualityLabel ?? "Audio",
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-0.5"
                  >
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
                      {label}
                    </span>
                    <span className="text-xs font-extrabold text-zinc-200 truncate max-w-full">
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleOpenWatch}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-500/30 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-violet-400 fill-current" />
                  <span>Watch / Preview</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>New Link</span>
                </button>
              </div>
            </div>

            {/* ── Right: Quality Preview + Progress ── */}
            <div className="md:col-span-7 flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-extrabold text-zinc-300 uppercase tracking-widest">
                    Select Format & Quality
                  </h3>
                  <span className="text-[11px] text-zinc-500">
                    Click any stream to download
                  </span>
                </div>
                <QualityPreview
                  formats={data.formats}
                  duration={data.details.duration}
                  isDownloading={isDownloading}
                  onDownload={handleDownload}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
