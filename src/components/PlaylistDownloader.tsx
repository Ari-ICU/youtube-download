"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Settings,
  ShieldCheck,
  Check,
  Sparkles,
  Video,
  Music,
  Layers,
  ChevronDown,
  Eye,
  Scissors,
} from "lucide-react";

import type {
  PlaylistDetails,
  PlaylistVideo,
  VideoFormat,
  DownloadState,
  QualityPreference,
  Platform,
} from "@/types";
import {
  executeDownloadToBlob,
  formatDuration,
  sanitizeFilename,
  estimateSize,
  getProxyUrl,
  detectPlatformFromUrl,
} from "@/utils/downloader";
import { PLATFORM_CONFIGS } from "@/utils/platforms";
import UrlInput from "@/components/ui/UrlInput";
import ErrorBanner from "@/components/ui/ErrorBanner";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import VideoPreviewModal from "@/components/ui/VideoPreviewModal";
import DownloadToast from "@/components/ui/DownloadToast";
import PlaylistToast, { type PlaylistQueueItem } from "@/components/ui/PlaylistToast";

const QUALITY_OPTIONS: DropdownOption<QualityPreference>[] = [
  {
    value: "4k",
    label: "4K / 2160p UHD",
    description: "Highest resolution (requires FFmpeg)",
    icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />,
    badge: "4K",
  },
  {
    value: "high",
    label: "High Quality (1080p / 720p)",
    description: "Best available HD video + audio",
    icon: <Video className="w-3.5 h-3.5 text-violet-400" />,
  },
  {
    value: "medium",
    label: "Medium Quality (480p)",
    description: "Balanced size and clarity",
    icon: <Video className="w-3.5 h-3.5 text-blue-400" />,
  },
  {
    value: "low",
    label: "Low Quality (360p)",
    description: "Fastest download and smallest size",
    icon: <Layers className="w-3.5 h-3.5 text-zinc-400" />,
  },
  {
    value: "audio",
    label: "Audio Only (M4A)",
    description: "Extract clean audio track",
    icon: <Music className="w-3.5 h-3.5 text-pink-400" />,
  },
];

interface PlaylistDownloaderProps {
  platform: Platform;
  onPlatformChange?: (platform: Platform) => void;
}

