"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import JSZip from "jszip";
import {
  Download, CheckSquare, Square, Search, Play, RefreshCw,
  Loader2, CheckCircle2, AlertCircle, Settings, ShieldCheck,
  Check, Sparkles, Video, Music, Layers, ChevronDown, Eye, X, Scissors,
} from "lucide-react";

import type { PlaylistDetails, PlaylistVideo, VideoFormat, DownloadState, QualityPreference } from "@/types";
import { executeDownloadToBlob, formatDuration, sanitizeFilename, estimateSize } from "@/utils/downloader";
import UrlInput from "@/components/ui/UrlInput";
import ErrorBanner from "@/components/ui/ErrorBanner";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import QualityPreview from "@/components/ui/QualityPreview";
import VideoPreviewModal from "@/components/ui/VideoPreviewModal";
import DownloadToast from "@/components/ui/DownloadToast";
import PlaylistToast, { type PlaylistQueueItem } from "@/components/ui/PlaylistToast";

const QUALITY_OPTIONS: DropdownOption<QualityPreference>[] = [
  { value: "4k",    label: "4K / 2160p UHD", description: "Requires ffmpeg merge", icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />, badge: "4K" },
  { value: "high",  label: "High Quality",   description: "720p or 1080p",          icon: <Video    className="w-3.5 h-3.5 text-brand-purple" /> },
  { value: "medium",label: "Medium Quality", description: "480p video + audio",     icon: <Video    className="w-3.5 h-3.5 text-brand-blue"   /> },
  { value: "low",   label: "Low Quality",    description: "360p video + audio",     icon: <Layers   className="w-3.5 h-3.5 text-zinc-400"     /> },
  { value: "audio", label: "Audio Only",     description: "Best M4A track",         icon: <Music    className="w-3.5 h-3.5 text-brand-pink"   /> },
];

