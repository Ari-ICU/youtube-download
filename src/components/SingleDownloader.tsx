"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, Eye, ExternalLink, Play } from "lucide-react";

import type { VideoDetails, VideoFormat, DownloadState } from "@/types";
import { executeDownload, formatDuration, estimateSize } from "@/utils/downloader";
import UrlInput from "@/components/ui/UrlInput";
import ErrorBanner from "@/components/ui/ErrorBanner";
import DownloadToast from "@/components/ui/DownloadToast";
import QualityPreview from "@/components/ui/QualityPreview";
import VideoPreviewModal from "@/components/ui/VideoPreviewModal";

export default function SingleDownloader() {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [data, setData] = useState<{
    details: VideoDetails;
    formats: VideoFormat[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const [downloadTitle, setDownloadTitle] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);

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
      url,
      itag,
      data.details.title,
      itag,
      (state) => setDownloadState(state),
      size,
      needsMerge,
      isAudio
    );
  };

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

      {/* Floating download progress toast */}
      <DownloadToast
        state={downloadState}
        title={downloadTitle}
        onDismiss={() => setDownloadState(null)}
      />

      {/* Video preview modal */}
      {data && previewOpen && (
        <VideoPreviewModal
          details={data.details}
          formats={data.formats}
          onClose={() => setPreviewOpen(false)}
          onDownload={(itag, needsMerge) => {
            setPreviewOpen(false);
            handleDownload(itag, needsMerge);
          }}
        />
      )}

      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 mt-6 sm:mt-8 border border-white/5"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start">

            {/* ── Left: Thumbnail + Info ── */}
            <div className="md:col-span-5 flex flex-col gap-3 sm:gap-4">
              <div className="relative aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/10 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.details.thumbnail}
                  alt={data.details.title}
                  className="w-full h-full object-cover thumb-hover"
                />
                <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] font-bold text-zinc-100 backdrop-blur-sm flex items-center gap-1 border border-white/5">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  {formatDuration(data.details.duration)}
                </div>
                {/* Preview button */}
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-black/70 border border-white/20 flex items-center justify-center hover:bg-violet-600/80 transition-colors">
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  </div>
                </button>
              </div>

              <div>
                <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-zinc-100 leading-snug line-clamp-2">
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

              {/* Stats strip */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { label: "Duration", value: formatDuration(data.details.duration) },
                  { label: "Formats",  value: String(data.formats.length) },
                  { label: "Best",     value: data.formats.find((f) => f.hasVideo)?.qualityLabel ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl bg-white/[0.03] border border-white/5 gap-0.5">
                    <span className="text-[8px] sm:text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
                    <span className="text-[11px] sm:text-xs font-extrabold text-zinc-200">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: Quality Preview + Progress ── */}
            <div className="md:col-span-7 flex flex-col gap-4">
              <div>
                <h3 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest mb-3">
                  Select Quality to Download
                </h3>
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
