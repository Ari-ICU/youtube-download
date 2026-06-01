"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Video,
  Music,
  Layers,
  Clock,
  Eye,
  ExternalLink,
  Sparkles,
} from "lucide-react";

import type { VideoDetails, VideoFormat, DownloadState } from "@/types";
import { executeDownload, formatDuration, estimateSize } from "@/utils/downloader";
import UrlInput from "@/components/ui/UrlInput";
import ErrorBanner from "@/components/ui/ErrorBanner";
import DownloadProgress from "@/components/ui/DownloadProgress";

export default function SingleDownloader() {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [data, setData] = useState<{
    details: VideoDetails;
    formats: VideoFormat[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setData(null);
    setDownloadState(null);

    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(url.trim())}`);
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

  /**
   * Kick off a download for a given format.
   * `needsMerge` is true for video-only adaptive streams (4K, 1440p video-only)
   * where the server must merge the best audio track.
   */
  const handleDownload = (itag: string, needsMerge = false) => {
    if (!data) return;
    const format = data.formats.find((f) => f.itag === itag);
    const isAudio = !format?.hasVideo && !!format?.hasAudio;
    const height = format?.height ?? 0;
    const duration = data.details.duration;

    const size =
      format?.contentLength ??
      (duration > 0 ? estimateSize(duration, height, isAudio) : 10 * 1024 * 1024);

    executeDownload(
      url,
      itag,
      data.details.title,
      itag,
      (state) => setDownloadState(state),
      size,
      needsMerge
    );
  };

  // ─── Derived format groups ────────────────────────────────────────────────────

  const combined      = data?.formats.filter((f) => f.hasVideo && f.hasAudio) ?? [];
  const audioOnly     = data?.formats.filter((f) => !f.hasVideo && f.hasAudio).slice(0, 4) ?? [];
  // 4K / 1440p video-only adaptive streams — need server-side merge with audio
  const uhd           = data?.formats.filter((f) => f.hasVideo && !f.hasAudio && f.height >= 1440) ?? [];
  // Lower-res video-only adaptive streams
  const adaptiveOther = data?.formats.filter((f) => f.hasVideo && !f.hasAudio && f.height < 1440) ?? [];

  const isDownloading = downloadState?.status === "downloading";

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="w-full flex flex-col items-center">
      <UrlInput
        value={url}
        onChange={setUrl}
        onSubmit={handleAnalyze}
        placeholder="Paste YouTube Video URL (e.g. https://www.youtube.com/watch?v=…)"
        isLoading={isAnalyzing}
        submitLabel="Analyze"
      />

      {error && <ErrorBanner title="Failed to Load Content" message={error} />}

      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full glass-panel rounded-3xl p-6 md:p-8 mt-8 border border-white/5"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">

            {/* ── Left: Thumbnail + Info ── */}
            <div className="md:col-span-5 flex flex-col gap-4">
              <div className="relative aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/10 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.details.thumbnail}
                  alt={data.details.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] font-bold text-zinc-100 backdrop-blur-sm flex items-center gap-1 border border-white/5">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  {formatDuration(data.details.duration)}
                </div>
              </div>

              <div>
                <h2 className="text-lg md:text-xl font-extrabold text-zinc-100 leading-snug line-clamp-2">
                  {data.details.title}
                </h2>
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-zinc-400">
                  <a
                    href={data.details.authorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-purple hover:underline flex items-center gap-1 shrink-0"
                  >
                    {data.details.author}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="flex items-center gap-1 shrink-0">
                    <Eye className="w-3.5 h-3.5" />
                    {data.details.views.toLocaleString()} views
                  </span>
                </div>
              </div>
            </div>

            {/* ── Right: Download Panel ── */}
            <div className="md:col-span-7 flex flex-col gap-6">
              {downloadState && <DownloadProgress state={downloadState} />}

              <div className="flex flex-col gap-4">

                {/* ── 4K / 1440p UHD (video-only + merged audio) ── */}
                {uhd.length > 0 && (
                  <div>
                    <h4 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      4K / 1440p UHD
                      <span className="text-[9px] font-normal normal-case text-zinc-500 border border-white/5 px-1.5 py-0.5 rounded-md ml-1">
                        video + best audio merged
                      </span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {uhd.map((format) => (
                        <button
                          key={format.itag}
                          disabled={isDownloading}
                          onClick={() => handleDownload(format.itag, true)}
                          className="flex items-center justify-between p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] hover:bg-amber-500/[0.08] hover:border-amber-500/40 text-left transition-all group disabled:opacity-50 cursor-pointer"
                        >
                          <div>
                            <span className="text-sm font-bold text-zinc-100 block group-hover:text-amber-400 transition-colors">
                              {format.qualityLabel} ({format.container.toUpperCase()})
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              {format.fps ? `${format.fps} FPS` : ""}
                              {format.fps && format.contentLength ? " • " : ""}
                              {format.contentLength
                                ? `~${(format.contentLength / (1024 * 1024)).toFixed(0)} MB`
                                : "Size varies (merged)"}
                            </span>
                          </div>
                          <Download className="w-4 h-4 text-zinc-400 group-hover:text-amber-400 transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Combined Video + Audio ── */}
                <div>
                  <h4 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-brand-purple" />
                    Recommended (Video + Audio)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {combined.map((format) => (
                      <button
                        key={format.itag}
                        disabled={isDownloading}
                        onClick={() => handleDownload(format.itag)}
                        className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-brand-purple/30 text-left transition-all group disabled:opacity-50 cursor-pointer"
                      >
                        <div>
                          <span className="text-sm font-bold text-zinc-100 block group-hover:text-brand-purple transition-colors">
                            {format.qualityLabel} ({format.container.toUpperCase()})
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {format.fps ? `${format.fps} FPS` : ""}
                            {format.fps && format.contentLength ? " • " : ""}
                            {format.contentLength
                              ? `${(format.contentLength / (1024 * 1024)).toFixed(1)} MB`
                              : "Unknown Size"}
                          </span>
                        </div>
                        <Download className="w-4 h-4 text-zinc-400 group-hover:text-brand-purple transition-colors" />
                      </button>
                    ))}
                    {combined.length === 0 && (
                      <p className="text-xs text-zinc-500 italic">No combined formats available.</p>
                    )}
                  </div>
                </div>

                {/* ── Audio Only ── */}
                <div className="mt-2">
                  <h4 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-brand-pink" />
                    Audio Only
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {audioOnly.map((format) => (
                      <button
                        key={format.itag}
                        disabled={isDownloading}
                        onClick={() => handleDownload(format.itag)}
                        className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-brand-pink/30 text-left transition-all group disabled:opacity-50 cursor-pointer"
                      >
                        <div>
                          <span className="text-sm font-bold text-zinc-100 block group-hover:text-brand-pink transition-colors">
                            Audio ({format.qualityLabel})
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {format.mimeType.includes("m4a") ? "m4a (preferred)" : "webm"} •{" "}
                            {format.contentLength
                              ? `${(format.contentLength / (1024 * 1024)).toFixed(1)} MB`
                              : "Unknown Size"}
                          </span>
                        </div>
                        <Download className="w-4 h-4 text-zinc-400 group-hover:text-brand-pink transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Adaptive (lower-res video-only) ── */}
                {adaptiveOther.length > 0 && (
                  <div className="mt-2">
                    <details className="group border border-white/5 rounded-xl bg-white/[0.01]">
                      <summary className="flex items-center justify-between p-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:bg-white/[0.03] rounded-xl">
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-brand-blue" />
                          Adaptive Formats (Video Only)
                        </span>
                        <span className="text-[10px] lowercase text-zinc-500 font-normal px-2 py-0.5 border border-white/5 rounded-md">
                          click to expand
                        </span>
                      </summary>
                      <div className="p-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-52 overflow-y-auto">
                        {adaptiveOther.map((format) => (
                          <button
                            key={format.itag}
                            disabled={isDownloading}
                            onClick={() => handleDownload(format.itag, true)}
                            className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-zinc-950/40 hover:bg-white/[0.04] text-left transition-all group disabled:opacity-50 cursor-pointer"
                          >
                            <div>
                              <span className="text-xs font-bold text-zinc-300 block">
                                {format.qualityLabel} ({format.container.toUpperCase()})
                              </span>
                              <span className="text-[9px] text-zinc-500">
                                {format.fps ? `${format.fps} FPS` : ""}
                                {format.fps && format.contentLength ? " • " : ""}
                                {format.contentLength
                                  ? `${(format.contentLength / (1024 * 1024)).toFixed(1)} MB`
                                  : "Unknown Size"}
                              </span>
                            </div>
                            <Download className="w-3.5 h-3.5 text-zinc-500 group-hover:text-brand-blue" />
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                )}

              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
