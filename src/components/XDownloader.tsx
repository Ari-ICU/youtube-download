"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, Eye } from "lucide-react";

import type { VideoDetails, VideoFormat, DownloadState } from "@/types";
import { executeDownload, formatDuration, estimateSize } from "@/utils/downloader";
import UrlInput from "@/components/ui/UrlInput";
import ErrorBanner from "@/components/ui/ErrorBanner";
import DownloadToast from "@/components/ui/DownloadToast";
import QualityPreview from "@/components/ui/QualityPreview";

const getProxyUrl = (url?: string) => {
  if (!url) return "/logo.png";
  if (
    url.includes("fbcdn.net") ||
    url.includes("cdninstagram.com") ||
    url.includes("instagram.com") ||
    url.includes("bstarstatic.com") ||
    url.includes("bilibili.tv") ||
    url.includes("twimg.com") ||
    url.includes("pbs.twimg.com")
  ) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

export default function XDownloader({ bypassGlobal }: { bypassGlobal: boolean }) {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [data, setData] = useState<{
    details: VideoDetails;
    formats: VideoFormat[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const [downloadTitle, setDownloadTitle] = useState<string>("");

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const isXUrl =
      trimmedUrl.includes("x.com") ||
      trimmedUrl.includes("twitter.com") ||
      trimmedUrl.includes("www.x.com") ||
      trimmedUrl.includes("www.twitter.com");

    if (!isXUrl) {
      setError(
        "Please enter a valid X (Twitter) video URL (e.g. https://x.com/username/status/...)"
      );
      setData(null);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setData(null);
    setDownloadState(null);

    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(trimmedUrl)}&bypassGlobal=${bypassGlobal}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to analyze X video URL");
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

  const handleDownload = (itag: string) => {
    if (!data) return;
    const format = data.formats.find((f) => f.itag === itag);
    const isAudio = !format?.hasVideo && !!format?.hasAudio;
    const height = format?.height ?? 0;
    const duration = data.details.duration;

    const size =
      format?.contentLength ??
      (duration > 0 ? estimateSize(duration, height, isAudio) : 10 * 1024 * 1024);

    setDownloadTitle(data.details.title);

    // X/Twitter uses HLS streams natively — we must force SSE/temp-file mode
    // to assemble fragments properly via ffmpeg before saving.
    executeDownload(
      url,
      itag,
      data.details.title,
      itag,
      (state) => setDownloadState(state),
      size,
      true, // Force SSE/temp-file mode for HLS
      isAudio,
      bypassGlobal
    );
  };

  const isDownloading = downloadState?.status === "downloading";

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full mt-4">
        <UrlInput
          value={url}
          onChange={setUrl}
          onSubmit={handleAnalyze}
          placeholder="Paste X/Twitter video URL (e.g. https://x.com/username/status/…)"
          isLoading={isAnalyzing}
          submitLabel="Analyze"
          buttonClassName="bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 border border-zinc-700 text-zinc-100"
        />
      </div>

      {error && <ErrorBanner title="Failed to Load Content" message={error} />}

      {/* Floating download progress toast */}
      <DownloadToast
        state={downloadState}
        title={downloadTitle}
        onDismiss={() => setDownloadState(null)}
      />

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
                  src={getProxyUrl(data.details.thumbnail)}
                  alt={data.details.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.src = "/logo.png"; }}
                />
                {data.details.duration > 0 && (
                  <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] font-bold text-zinc-100 backdrop-blur-sm flex items-center gap-1 border border-white/5">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    {formatDuration(data.details.duration)}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-zinc-100 leading-snug line-clamp-2">
                  {data.details.title}
                </h2>
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-300 flex items-center gap-1 shrink-0">
                    {data.details.author}
                  </span>
                  {data.details.views > 0 && (
                    <span className="flex items-center gap-1 shrink-0">
                      <Eye className="w-3.5 h-3.5" />
                      {data.details.views.toLocaleString()} views
                    </span>
                  )}
                </div>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                {[
                  { label: "Duration", value: data.details.duration > 0 ? formatDuration(data.details.duration) : "—" },
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
                  onDownload={(itag) => handleDownload(itag)}
                />
              </div>
            </div>

          </div>
        </motion.div>
      )}
    </div>
  );
}
