"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import JSZip from "jszip";
import {
  Download,
  CheckSquare,
  Square,
  Search,
  Play,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Video,
  Music,
  Settings,
  ShieldCheck,
  Check,
} from "lucide-react";

import type {
  PlaylistDetails,
  PlaylistVideo,
  VideoFormat,
  DownloadState,
} from "@/types";
import {
  executeDownloadToBlob,
  formatDuration,
  sanitizeFilename,
} from "@/utils/downloader";
import UrlInput from "@/components/ui/UrlInput";
import ErrorBanner from "@/components/ui/ErrorBanner";


/**
 * Self-contained playlist download domain.
 * Fetches playlist metadata from /api/playlist, lets the user select
 * videos, then executes sequential downloads via executeDownload.
 */
export default function PlaylistDownloader() {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [playlistData, setPlaylistData] = useState<PlaylistDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [playlistSearch, setPlaylistSearch] = useState("");

  // Controls for quality and quantity selection
  const [qualityPreference, setQualityPreference] = useState<"high" | "medium" | "low" | "audio">("high");
  const [quantityLimit, setQuantityLimit] = useState<string>("");

  // ZIP packaging phase states
  const [zipStatus, setZipStatus] = useState<"idle" | "zipping" | "completed" | "failed">("idle");

  // Per-item download state map keyed by videoId
  const [queue, setQueue] = useState<Record<string, DownloadState>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);


  // ─── Helpers ──────────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setPlaylistData(null);
    setQueue({});
    setIsDownloading(false);
    setZipStatus("idle");
    setQuantityLimit("");

    try {
      const res = await fetch(
        `/api/playlist?url=${encodeURIComponent(url.trim())}`
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error ?? "Failed to analyze playlist URL");
      setPlaylistData(json.playlist);
      const allIds = new Set<string>(
        json.playlist.videos.map((v: PlaylistVideo) => v.id)
      );
      setSelectedVideos(allIds);
      setQuantityLimit(json.playlist.videos.length.toString());
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to parse playlist. Make sure it is public."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleVideo = (id: string) => {
    const next = new Set(selectedVideos);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedVideos(next);
    setQuantityLimit(""); // Clear custom limit display if manually toggled
  };

  const toggleSelectAll = () => {
    if (!playlistData) return;
    if (selectedVideos.size === playlistData.videos.length) {
      setSelectedVideos(new Set());
      setQuantityLimit("");
    } else {
      setSelectedVideos(new Set(playlistData.videos.map((v) => v.id)));
      setQuantityLimit(playlistData.videos.length.toString());
    }
  };

  const handleQuantityChange = (val: string) => {
    setQuantityLimit(val);
    if (!playlistData) return;
    const num = parseInt(val);
    if (!isNaN(num) && num > 0) {
      const limited = playlistData.videos.slice(0, num).map((v) => v.id);
      setSelectedVideos(new Set(limited));
    } else if (val === "") {
      setSelectedVideos(new Set());
    }
  };

  const getTargetItag = (
    formats: VideoFormat[],
    preference: "high" | "medium" | "low" | "audio"
  ): string => {
    if (preference === "audio") {
      const audioOnly =
        formats.find((f) => !f.hasVideo && f.hasAudio && f.container === "m4a") ||
        formats.find((f) => !f.hasVideo && f.hasAudio) ||
        formats.find((f) => f.hasAudio);
      if (audioOnly) return audioOnly.itag;
    } else if (preference === "high") {
      const high =
        formats.find((f) => f.hasVideo && f.hasAudio && (f.qualityLabel === "720p" || f.qualityLabel === "1080p")) ||
        formats.find((f) => f.hasVideo && f.hasAudio && parseInt(f.qualityLabel) >= 720) ||
        formats.find((f) => f.hasVideo && f.hasAudio && f.itag === "22") ||
        formats.find((f) => f.hasVideo && f.hasAudio && f.itag === "18") ||
        formats.find((f) => f.hasVideo && f.hasAudio);
      if (high) return high.itag;
    } else if (preference === "medium") {
      const medium =
        formats.find((f) => f.hasVideo && f.hasAudio && f.qualityLabel === "480p") ||
        formats.find((f) => f.hasVideo && f.hasAudio && parseInt(f.qualityLabel) === 480) ||
        formats.find((f) => f.hasVideo && f.hasAudio && f.itag === "18") ||
        formats.find((f) => f.hasVideo && f.hasAudio);
      if (medium) return medium.itag;
    } else if (preference === "low") {
      const low =
        formats.find((f) => f.hasVideo && f.hasAudio && (f.qualityLabel === "360p" || f.itag === "18")) ||
        formats.find((f) => f.hasVideo && f.hasAudio && parseInt(f.qualityLabel) <= 360) ||
        formats.find((f) => f.hasVideo && f.hasAudio);
      if (low) return low.itag;
    }

    const standardFallback =
      formats.find((f) => f.hasVideo && f.hasAudio && f.itag === "18") ||
      formats.find((f) => f.hasVideo && f.hasAudio) ||
      formats[0];
    return standardFallback ? standardFallback.itag : "18";
  };

  const filteredVideos = playlistData
    ? playlistData.videos.filter((v) =>
        v.title.toLowerCase().includes(playlistSearch.toLowerCase())
      )
    : [];

  // ─── Sequential Download Queue & ZIP Compiling ──────────────────────────────────

  const startDownloadQueue = async () => {
    if (!playlistData || selectedVideos.size === 0 || isDownloading) return;
    setIsDownloading(true);
    setZipStatus("idle");

    const selected = playlistData.videos.filter((v) => selectedVideos.has(v.id));

    // Init queue state
    const initial: Record<string, DownloadState> = {};
    selected.forEach((v) => {
      initial[v.id] = { id: v.id, status: "idle", progress: 0, downloadedMb: "0.0" };
    });
    setQueue(initial);

    const zip = new JSZip();
    let successfulDownloads = 0;

    for (let i = 0; i < selected.length; i++) {
      const video = selected[i];
      setCurrentIndex(i);

      let chosenItag = "18"; // 360p fallback
      let expectedSize: number | undefined;
      try {
        setQueue((prev) => ({
          ...prev,
          [video.id]: { id: video.id, status: "downloading", progress: 5, downloadedMb: "0.0" },
        }));
        const infoRes = await fetch(
          `/api/info?url=${encodeURIComponent(video.url)}`
        );
        if (infoRes.ok) {
          const info = await infoRes.json();
          const formats = info.formats as VideoFormat[];
          chosenItag = getTargetItag(formats, qualityPreference);
          const chosenFormat = formats.find((f) => f.itag === chosenItag);
          if (chosenFormat?.contentLength) {
            expectedSize = chosenFormat.contentLength;
          }
        }
      } catch (err) {
        console.warn("Failed to look up itag for", video.id, "— using 360p fallback", err);
      }

      // If filesize metadata is missing, calculate a fallback estimation using standard bitrates and duration
      if (!expectedSize) {
        if (video.duration && video.duration > 0) {
          const bitrateMap: Record<string, number> = {
            high: 1500 * 1000,   // 1.5 Mbps
            medium: 800 * 1000,   // 800 Kbps
            low: 400 * 1000,      // 400 Kbps
            audio: 128 * 1000,    // 128 Kbps
          };
          const bps = bitrateMap[qualityPreference] ?? 400 * 1000;
          expectedSize = (video.duration * bps) / 8;
        } else {
          // Hard static defaults as absolute fallbacks
          const defaultMap: Record<string, number> = {
            high: 20 * 1024 * 1024,
            medium: 10 * 1024 * 1024,
            low: 5 * 1024 * 1024,
            audio: 2 * 1024 * 1024,
          };
          expectedSize = defaultMap[qualityPreference] ?? 5 * 1024 * 1024;
        }
      }

      try {
        const downloadResult = await executeDownloadToBlob(
          video.url,
          chosenItag,
          video.title,
          video.id,
          (state) => {
            setQueue((prev) => ({ ...prev, [video.id]: state }));
          },
          expectedSize
        );

        if (downloadResult) {
          zip.file(downloadResult.filename, downloadResult.blob);
          successfulDownloads++;
        } else {
          setQueue((prev) => ({
            ...prev,
            [video.id]: { id: video.id, status: "failed", progress: 0, downloadedMb: "0.0" },
          }));
        }
      } catch (err) {
        console.error("Streaming error during playlist item compilation:", video.id, err);
        setQueue((prev) => ({
          ...prev,
          [video.id]: { id: video.id, status: "failed", progress: 0, downloadedMb: "0.0" },
        }));
      }
    }

    if (successfulDownloads > 0) {
      setZipStatus("zipping");
      try {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipUrl = URL.createObjectURL(zipBlob);
        const anchor = document.createElement("a");
        anchor.href = zipUrl;
        anchor.download = `${sanitizeFilename(playlistData.title)}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(zipUrl);
        setZipStatus("completed");
      } catch (err) {
        console.error("Failed to compile ZIP archive:", err);
        setZipStatus("failed");
      }
    } else {
      setZipStatus("failed");
    }

    setIsDownloading(false);
    setCurrentIndex(-1);
  };


  // ─── Queue status icon helper ─────────────────────────────────────────────────

  const QueueIcon = ({ videoId }: { videoId: string }) => {
    const s = queue[videoId];
    if (!s || s.status === "idle") return null;
    if (s.status === "downloading")
      return (
        <span className="flex items-center gap-1 text-brand-purple text-[10px] font-bold shrink-0">
          <Loader2 className="w-3 h-3 animate-spin" />
          {s.progress}%
        </span>
      );
    if (s.status === "completed")
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (s.status === "failed")
      return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
    return null;
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="w-full flex flex-col items-center">
      {/* URL Input */}
      <UrlInput
        value={url}
        onChange={setUrl}
        onSubmit={handleAnalyze}
        placeholder="Paste Playlist URL (e.g. https://www.youtube.com/playlist?list=…)"
        isLoading={isAnalyzing}
        submitLabel="Extract"
      />

      {/* Error */}
      {error && (
        <ErrorBanner title="Failed to Load Playlist" message={error} />
      )}

      {/* Playlist Panel */}
      {playlistData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8 items-start"
        >
          {/* Left: Overview card */}
          <div className="lg:col-span-4 glass-panel rounded-3xl p-6 border border-white/5 flex flex-col gap-5 self-start">
            <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={playlistData.thumbnail || "/placeholder.jpg"}
                alt={playlistData.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                <span className="text-[10px] font-bold text-zinc-100 bg-brand-purple px-2 py-0.5 rounded border border-white/5">
                  {playlistData.videoCountText}
                </span>
              </div>
            </div>

            <div>
              <h2 className="text-base font-extrabold text-zinc-100 leading-snug line-clamp-2">
                {playlistData.title}
              </h2>
              <p className="text-xs text-zinc-400 mt-1">{playlistData.author}</p>
            </div>

            <hr className="border-white/5" />

            {/* Quality Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-brand-purple" />
                Target Quality
              </label>
              <div className="relative">
                <select
                  value={qualityPreference}
                  disabled={isDownloading}
                  onChange={(e) => setQualityPreference(e.target.value as any)}
                  className="w-full bg-zinc-950/60 text-xs text-zinc-200 border border-white/10 rounded-xl px-3.5 py-2.5 outline-none focus:border-brand-purple/50 appearance-none cursor-pointer disabled:opacity-50"
                >
                  <option value="high">High Quality Video (720p/1080p)</option>
                  <option value="medium">Medium Quality Video (480p)</option>
                  <option value="low">Low Quality Video (360p)</option>
                  <option value="audio">Audio Only (M4A)</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Quantity Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-pink" />
                Quantity Limit
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max={playlistData.videos.length}
                  value={quantityLimit}
                  disabled={isDownloading}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  placeholder="No. of videos"
                  className="w-full bg-zinc-950/60 text-xs text-zinc-200 border border-white/10 rounded-xl px-3.5 py-2.5 outline-none focus:border-brand-pink/50 disabled:opacity-50"
                />
              </div>
              {/* Quick selection tags */}
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {[5, 10, 25, 50].map((num) => (
                  num <= playlistData.videos.length && (
                    <button
                      key={num}
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleQuantityChange(num.toString())}
                      className={`text-[9px] font-bold px-2 py-1 rounded border transition-all cursor-pointer disabled:opacity-50 ${
                        quantityLimit === num.toString()
                          ? "bg-brand-pink/20 text-brand-pink border-brand-pink/40"
                          : "bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 border-white/5"
                      }`}
                    >
                      First {num}
                    </button>
                  )
                ))}
              </div>
            </div>

            <hr className="border-white/5" />

            {/* Download CTA */}
            <div className="flex flex-col gap-3 mt-auto w-full">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{selectedVideos.size} selected</span>
                <button
                  disabled={isDownloading}
                  onClick={toggleSelectAll}
                  className="text-brand-purple hover:underline font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {selectedVideos.size === playlistData.videos.length
                    ? "Deselect All"
                    : "Select All"}
                </button>
              </div>

              <button
                onClick={startDownloadQueue}
                disabled={isDownloading || selectedVideos.size === 0}
                className="w-full flex items-center justify-center gap-2.5 bg-brand-purple hover:bg-purple-600 disabled:bg-purple-900 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-all shadow-lg cursor-pointer"
              >
                {isDownloading ? (
                  zipStatus === "zipping" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating ZIP Archive…
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Downloading {currentIndex + 1} / {selectedVideos.size}…
                    </>
                  )
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download ZIP ({selectedVideos.size} Item{selectedVideos.size !== 1 ? "s" : ""})
                  </>
                )}
              </button>

              {/* Status notifications */}
              {zipStatus === "zipping" && (
                <div className="w-full bg-brand-purple/10 border border-brand-purple/20 p-3 rounded-xl flex flex-col gap-1.5 text-brand-purple">
                  <span className="flex items-center gap-1.5 text-xs font-bold animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Compiling ZIP archive…
                  </span>
                  <p className="text-[9px] text-zinc-500 leading-snug">
                    Packaging file buffers. Do not navigate away from this page.
                  </p>
                </div>
              )}

              {zipStatus === "completed" && !isDownloading && (
                <div className="w-full bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-start gap-2.5 text-emerald-400">
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-tight">
                    <span className="font-bold block">Compilation Complete!</span>
                    <span className="text-zinc-400">
                      The `.zip` archive was saved with your movie title.
                    </span>
                  </div>
                </div>
              )}

              {zipStatus === "failed" && !isDownloading && (
                <div className="w-full bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-start gap-2.5 text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-tight">
                    <span className="font-bold block">Aggregation Interrupted</span>
                    <span className="text-zinc-400">
                      ZIP file could not be generated. Ensure downloads succeed.
                    </span>
                  </div>
                </div>
              )}

              {/* Reset button after queue finishes */}
              {!isDownloading && Object.keys(queue).length > 0 && (
                <button
                  onClick={() => {
                    setQueue({});
                    setPlaylistData(null);
                    setUrl("");
                    setSelectedVideos(new Set());
                    setZipStatus("idle");
                    setQuantityLimit("");
                  }}
                  className="w-full flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 text-xs font-semibold py-2 border border-white/5 rounded-xl transition-all hover:bg-white/[0.03] cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Start Over
                </button>
              )}
            </div>
          </div>


          {/* Right: Video list */}
          <div className="lg:col-span-8 glass-panel rounded-3xl border border-white/5 overflow-hidden">
            {/* Search + header */}
            <div className="p-4 border-b border-white/5 flex items-center gap-3">
              <Search className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                type="text"
                placeholder="Search videos…"
                value={playlistSearch}
                onChange={(e) => setPlaylistSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
              />
            </div>

            <div className="max-h-[520px] overflow-y-auto divide-y divide-white/[0.03]">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  onClick={() => toggleVideo(video.id)}
                  className={`flex items-center gap-4 p-4 cursor-pointer transition-all ${
                    selectedVideos.has(video.id)
                      ? "bg-white/[0.03]"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  {/* Checkbox */}
                  <div className="shrink-0 text-brand-purple">
                    {selectedVideos.has(video.id) ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4 text-zinc-600" />
                    )}
                  </div>

                  {/* Thumbnail */}
                  <div className="relative w-20 aspect-video rounded-lg overflow-hidden border border-white/5 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0.5 right-0.5 bg-black/80 text-[8px] px-1 rounded">
                      {video.durationText || formatDuration(video.duration)}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 line-clamp-2 leading-snug">
                      {video.title}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {video.author}
                    </p>
                  </div>

                  {/* Queue status / play index */}
                  <div className="shrink-0 flex items-center gap-2">
                    <QueueIcon videoId={video.id} />
                    {!queue[video.id] && (
                      <span className="text-[10px] text-zinc-600 font-mono">
                        #{video.index + 1}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {filteredVideos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                  <Play className="w-8 h-8 mb-3 opacity-30" />
                  <p className="text-sm">No videos match your search.</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