export default function PlaylistDownloader() {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [playlistData, setPlaylistData] = useState<PlaylistDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [qualityPreference, setQualityPreference] = useState<QualityPreference>("high");
  const [quantityLimit, setQuantityLimit] = useState<string>("");
  const [zipStatus, setZipStatus] = useState<"idle"|"zipping"|"completed"|"failed">("idle");
  const [queue, setQueue] = useState<Record<string, DownloadState>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  // Mobile: controls panel collapsed by default
  const [controlsOpen, setControlsOpen] = useState(false);

  // Per-video format preview: videoId → formats (null = loading)
  const [previewId] = useState<string | null>(null);
  const [previewFormats, setPreviewFormats] = useState<Record<string, VideoFormat[] | "loading" | "error">>({});
  // Video modal state
  const [modalVideo, setModalVideo] = useState<PlaylistVideo | null>(null);
  // Single-video download toast
  const [singleDownloadState, setSingleDownloadState] = useState<DownloadState | null>(null);
  const [singleDownloadTitle, setSingleDownloadTitle] = useState<string>("");

  // Playlist batch toast state
  const [playlistToastItems, setPlaylistToastItems] = useState<PlaylistQueueItem[]>([]);
  const [playlistToastVisible, setPlaylistToastVisible] = useState(false);
  const [playlistToastCurrentId, setPlaylistToastCurrentId] = useState<string | null>(null);
  const [playlistToastDone, setPlaylistToastDone] = useState(false);

  const openPreview = async (video: PlaylistVideo, e: React.MouseEvent) => {
    e.stopPropagation();
    // Show modal immediately; load formats if not cached yet
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
    if (!url.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setPlaylistData(null);
    setQueue({});
    setIsDownloading(false);
    setZipStatus("idle");
    setQuantityLimit("");
    setControlsOpen(false);
    try {
      const res = await fetch(`/api/playlist?url=${encodeURIComponent(url.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to analyze playlist URL");
      setPlaylistData(json.playlist);
      setSelectedVideos(new Set<string>(json.playlist.videos.map((v: PlaylistVideo) => v.id)));
      setQuantityLimit(json.playlist.videos.length.toString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse playlist. Make sure it is public.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleVideo = (id: string) => {
    const next = new Set(selectedVideos);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedVideos(next);
    setQuantityLimit("");
  };

  const toggleSelectAll = () => {
    if (!playlistData) return;
    if (selectedVideos.size === playlistData.videos.length) {
      setSelectedVideos(new Set()); setQuantityLimit("");
    } else {
      setSelectedVideos(new Set(playlistData.videos.map((v) => v.id)));
      setQuantityLimit(playlistData.videos.length.toString());
    }
  };

  const handleQuantityChange = (val: string) => {
    setQuantityLimit(val);
    if (!playlistData) return;
    const num = parseInt(val);
    if (!isNaN(num) && num > 0) setSelectedVideos(new Set(playlistData.videos.slice(0, num).map((v) => v.id)));
    else if (val === "") setSelectedVideos(new Set());
  };

  const getTargetFormat = (formats: VideoFormat[], preference: QualityPreference): { itag: string; merge: boolean } => {
    const fallback = { itag: "18", merge: false };
    if (preference === "audio") {
      const f = formats.find((f) => !f.hasVideo && f.hasAudio && f.container === "m4a") || formats.find((f) => !f.hasVideo && f.hasAudio);
      return f ? { itag: f.itag, merge: false } : fallback;
    }
    if (preference === "4k") {
      const f = formats.find((f) => f.hasVideo && !f.hasAudio && f.height >= 2160) || formats.find((f) => f.hasVideo && !f.hasAudio && f.height >= 1440);
      if (f) return { itag: f.itag, merge: true };
      const combined = formats.find((f) => f.hasVideo && f.hasAudio);
      return combined ? { itag: combined.itag, merge: false } : fallback;
    }
    if (preference === "high") {
      const f = formats.find((f) => f.hasVideo && f.hasAudio && f.height >= 1080) || formats.find((f) => f.hasVideo && f.hasAudio && f.height >= 720) || formats.find((f) => f.hasVideo && f.hasAudio);
      return f ? { itag: f.itag, merge: false } : fallback;
    }
    if (preference === "medium") {
      const f = formats.find((f) => f.hasVideo && f.hasAudio && f.height === 480) || formats.find((f) => f.hasVideo && f.hasAudio && f.height <= 480) || formats.find((f) => f.hasVideo && f.hasAudio);
      return f ? { itag: f.itag, merge: false } : fallback;
    }
    if (preference === "low") {
      const f = formats.find((f) => f.hasVideo && f.hasAudio && f.height <= 360) || formats.find((f) => f.hasVideo && f.hasAudio);
      return f ? { itag: f.itag, merge: false } : fallback;
    }
    return fallback;
  };

  const filteredVideos = playlistData
    ? playlistData.videos.filter((v) => v.title.toLowerCase().includes(playlistSearch.toLowerCase()))
    : [];

  // Download a single video directly from the preview panel (not ZIP)
  const handleSingleDownload = (video: PlaylistVideo, itag: string, needsMerge: boolean) => {
    const formats = previewFormats[video.id];
    const format = Array.isArray(formats) ? formats.find((f) => f.itag === itag) : undefined;
    const isAudio = !format?.hasVideo && !!format?.hasAudio;
    const height = format?.height ?? 0;
    const size = format?.contentLength ?? (video.duration > 0 ? estimateSize(video.duration, height, isAudio) : 10 * 1024 * 1024);
    setSingleDownloadTitle(video.title);
    import("@/utils/downloader").then(({ executeDownload }) => {
      executeDownload(video.url, itag, video.title, video.id, (state) => setSingleDownloadState(state), size, needsMerge, isAudio);
    });
  };

  const startDownloadQueue = async () => {
    if (!playlistData || selectedVideos.size === 0 || isDownloading) return;
    setIsDownloading(true); setZipStatus("idle"); setControlsOpen(false);
    const selected = playlistData.videos.filter((v) => selectedVideos.has(v.id));

    // Initialise queue and toast state
    const initial: Record<string, DownloadState> = {};
    selected.forEach((v) => { initial[v.id] = { id: v.id, status: "idle", progress: 0, downloadedMb: "0.0" }; });
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

    // Helper: update both queue and toast for a given video
    const updateVideoState = (videoId: string, state: DownloadState) => {
      setQueue((prev) => ({ ...prev, [videoId]: state }));
      setPlaylistToastItems((prev) =>
        prev.map((item) => item.id === videoId ? { ...item, state } : item)
      );
    };

    const zip = new JSZip();
    let successfulDownloads = 0;

    for (let i = 0; i < selected.length; i++) {
      const video = selected[i];
      setCurrentIndex(i);
      setPlaylistToastCurrentId(video.id);

      let chosenItag = "18", needsMerge = false;
      let expectedSize: number | undefined;
      let chosenIsAudio = false;

      // Mark as downloading while we fetch info
      updateVideoState(video.id, { id: video.id, status: "downloading", progress: 0, downloadedMb: "0.0" });

      try {
        const infoRes = await fetch(`/api/info?url=${encodeURIComponent(video.url)}`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          const formats = info.formats as VideoFormat[];
          const target = getTargetFormat(formats, qualityPreference);
          chosenItag = target.itag; needsMerge = target.merge;
          const chosenFormat = formats.find((f) => f.itag === chosenItag);
          chosenIsAudio = !chosenFormat?.hasVideo && !!chosenFormat?.hasAudio;
          expectedSize = chosenFormat?.contentLength ?? (video.duration > 0 ? estimateSize(video.duration, chosenFormat?.height ?? 0, qualityPreference === "audio") : undefined);
        }
      } catch (err) { console.warn("Failed to look up format for", video.id, err); }

      if (!expectedSize) {
        const sizeMap: Record<QualityPreference, number> = { "4k": 500*1024*1024, high: 20*1024*1024, medium: 10*1024*1024, low: 5*1024*1024, audio: 2*1024*1024 };
        expectedSize = sizeMap[qualityPreference];
      }

      try {
        const result = await executeDownloadToBlob(
          video.url, chosenItag, video.title, video.id,
          (state) => updateVideoState(video.id, state),
          expectedSize, needsMerge, chosenIsAudio,
        );
        if (result) {
          zip.file(result.filename, result.blob);
          successfulDownloads++;
          updateVideoState(video.id, { id: video.id, status: "completed", progress: 100, downloadedMb: result.blob.size > 0 ? (result.blob.size / 1024 / 1024).toFixed(1) : "—" });
        } else {
          updateVideoState(video.id, { id: video.id, status: "failed", progress: 0, downloadedMb: "0.0" });
        }
      } catch (err) {
        console.error("Download error for", video.id, err);
        updateVideoState(video.id, { id: video.id, status: "failed", progress: 0, downloadedMb: "0.0" });
      }
    }

    // All videos done — mark toast as finished
    setPlaylistToastCurrentId(null);
    setPlaylistToastDone(true);

    if (successfulDownloads > 0) {
      setZipStatus("zipping");
      try {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipUrl = URL.createObjectURL(zipBlob);
        const anchor = document.createElement("a");
        anchor.href = zipUrl; anchor.download = `${sanitizeFilename(playlistData.title)}.zip`;
        document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
        URL.revokeObjectURL(zipUrl); setZipStatus("completed");
      } catch (err) { console.error("Failed to compile ZIP:", err); setZipStatus("failed"); }
    } else { setZipStatus("failed"); }
    setIsDownloading(false); setCurrentIndex(-1);
  };

  const QueueIcon = ({ videoId }: { videoId: string }) => {
    const s = queue[videoId];
    if (!s || s.status === "idle") return null;
    if (s.status === "downloading") {
      const isMerging = s.phase === "merging";
      const isTransferring = s.phase === "transferring";
      return (
        <span className="flex items-center gap-1 text-brand-purple text-[10px] font-bold shrink-0">
          {isMerging
            ? <Scissors className="w-3 h-3 text-amber-400 animate-pulse" />
            : <Loader2 className="w-3 h-3 animate-spin" />}
          {isMerging ? "merge" : isTransferring ? "saving" : `${s.progress}%`}
        </span>
      );
    }
    if (s.status === "completed") return (
      <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5" />{s.downloadedMb !== "—" ? `${s.downloadedMb}MB` : ""}
      </span>
    );
    if (s.status === "failed") return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
    return null;
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="w-full flex flex-col items-center">
      <UrlInput value={url} onChange={setUrl} onSubmit={handleAnalyze}
        placeholder="Paste Playlist URL (e.g. https://www.youtube.com/playlist?list=…)"
        isLoading={isAnalyzing} submitLabel="Extract" />
      {error && <ErrorBanner title="Failed to Load Playlist" message={error} />}

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

      {/* ── Video preview modal ── */}
      {modalVideo && Array.isArray(previewFormats[modalVideo.id]) && (
        <VideoPreviewModal
          details={{
            videoId:   modalVideo.id,
            title:     modalVideo.title,
            author:    modalVideo.author,
            authorUrl: `https://www.youtube.com/channel/${modalVideo.author}`,
            thumbnail: modalVideo.thumbnail,
            duration:  modalVideo.duration,
            views:     0,
            description: "",
          }}
          formats={previewFormats[modalVideo.id] as VideoFormat[]}
          onClose={() => setModalVideo(null)}
          onDownload={(itag, needsMerge) => {
            setModalVideo(null);
            handleSingleDownload(modalVideo, itag, needsMerge);
          }}
        />
      )}

      {playlistData && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="w-full mt-6 sm:mt-8 flex flex-col gap-4">

          {/* ── Mobile: compact header bar with playlist info + toggle ── */}
          <div className="lg:hidden glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <button type="button" onClick={() => setControlsOpen((v) => !v)}
              className="w-full flex items-center gap-3 p-3.5 cursor-pointer hover:bg-white/[0.03] transition-colors">
              <div className="relative w-14 aspect-video rounded-lg overflow-hidden border border-white/10 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={playlistData.thumbnail || "/placeholder.jpg"} alt={playlistData.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-zinc-100 truncate">{playlistData.title}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{playlistData.videoCountText} · {selectedVideos.size} selected · {QUALITY_OPTIONS.find(o => o.value === qualityPreference)?.label}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform duration-200 ${controlsOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Collapsible controls on mobile */}
            <AnimatePresence>
              {controlsOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                  className="overflow-hidden border-t border-white/5">
                  <div className="p-4 flex flex-col gap-4">
                    {/* Quality */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Settings className="w-3.5 h-3.5 text-brand-purple" />Target Quality
                      </label>
                      <Dropdown<QualityPreference> options={QUALITY_OPTIONS} value={qualityPreference} onChange={setQualityPreference} disabled={isDownloading} />
                      {qualityPreference === "4k" && <p className="text-[10px] text-amber-400/80">4K requires ffmpeg on the server.</p>}
                    </div>
                    {/* Quantity */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-brand-pink" />Quantity Limit
                      </label>
                      <input type="number" min="1" max={playlistData.videos.length} value={quantityLimit} disabled={isDownloading}
                        onChange={(e) => handleQuantityChange(e.target.value)} placeholder="No. of videos"
                        className="w-full bg-zinc-950/60 text-xs text-zinc-200 border border-white/10 rounded-xl px-3.5 py-2.5 outline-none focus:border-brand-pink/50 disabled:opacity-50 transition-colors" />
                      <div className="flex flex-wrap gap-1.5">
                        {[5,10,25,50].map((num) => num <= playlistData.videos.length && (
                          <button key={num} type="button" disabled={isDownloading} onClick={() => handleQuantityChange(num.toString())}
                            className={`text-[9px] font-bold px-2 py-1 rounded border transition-all cursor-pointer disabled:opacity-50 ${quantityLimit === num.toString() ? "bg-brand-pink/20 text-brand-pink border-brand-pink/40" : "bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 border-white/5"}`}>
                            First {num}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Select all */}
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>{selectedVideos.size} selected</span>
                      <button disabled={isDownloading} onClick={toggleSelectAll} className="text-brand-purple hover:underline font-semibold disabled:opacity-50 cursor-pointer">
                        {selectedVideos.size === playlistData.videos.length ? "Deselect All" : "Select All"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Desktop: side-by-side layout ── */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-8 items-start">
            {/* Left controls card */}
            <div className="lg:col-span-4 glass-panel rounded-3xl p-6 border border-white/5 flex flex-col gap-5 self-start">
              <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={playlistData.thumbnail || "/placeholder.jpg"} alt={playlistData.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                  <span className="text-[10px] font-bold text-zinc-100 bg-brand-purple px-2 py-0.5 rounded border border-white/5">{playlistData.videoCountText}</span>
                </div>
              </div>
              <div>
                <h2 className="text-base font-extrabold text-zinc-100 leading-snug line-clamp-2">{playlistData.title}</h2>
                <p className="text-xs text-zinc-400 mt-1">{playlistData.author}</p>
              </div>
              <hr className="border-white/5" />
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-brand-purple" />Target Quality
                </label>
                <Dropdown<QualityPreference> options={QUALITY_OPTIONS} value={qualityPreference} onChange={setQualityPreference} disabled={isDownloading} />
                {qualityPreference === "4k" && <p className="text-[10px] text-amber-400/80 leading-snug mt-0.5">4K requires ffmpeg installed on the server for audio merging.</p>}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-pink" />Quantity Limit
                </label>
                <input type="number" min="1" max={playlistData.videos.length} value={quantityLimit} disabled={isDownloading}
                  onChange={(e) => handleQuantityChange(e.target.value)} placeholder="No. of videos"
                  className="w-full bg-zinc-950/60 text-xs text-zinc-200 border border-white/10 rounded-xl px-3.5 py-2.5 outline-none focus:border-brand-pink/50 disabled:opacity-50 transition-colors" />
                <div className="flex flex-wrap gap-1.5">
                  {[5,10,25,50].map((num) => num <= playlistData.videos.length && (
                    <button key={num} type="button" disabled={isDownloading} onClick={() => handleQuantityChange(num.toString())}
                      className={`text-[9px] font-bold px-2 py-1 rounded border transition-all cursor-pointer disabled:opacity-50 ${quantityLimit === num.toString() ? "bg-brand-pink/20 text-brand-pink border-brand-pink/40" : "bg-white/[0.03] hover:bg-white/[0.08] text-zinc-400 border-white/5"}`}>
                      First {num}
                    </button>
                  ))}
                </div>
              </div>
              <hr className="border-white/5" />
              <div className="flex flex-col gap-3 mt-auto w-full">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{selectedVideos.size} selected</span>
                  <button disabled={isDownloading} onClick={toggleSelectAll} className="text-brand-purple hover:underline font-semibold disabled:opacity-50 cursor-pointer">
                    {selectedVideos.size === playlistData.videos.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                {/* Download button (desktop) */}
                <button onClick={startDownloadQueue} disabled={isDownloading || selectedVideos.size === 0}
                  className="w-full flex items-center justify-center gap-2.5 bg-brand-purple hover:bg-purple-600 disabled:bg-purple-900 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-all shadow-lg cursor-pointer">
                  {isDownloading ? (zipStatus === "zipping" ? <><Loader2 className="w-4 h-4 animate-spin" />Creating ZIP…</> : <><Loader2 className="w-4 h-4 animate-spin" />Downloading {currentIndex+1} / {selectedVideos.size}…</>) : <><Download className="w-4 h-4" />Download ZIP ({selectedVideos.size} Item{selectedVideos.size !== 1 ? "s" : ""})</>}
                </button>
                {zipStatus === "zipping" && <div className="w-full bg-brand-purple/10 border border-brand-purple/20 p-3 rounded-xl flex flex-col gap-1.5 text-brand-purple"><span className="flex items-center gap-1.5 text-xs font-bold animate-pulse"><Loader2 className="w-3.5 h-3.5 animate-spin" />Compiling ZIP…</span><p className="text-[9px] text-zinc-500">Do not navigate away.</p></div>}
                {zipStatus === "completed" && !isDownloading && <div className="w-full bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-start gap-2.5 text-emerald-400"><Check className="w-4 h-4 shrink-0 mt-0.5" /><div className="text-[11px]"><span className="font-bold block">Complete!</span><span className="text-zinc-400">ZIP archive saved.</span></div></div>}
                {zipStatus === "failed" && !isDownloading && <div className="w-full bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-start gap-2.5 text-red-400"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><div className="text-[11px]"><span className="font-bold block">Failed</span><span className="text-zinc-400">ZIP could not be generated.</span></div></div>}
                {!isDownloading && Object.keys(queue).length > 0 && (
                  <button onClick={() => { setQueue({}); setPlaylistData(null); setUrl(""); setSelectedVideos(new Set()); setZipStatus("idle"); setQuantityLimit(""); }}
                    className="w-full flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 text-xs font-semibold py-2 border border-white/5 rounded-xl transition-all hover:bg-white/[0.03] cursor-pointer">
                    <RefreshCw className="w-3.5 h-3.5" />Start Over
                  </button>
                )}
              </div>
            </div>

            {/* Right: video list (desktop) */}
            <div className="lg:col-span-8 glass-panel rounded-3xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center gap-3">
                <Search className="w-4 h-4 text-zinc-500 shrink-0" />
                <input type="text" placeholder="Search videos…" value={playlistSearch}
                  onChange={(e) => setPlaylistSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none" />
              </div>
              <div className="max-h-[520px] overflow-y-auto divide-y divide-white/[0.03]">
                {filteredVideos.map((video) => (
                  <div key={video.id}>
                    <div
                      onClick={() => toggleVideo(video.id)}
                      className={`flex items-center gap-3 p-3.5 cursor-pointer transition-all ${selectedVideos.has(video.id) ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"}`}
                    >
                      <div className="shrink-0 text-brand-purple">
                        {selectedVideos.has(video.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-zinc-600" />}
                      </div>
                      <div className="relative w-20 aspect-video rounded-lg overflow-hidden border border-white/5 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                        <div className="absolute bottom-0.5 right-0.5 bg-black/80 text-[8px] px-1 rounded">
                          {video.durationText || formatDuration(video.duration)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 line-clamp-2 leading-snug">{video.title}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{video.author}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <QueueIcon videoId={video.id} />
                        {!queue[video.id] && (
                          <button
                            type="button"
                            onClick={(e) => openPreview(video, e)}
                            title="Preview formats"
                            className={`p-1 rounded-lg transition-colors cursor-pointer ${previewId === video.id ? "text-violet-400 bg-violet-500/10" : "text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]"}`}
                          >
                            {previewId === video.id ? <X className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {!queue[video.id] && <span className="text-[10px] text-zinc-600 font-mono">#{video.index + 1}</span>}
                      </div>
                    </div>
                    {/* Inline format preview panel */}
                    <AnimatePresence>
                      {previewId === video.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-t border-white/5 bg-white/[0.01]"
                        >
                          <div className="p-4">
                            {previewFormats[video.id] === "loading" && (
                              <div className="flex items-center gap-2 text-zinc-500 text-xs py-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />Loading formats…
                              </div>
                            )}
                            {previewFormats[video.id] === "error" && (
                              <p className="text-xs text-red-400">Failed to load formats. Try again.</p>
                            )}
                            {Array.isArray(previewFormats[video.id]) && (
                              <QualityPreview
                                formats={previewFormats[video.id] as VideoFormat[]}
                                duration={video.duration}
                                isDownloading={false}
                                onDownload={(itag, needsMerge) => handleSingleDownload(video, itag, needsMerge)}
                              />
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
          </div>{/* end desktop grid */}

          {/* ── Mobile: video list (always visible below the controls bar) ── */}
          <div className="lg:hidden glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-3 border-b border-white/5 flex items-center gap-2.5">
              <Search className="w-4 h-4 text-zinc-500 shrink-0" />
              <input type="text" placeholder="Search videos…" value={playlistSearch}
                onChange={(e) => setPlaylistSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none" />
            </div>
            <div className="max-h-[55vh] overflow-y-auto divide-y divide-white/[0.03]">
              {filteredVideos.map((video) => (
                <div key={video.id}>
                  <div
                    onClick={() => toggleVideo(video.id)}
                    className={`flex items-center gap-3 p-3 cursor-pointer transition-all ${selectedVideos.has(video.id) ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"}`}
                  >
                    <div className="shrink-0 text-brand-purple">
                      {selectedVideos.has(video.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-zinc-600" />}
                    </div>
                    <div className="relative w-16 aspect-video rounded-md overflow-hidden border border-white/5 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                      <div className="absolute bottom-0.5 right-0.5 bg-black/80 text-[7px] px-1 rounded">
                        {video.durationText || formatDuration(video.duration)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-zinc-200 line-clamp-2 leading-snug">{video.title}</p>
                      <p className="text-[9px] text-zinc-500 mt-0.5">{video.author}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <QueueIcon videoId={video.id} />
                      {!queue[video.id] && (
                        <button
                          type="button"
                          onClick={(e) => openPreview(video, e)}
                          className={`p-1 rounded-lg transition-colors cursor-pointer ${previewId === video.id ? "text-violet-400 bg-violet-500/10" : "text-zinc-600 hover:text-zinc-300"}`}
                        >
                          {previewId === video.id ? <X className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {!queue[video.id] && <span className="text-[9px] text-zinc-600 font-mono">#{video.index + 1}</span>}
                    </div>
                  </div>
                  {/* Inline format preview panel (mobile) */}
                  <AnimatePresence>
                    {previewId === video.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-white/5 bg-white/[0.01]"
                      >
                        <div className="p-3">
                          {previewFormats[video.id] === "loading" && (
                            <div className="flex items-center gap-2 text-zinc-500 text-xs py-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />Loading formats…
                            </div>
                          )}
                          {previewFormats[video.id] === "error" && (
                            <p className="text-xs text-red-400">Failed to load formats.</p>
                          )}
                          {Array.isArray(previewFormats[video.id]) && (
                            <QualityPreview
                              formats={previewFormats[video.id] as VideoFormat[]}
                              duration={video.duration}
                              isDownloading={false}
                              onDownload={(itag, needsMerge) => handleSingleDownload(video, itag, needsMerge)}
                            />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
              {filteredVideos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                  <Play className="w-7 h-7 mb-2 opacity-30" />
                  <p className="text-xs">No videos match your search.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Mobile: sticky download bar ── */}
          <div className="lg:hidden sticky bottom-4 z-20">
            <div className="glass-panel rounded-2xl border border-white/10 p-3 shadow-2xl shadow-black/60 flex flex-col gap-2">
              {/* Status banners */}
              {zipStatus === "zipping" && (
                <div className="flex items-center gap-2 text-brand-purple text-xs font-bold animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />Compiling ZIP archive…
                </div>
              )}
              {zipStatus === "completed" && !isDownloading && (
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <Check className="w-3.5 h-3.5 shrink-0" />ZIP saved successfully!
                </div>
              )}
              {zipStatus === "failed" && !isDownloading && (
                <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />Download failed. Try again.
                </div>
              )}
              <div className="flex items-center gap-2">
                {!isDownloading && Object.keys(queue).length > 0 ? (
                  <button onClick={() => { setQueue({}); setPlaylistData(null); setUrl(""); setSelectedVideos(new Set()); setZipStatus("idle"); setQuantityLimit(""); }}
                    className="flex-1 flex items-center justify-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-xs font-semibold py-2.5 border border-white/5 rounded-xl transition-all hover:bg-white/[0.03] cursor-pointer">
                    <RefreshCw className="w-3.5 h-3.5" />Start Over
                  </button>
                ) : (
                  <button onClick={startDownloadQueue} disabled={isDownloading || selectedVideos.size === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-brand-purple hover:bg-purple-600 disabled:bg-purple-900 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-all shadow-lg cursor-pointer">
                    {isDownloading
                      ? (zipStatus === "zipping"
                          ? <><Loader2 className="w-4 h-4 animate-spin" />Creating ZIP…</>
                          : <><Loader2 className="w-4 h-4 animate-spin" />Downloading {currentIndex + 1}/{selectedVideos.size}…</>)
                      : <><Download className="w-4 h-4" />Download {selectedVideos.size} Video{selectedVideos.size !== 1 ? "s" : ""} as ZIP</>}
                  </button>
                )}
              </div>
            </div>
          </div>

        </motion.div>
      )}
    </div>
  );
}