export default function PlaylistDownloader({
  platform,
  onPlatformChange,
}: PlaylistDownloaderProps) {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [playlistData, setPlaylistData] = useState<PlaylistDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [qualityPreference, setQualityPreference] = useState<QualityPreference>("4k");
  const [quantityLimit, setQuantityLimit] = useState<string>("");
  const [zipStatus, setZipStatus] = useState<"idle" | "zipping" | "completed" | "failed">("idle");
  const [queue, setQueue] = useState<Record<string, DownloadState>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [controlsOpen, setControlsOpen] = useState(false);

  const cfg = PLATFORM_CONFIGS[platform];

  // Per-video format preview
  const [previewFormats, setPreviewFormats] = useState<
    Record<string, VideoFormat[] | "loading" | "error">
  >({});
  const [modalVideo, setModalVideo] = useState<PlaylistVideo | null>(null);

  // Single-video download toast
  const [singleDownloadState, setSingleDownloadState] = useState<DownloadState | null>(null);
  const [singleDownloadTitle, setSingleDownloadTitle] = useState<string>("");

  // Playlist batch toast state
  const [playlistToastItems, setPlaylistToastItems] = useState<PlaylistQueueItem[]>([]);
  const [playlistToastVisible, setPlaylistToastVisible] = useState(false);
  const [playlistToastCurrentId, setPlaylistToastCurrentId] = useState<string | null>(null);
  const [playlistToastDone, setPlaylistToastDone] = useState(false);

  const handleUrlChange = (val: string) => {
    setUrl(val);
    const detected = detectPlatformFromUrl(val.trim());
    if (detected && detected !== platform && onPlatformChange) {
      onPlatformChange(detected);
    }
  };

  const openPreview = async (video: PlaylistVideo, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalVideo(video);
    if (previewFormats[video.id] && previewFormats[video.id] !== "error") return;
    setPreviewFormats((p) => ({ ...p, [video.id]: "loading" }));
    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(video.url)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPreviewFormats((p) => ({ ...p, [video.id]: json.formats }));
    } catch {
      setPreviewFormats((p) => ({ ...p, [video.id]: "error" }));
    }
  };

  const handleAnalyze = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const detected = detectPlatformFromUrl(trimmed);
    if (!detected) {
      setError(`Please enter a valid ${cfg.label} playlist or feed URL.`);
      setPlaylistData(null);
      return;
    }

    if (detected !== platform && onPlatformChange) {
      onPlatformChange(detected);
    }

    setIsAnalyzing(true);
    setError(null);
    setPlaylistData(null);
    setQueue({});
    setIsDownloading(false);
    setZipStatus("idle");
    setQuantityLimit("");
    setControlsOpen(false);

    try {
      const res = await fetch(`/api/playlist?url=${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to analyze playlist URL");
      setPlaylistData(json.playlist);
      setSelectedVideos(new Set<string>(json.playlist.videos.map((v: PlaylistVideo) => v.id)));
      setQuantityLimit(json.playlist.videos.length.toString());
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to parse playlist. Make sure the content is public and accessible."
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
    setQuantityLimit("");
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
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setSelectedVideos(new Set(playlistData.videos.slice(0, num).map((v) => v.id)));
    } else if (val === "") {
      setSelectedVideos(new Set());
    }
  };

  const getTargetFormat = (
    formats: VideoFormat[],
    preference: QualityPreference
  ): { itag: string; merge: boolean } => {
    const fallback = { itag: "best", merge: true };

    if (preference === "audio") {
      const f =
        formats.find((f) => !f.hasVideo && f.hasAudio && f.container === "m4a") ||
        formats.find((f) => !f.hasVideo && f.hasAudio);
      return f ? { itag: f.itag, merge: false } : fallback;
    }

    const videoFormats = formats.filter((f) => f.hasVideo);
    if (videoFormats.length === 0) return fallback;

    const toResult = (f: VideoFormat) => ({
      itag: f.itag,
      merge: f.hasVideo && !f.hasAudio,
    });

    if (preference === "4k") {
      const f =
        videoFormats.find((f) => f.height >= 2160) ||
        videoFormats.find((f) => f.height >= 1440) ||
        videoFormats.find((f) => f.height >= 1080) ||
        videoFormats[0];
      return toResult(f);
    }

    if (preference === "high") {
      const f =
        videoFormats.find((f) => f.height === 1080) ||
        videoFormats.find((f) => f.height >= 720 && f.height <= 1080) ||
        videoFormats.find((f) => f.height >= 720) ||
        videoFormats[0];
      return toResult(f);
    }

    if (preference === "medium") {
      const f =
        videoFormats.find((f) => f.height === 480 || f.height === 540) ||
        videoFormats.find((f) => f.height <= 540 && f.height > 0) ||
        videoFormats[0];
      return toResult(f);
    }

    if (preference === "low") {
      const f =
        videoFormats.find((f) => f.hasAudio && f.height <= 360) ||
        videoFormats.find((f) => f.height <= 360 && f.height > 0) ||
        videoFormats[videoFormats.length - 1];
      return toResult(f);
    }

    return toResult(videoFormats[0]);
  };

  const filteredVideos = playlistData
    ? playlistData.videos.filter((v) =>
        v.title.toLowerCase().includes(playlistSearch.toLowerCase())
      )
    : [];

  const handleSingleDownload = (
    video: PlaylistVideo,
    itag: string,
    needsMerge: boolean
  ) => {
    const formats = previewFormats[video.id];
    const format = Array.isArray(formats) ? formats.find((f) => f.itag === itag) : undefined;
    const isAudio = !format?.hasVideo && !!format?.hasAudio;
    const height = format?.height ?? 0;
    const size =
      format?.contentLength ??
      (video.duration > 0 ? estimateSize(video.duration, height, isAudio) : 10 * 1024 * 1024);

    setSingleDownloadTitle(video.title);

    import("@/utils/downloader").then(({ executeDownload }) => {
      executeDownload(
        video.url,
        itag,
        video.title,
        video.id,
        (state) => setSingleDownloadState(state),
        size,
        needsMerge,
        isAudio
      );
    });
  };

  const startDownloadQueue = async () => {
    if (!playlistData || selectedVideos.size === 0 || isDownloading) return;
    setIsDownloading(true);
    setZipStatus("idle");
    setControlsOpen(false);

    const selected = playlistData.videos.filter((v) => selectedVideos.has(v.id));

    const initial: Record<string, DownloadState> = {};
    selected.forEach((v) => {
      initial[v.id] = { id: v.id, status: "idle", progress: 0, downloadedMb: "0.0" };
    });
    setQueue(initial);

    const initialToastItems: PlaylistQueueItem[] = selected.map((v) => ({
      id: v.id,
      title: v.title,
      state: { id: v.id, status: "idle", progress: 0, downloadedMb: "0.0" },
    }));
    setPlaylistToastItems(initialToastItems);
    setPlaylistToastVisible(true);
    setPlaylistToastDone(false);
    setPlaylistToastCurrentId(null);

    const updateVideoState = (videoId: string, state: DownloadState) => {
      setQueue((prev) => ({ ...prev, [videoId]: state }));
      setPlaylistToastItems((prev) =>
        prev.map((item) => (item.id === videoId ? { ...item, state } : item))
      );
    };

    const zip = new JSZip();
    let successfulDownloads = 0;

    for (let i = 0; i < selected.length; i++) {
      const video = selected[i];
      setCurrentIndex(i);
      setPlaylistToastCurrentId(video.id);

      let chosenItag = "18";
      let needsMerge = false;
      let expectedSize: number | undefined;
      let chosenIsAudio = false;

      updateVideoState(video.id, {
        id: video.id,
        status: "downloading",
        progress: 0,
        downloadedMb: "0.0",
      });

      try {
        const infoRes = await fetch(`/api/info?url=${encodeURIComponent(video.url)}`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          const formats = info.formats as VideoFormat[];
          const target = getTargetFormat(formats, qualityPreference);
          chosenItag = target.itag;
          needsMerge = target.merge;
          const chosenFormat = formats.find((f) => f.itag === chosenItag);
          chosenIsAudio = !chosenFormat?.hasVideo && !!chosenFormat?.hasAudio;
          expectedSize =
            chosenFormat?.contentLength ??
            (video.duration > 0
              ? estimateSize(video.duration, chosenFormat?.height ?? 0, qualityPreference === "audio")
              : undefined);
        }
      } catch (err) {
        console.warn("Failed to look up format for", video.id, err);
      }

      if (!expectedSize) {
        const sizeMap: Record<QualityPreference, number> = {
          "4k": 500 * 1024 * 1024,
          high: 20 * 1024 * 1024,
          medium: 10 * 1024 * 1024,
          low: 5 * 1024 * 1024,
          audio: 2 * 1024 * 1024,
        };
        expectedSize = sizeMap[qualityPreference];
      }

      try {
        const result = await executeDownloadToBlob(
          video.url,
          chosenItag,
          video.title,
          video.id,
          (state) => updateVideoState(video.id, state),
          expectedSize,
          needsMerge,
          chosenIsAudio
        );
        if (result) {
          zip.file(result.filename, result.blob);
          successfulDownloads++;
          updateVideoState(video.id, {
            id: video.id,
            status: "completed",
            progress: 100,
            downloadedMb:
              result.blob.size > 0 ? (result.blob.size / 1024 / 1024).toFixed(1) : "—",
          });
        } else {
          updateVideoState(video.id, {
            id: video.id,
            status: "failed",
            progress: 0,
            downloadedMb: "0.0",
          });
        }
      } catch (err) {
        console.error("Download error for", video.id, err);
        updateVideoState(video.id, {
          id: video.id,
          status: "failed",
          progress: 0,
          downloadedMb: "0.0",
        });
      }
    }

    setPlaylistToastCurrentId(null);
    setPlaylistToastDone(true);

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
        console.error("Failed to compile ZIP:", err);
        setZipStatus("failed");
      }
    } else {
      setZipStatus("failed");
    }
    setIsDownloading(false);
    setCurrentIndex(-1);
  };

  const QueueIcon = ({ videoId }: { videoId: string }) => {
    const s = queue[videoId];
    if (!s || s.status === "idle") return null;
    if (s.status === "downloading") {
      const isMerging = s.phase === "merging";
      const isTransferring = s.phase === "transferring";
      return (
        <span className={`flex items-center gap-1 ${cfg.accentText} text-[10px] font-bold shrink-0`}>
          {isMerging ? (
            <Scissors className="w-3 h-3 text-amber-400 animate-pulse" />
          ) : (
            <Loader2 className="w-3 h-3 animate-spin" />
          )}
          {isMerging ? "merge" : isTransferring ? "saving" : `${s.progress}%`}
        </span>
      );
    }
    if (s.status === "completed") {
      return (
        <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {s.downloadedMb !== "—" ? `${s.downloadedMb}MB` : ""}
        </span>
      );
    }
    if (s.status === "failed") return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
    return null;
  };

  return (
    <div className="w-full flex flex-col items-center">
      <UrlInput
        value={url}
        onChange={handleUrlChange}
        onSubmit={handleAnalyze}
        buttonClassName={cfg.buttonClass}
        focusBorderClassName={cfg.focusBorderClass}
        placeholder={cfg.playlistPlaceholder}
        isLoading={isAnalyzing}
        submitLabel="Extract"
        loadingLabel="Extracting…"
      />

      {error && <ErrorBanner title="Failed to Extract Playlist" message={error} />}

      {/* Floating single-video download toast */}
      <DownloadToast
        state={singleDownloadState}
        title={singleDownloadTitle}
        onDismiss={() => setSingleDownloadState(null)}
      />

      {/* Floating playlist batch progress toast */}
      {playlistToastVisible && (
        <PlaylistToast
          items={playlistToastItems}
          currentId={playlistToastCurrentId}
          totalCount={playlistToastItems.length}
          completedCount={playlistToastItems.filter((i) => i.state.status === "completed").length}
          failedCount={playlistToastItems.filter((i) => i.state.status === "failed").length}
          isFinished={playlistToastDone}
          onDismiss={() => {
            setPlaylistToastVisible(false);
            setPlaylistToastItems([]);
          }}
        />
      )}

      {/* Video preview modal */}
      {modalVideo && Array.isArray(previewFormats[modalVideo.id]) && (
        <VideoPreviewModal
          details={{
            videoId: modalVideo.id,
            title: modalVideo.title,
            author: modalVideo.author,
            authorUrl: modalVideo.url,
            thumbnail: getProxyUrl(modalVideo.thumbnail),
            duration: modalVideo.duration,
            views: 0,
            description: "",
          }}
          formats={previewFormats[modalVideo.id] as VideoFormat[]}
          videoUrl={modalVideo.url}
          onClose={() => setModalVideo(null)}
          onDownload={(itag, needsMerge) => {
            setModalVideo(null);
            handleSingleDownload(modalVideo, itag, needsMerge);
          }}
        />
      )}

      {/* ── Extracted Playlist View ── */}
      {playlistData && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full mt-6 sm:mt-8 flex flex-col gap-4"
        >
          {/* Mobile: compact header bar */}
          <div className="lg:hidden glass-panel rounded-2xl border border-white/[0.07] overflow-hidden">
            <button
              type="button"
              onClick={() => setControlsOpen((v) => !v)}
              className="w-full flex items-center gap-3 p-3.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
            >
              <div className="relative w-14 aspect-video rounded-lg overflow-hidden border border-white/10 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getProxyUrl(playlistData.thumbnail)}
                  alt={playlistData.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/logo.png";
                  }}
                />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-zinc-100 truncate">{playlistData.title}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {playlistData.videoCountText} · {selectedVideos.size} selected
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200 ${
                  controlsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <AnimatePresence>
              {controlsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden border-t border-white/[0.06]"
                >
                  <div className="p-4 flex flex-col gap-4 bg-zinc-950/60">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Settings className={`w-3.5 h-3.5 ${cfg.accentText}`} />
                        Target Quality
                      </label>
                      <Dropdown<QualityPreference>
                        options={QUALITY_OPTIONS}
                        value={qualityPreference}
                        onChange={setQualityPreference}
                        disabled={isDownloading}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                        <ShieldCheck className={`w-3.5 h-3.5 ${cfg.accentText}`} />
                        Quantity Limit
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={playlistData.videos.length}
                        value={quantityLimit}
                        disabled={isDownloading}
                        onChange={(e) => handleQuantityChange(e.target.value)}
                        placeholder="Number of videos to include"
                        className="w-full bg-zinc-900 text-xs text-zinc-200 border border-white/10 rounded-xl px-3.5 py-2.5 outline-none disabled:opacity-50"
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[5, 10, 25, 50].map(
                          (num) =>
                            num <= playlistData.videos.length && (
                              <button
                                key={num}
                                type="button"
                                disabled={isDownloading}
                                onClick={() => handleQuantityChange(num.toString())}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                  quantityLimit === num.toString()
                                    ? cfg.accentBadge
                                    : "bg-white/[0.03] text-zinc-400 border-white/5"
                                }`}
                              >
                                First {num}
                              </button>
                            )
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                      <span>{selectedVideos.size} selected</span>
                      <button
                        disabled={isDownloading}
                        onClick={toggleSelectAll}
                        className={`font-semibold cursor-pointer ${cfg.accentText}`}
                      >
                        {selectedVideos.size === playlistData.videos.length
                          ? "Deselect All"
                          : "Select All"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Desktop layout ── */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-6 items-start">
            {/* Left controls card */}
            <div className="lg:col-span-4 glass-panel rounded-3xl p-6 border border-white/[0.07] flex flex-col gap-5 self-start">
              <div className="relative aspect-video rounded-xl overflow-hidden shadow-xl border border-white/10 bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getProxyUrl(playlistData.thumbnail)}
                  alt={playlistData.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/logo.png";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex items-end p-3.5">
                  <span className="text-[10px] font-bold text-white bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10">
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

              <hr className="border-white/[0.06]" />

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Settings className={`w-3.5 h-3.5 ${cfg.accentText}`} />
                  Target Quality
                </label>
                <Dropdown<QualityPreference>
                  options={QUALITY_OPTIONS}
                  value={qualityPreference}
                  onChange={setQualityPreference}
                  disabled={isDownloading}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <ShieldCheck className={`w-3.5 h-3.5 ${cfg.accentText}`} />
                  Quantity Limit
                </label>
                <input
                  type="number"
                  min="1"
                  max={playlistData.videos.length}
                  value={quantityLimit}
                  disabled={isDownloading}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  placeholder="Number of items"
                  className="w-full bg-zinc-950/70 text-xs text-zinc-200 border border-white/10 rounded-xl px-3.5 py-2.5 outline-none focus:border-white/30 disabled:opacity-50"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[5, 10, 25, 50].map(
                    (num) =>
                      num <= playlistData.videos.length && (
                        <button
                          key={num}
                          type="button"
                          disabled={isDownloading}
                          onClick={() => handleQuantityChange(num.toString())}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                            quantityLimit === num.toString()
                              ? cfg.accentBadge
                              : "bg-white/[0.03] text-zinc-400 border-white/5 hover:bg-white/[0.06]"
                          }`}
                        >
                          First {num}
                        </button>
                      )
                  )}
                </div>
              </div>

              <hr className="border-white/[0.06]" />

              <div className="flex flex-col gap-3 mt-auto w-full">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{selectedVideos.size} items selected</span>
                  <button
                    disabled={isDownloading}
                    onClick={toggleSelectAll}
                    className={`font-semibold cursor-pointer ${cfg.accentText}`}
                  >
                    {selectedVideos.size === playlistData.videos.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>

                <button
                  onClick={startDownloadQueue}
                  disabled={isDownloading || selectedVideos.size === 0}
                  className={`w-full flex items-center justify-center gap-2.5 ${cfg.buttonClass} disabled:opacity-50 text-white font-bold text-sm py-3 rounded-xl transition-all shadow-xl cursor-pointer`}
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
                      Download {selectedVideos.size} Item
                      {selectedVideos.size !== 1 ? "s" : ""} as ZIP
                    </>
                  )}
                </button>

                {zipStatus === "completed" && !isDownloading && (
                  <div className="w-full bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-center gap-2.5 text-emerald-400 text-xs font-bold">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>ZIP Archive saved to device!</span>
                  </div>
                )}

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
                    className="w-full flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 text-xs font-semibold py-2.5 border border-white/5 rounded-xl transition-all hover:bg-white/[0.04] cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Start Over
                  </button>
                )}
              </div>
            </div>

            {/* Right: video list */}
            <div className="lg:col-span-8 glass-panel rounded-3xl border border-white/[0.07] overflow-hidden">
              <div className="p-3.5 border-b border-white/[0.06] flex items-center gap-2.5 bg-zinc-950/40">
                <Search className="w-4 h-4 text-zinc-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Filter videos in playlist…"
                  value={playlistSearch}
                  onChange={(e) => setPlaylistSearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
                />
              </div>

              <div className="max-h-[560px] overflow-y-auto divide-y divide-white/[0.04]">
                {filteredVideos.map((video) => (
                  <div
                    key={video.id}
                    onClick={() => toggleVideo(video.id)}
                    className={`flex items-center gap-3 p-3.5 cursor-pointer transition-colors ${
                      selectedVideos.has(video.id)
                        ? "bg-white/[0.03]"
                        : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className={`shrink-0 ${cfg.accentText}`}>
                      {selectedVideos.has(video.id) ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-600" />
                      )}
                    </div>
                    <div className="relative w-20 aspect-video rounded-lg overflow-hidden border border-white/10 shrink-0 bg-zinc-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getProxyUrl(video.thumbnail)}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "/logo.png";
                        }}
                      />
                      {(video.durationText || video.duration > 0) && (
                        <div className="absolute bottom-1 right-1 bg-black/80 text-[8px] font-bold px-1 rounded text-zinc-200">
                          {video.durationText || formatDuration(video.duration)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-200 line-clamp-2 leading-snug">
                        {video.title}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{video.author}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <QueueIcon videoId={video.id} />
                      {!queue[video.id] && (
                        <button
                          type="button"
                          onClick={(e) => openPreview(video, e)}
                          title="Preview stream"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
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
                    <p className="text-sm">No items match your search.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile: sticky download button */}
          <div className="lg:hidden sticky bottom-4 z-20">
            <div className="glass-panel rounded-2xl border border-white/10 p-3 shadow-2xl flex flex-col gap-2">
              <button
                onClick={startDownloadQueue}
                disabled={isDownloading || selectedVideos.size === 0}
                className={`w-full flex items-center justify-center gap-2 ${cfg.buttonClass} disabled:opacity-50 text-white font-bold text-sm py-3 rounded-xl transition-all shadow-lg cursor-pointer`}
              >
                {isDownloading ? (
                  zipStatus === "zipping" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating ZIP…
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Downloading {currentIndex + 1}/{selectedVideos.size}…
                    </>
                  )
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download {selectedVideos.size} Item
                    {selectedVideos.size !== 1 ? "s" : ""} as ZIP
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
