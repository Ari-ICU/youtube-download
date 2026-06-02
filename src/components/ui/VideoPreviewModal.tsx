"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Download, Loader2, AlertCircle, Play, Pause,
  Volume2, VolumeX, Maximize2, ChevronDown, Sparkles,
  Eye, CheckCircle2, Scissors,
} from "lucide-react";
import type { VideoFormat, VideoDetails } from "@/types";

interface VideoPreviewModalProps {
  details: VideoDetails;
  formats: VideoFormat[];
  initialItag?: string;
  onClose: () => void;
  onDownload: (itag: string, needsMerge: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    .filter((f) => f.hasVideo && !f.hasAudio && f.height >= 1080)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const seen = new Set<number>();
  return sorted.filter((f) => {
    if (seen.has(f.height)) return false;
    seen.add(f.height);
    return true;
  });
}

function getBestAudioFormat(formats: VideoFormat[]): VideoFormat | null {
  return (
    formats.find((f) => !f.hasVideo && f.hasAudio && f.container === "m4a") ??
    formats.find((f) => !f.hasVideo && f.hasAudio) ??
    null
  );
}

function formatTime(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function resolutionLabel(height: number): string {
  if (height >= 2160) return "4K";
  if (height >= 1440) return "2K";
  return `${height}p`;
}

/** Whether a format needs the clip=true (server-side merge) path for preview. */
function isAdaptive(f: VideoFormat): boolean {
  return f.hasVideo && !f.hasAudio;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoPreviewModal({
  details, formats, initialItag, onClose, onDownload,
}: VideoPreviewModalProps) {
  const combinedFormats = getCombinedFormats(formats);
  const adaptiveFormats = getAdaptiveFormats(formats);
  const audioFormat     = getBestAudioFormat(formats);

  // All previewable formats — combined first (instant), then adaptive (clip)
  const allPreviewFormats = [...combinedFormats, ...adaptiveFormats];

  // Download target state
  const allDownloadable = [...combinedFormats, ...adaptiveFormats];
  const defaultDownload = initialItag
    ? (allDownloadable.find((f) => f.itag === initialItag) ?? allDownloadable[0])
    : allDownloadable[0];
  const [selectedDownload, setSelectedDownload] = useState<VideoFormat | null>(defaultDownload ?? null);

  // Preview format state — default to best combined; if none, default to best adaptive
  const defaultPreview = allPreviewFormats[0] ?? null;
  const [previewFormat, setPreviewFormat] = useState<VideoFormat | null>(defaultPreview);

  // Stream URL for the <video> element
  const [streamUrl, setStreamUrl]   = useState<string | null>(null);
  const [urlError, setUrlError]     = useState<string | null>(null);
  const [clipLoading, setClipLoading] = useState(false); // building server-side clip

  // Player state
  const [playing, setPlaying]           = useState(false);
  const [muted, setMuted]               = useState(false);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);
  const [buffered, setBuffered]         = useState(0);
  const [videoLoading, setVideoLoading] = useState(true);

  // Pickers
  const [downloadPickerOpen, setDownloadPickerOpen] = useState(false);
  const [previewPickerOpen, setPreviewPickerOpen]   = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const loadPreview = useCallback((fmt: VideoFormat) => {
    setUrlError(null);
    setStreamUrl(null);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const videoUrl = `https://www.youtube.com/watch?v=${details.videoId}`;

    if (isAdaptive(fmt)) {
      // Adaptive: request a 30-second merged clip from the server.
      // We set streamUrl immediately — the server takes ~10-25s to build the clip.
      setClipLoading(true);
      setVideoLoading(true);
      setStreamUrl(
        `/api/preview?url=${encodeURIComponent(videoUrl)}&itag=${encodeURIComponent(fmt.itag)}&clip=true`
      );
    } else {
      // Combined: instant proxy stream.
      setClipLoading(false);
      setVideoLoading(true);
      setStreamUrl(
        `/api/preview?url=${encodeURIComponent(videoUrl)}&itag=${encodeURIComponent(fmt.itag)}`
      );
    }
  }, [details.videoId]);

  useEffect(() => {
    if (previewFormat) loadPreview(previewFormat);
  }, [previewFormat, loadPreview]);

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
  };
  const onLoadedMetadata = () => {
    setDuration(videoRef.current?.duration ?? 0);
    setVideoLoading(false);
    setClipLoading(false);
  };
  const onWaiting  = () => setVideoLoading(true);
  const onCanPlay  = () => { setVideoLoading(false); setClipLoading(false); };
  const onEnded    = () => setPlaying(false);
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else          { v.pause(); setPlaying(false); }
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const fullscreen = () => videoRef.current?.requestFullscreen?.();

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered    / duration) * 100 : 0;

  const selectedIsAdaptive = selectedDownload ? isAdaptive(selectedDownload) : false;
  const previewIsClip      = previewFormat ? isAdaptive(previewFormat) : false;

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="preview-modal-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="preview-modal-panel"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          exit={{    opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
          style={{ background: "rgba(10,10,16,0.97)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-white/5">
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-zinc-100 line-clamp-1">{details.title}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{details.author}</p>
            </div>
            <button type="button" onClick={onClose}
              className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Clip notice banner ── */}
          <AnimatePresence>
            {previewIsClip && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 py-2 bg-violet-500/[0.08] border-b border-violet-500/20">
                  <Scissors className="w-3 h-3 text-violet-400 shrink-0" />
                  <p className="text-[10px] text-violet-300">
                    Previewing a <span className="font-bold">30-second clip</span> at{" "}
                    <span className="font-bold">{previewFormat?.qualityLabel}</span> — server is merging video + audio.
                    {clipLoading && " Please wait…"}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Video area ── */}
          <div className="relative w-full bg-black" style={{ aspectRatio: "16/9" }}>
            {allPreviewFormats.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <AlertCircle className="w-8 h-8 text-zinc-600" />
                <p className="text-xs text-zinc-500 font-semibold">Preview not available</p>
                <p className="text-[10px] text-zinc-600">No streamable formats found.<br/>Use the download button below.</p>
              </div>
            )}

            {/* Clip building spinner — shown while server merges the clip */}
            {clipLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/60">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                <p className="text-xs text-zinc-400 text-center px-8">
                  Building {previewFormat?.qualityLabel} preview clip…<br />
                  <span className="text-[10px] text-zinc-600">Merging video + audio server-side. Takes ~10–25s.</span>
                </p>
              </div>
            )}

            {/* Buffering spinner for combined streams */}
            {!clipLoading && videoLoading && streamUrl && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              </div>
            )}

            {urlError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 px-6 text-center">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-xs text-red-400 font-semibold">{urlError}</p>
                <button type="button" onClick={() => previewFormat && loadPreview(previewFormat)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 border border-white/10 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors">
                  Retry
                </button>
              </div>
            )}

            {streamUrl && (
              <video ref={videoRef} src={streamUrl}
                className="w-full h-full object-contain"
                onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata}
                onWaiting={onWaiting} onCanPlay={onCanPlay} onEnded={onEnded}
                onError={() => {
                  setVideoLoading(false);
                  setClipLoading(false);
                  setUrlError("Could not load preview. The stream may have expired — try again.");
                  setStreamUrl(null);
                }}
                onClick={togglePlay} playsInline preload="metadata"
              />
            )}

            {streamUrl && !playing && !videoLoading && !clipLoading && (
              <button type="button" onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center cursor-pointer group">
                <div className="w-14 h-14 rounded-full bg-black/60 border border-white/20 flex items-center justify-center group-hover:bg-violet-600/80 transition-colors">
                  <Play className="w-6 h-6 text-white ml-0.5" />
                </div>
              </button>
            )}

            {/* Resolution badge */}
            {previewFormat && !clipLoading && (
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 border border-white/10 px-2 py-1 rounded-lg backdrop-blur-sm">
                {previewIsClip && <Scissors className="w-3 h-3 text-violet-400" />}
                <span className="text-[10px] font-bold text-zinc-300">
                  {previewFormat.qualityLabel}{previewIsClip ? " clip" : ""}
                </span>
              </div>
            )}
          </div>

          {/* ── Controls ── */}
          <div className="px-4 pt-2.5 pb-2">
            <div className="relative w-full h-1.5 bg-white/[0.08] rounded-full cursor-pointer group mb-2" onClick={seek}>
              <div className="absolute h-full bg-white/[0.15] rounded-full" style={{ width: `${bufferedPct}%` }} />
              <div className="absolute h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progressPct}% - 6px)` }} />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={togglePlay} disabled={!streamUrl || clipLoading}
                  className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40">
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button type="button" onClick={toggleMute}
                  className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer">
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <span className="text-[10px] text-zinc-500 tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Preview quality picker */}
                {allPreviewFormats.length > 1 && (
                  <div className="relative">
                    <button type="button"
                      onClick={() => { setPreviewPickerOpen((v) => !v); setDownloadPickerOpen(false); }}
                      className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 border border-white/10 px-2 py-1 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
                      title="Change preview quality">
                      <Eye className="w-3 h-3" />
                      {previewFormat?.qualityLabel ?? "Preview"}
                      <ChevronDown className={`w-3 h-3 transition-transform ${previewPickerOpen ? "rotate-180" : ""}`} />
                    </button>
                    {previewPickerOpen && (
                      <div className="absolute bottom-full right-0 mb-1.5 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[160px]">
                        {combinedFormats.length > 0 && (
                          <>
                            <p className="text-[9px] font-extrabold text-zinc-600 uppercase tracking-widest px-3 pt-2 pb-1">Instant preview</p>
                            {combinedFormats.map((f) => (
                              <button key={f.itag} type="button"
                                onMouseDown={() => { setPreviewFormat(f); setPreviewPickerOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                                  previewFormat?.itag === f.itag ? "bg-violet-500/20 text-violet-300" : "text-zinc-300 hover:bg-white/[0.06]"
                                }`}>
                                <span>{f.qualityLabel}{f.fps && f.fps > 30 ? ` · ${f.fps}fps` : ""}</span>
                                {previewFormat?.itag === f.itag && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                              </button>
                            ))}
                          </>
                        )}
                        {adaptiveFormats.length > 0 && (
                          <>
                            <p className="text-[9px] font-extrabold text-zinc-600 uppercase tracking-widest px-3 pt-2 pb-1 border-t border-white/5 mt-1">30s clip preview</p>
                            {adaptiveFormats.map((f) => (
                              <button key={f.itag} type="button"
                                onMouseDown={() => { setPreviewFormat(f); setPreviewPickerOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                                  previewFormat?.itag === f.itag ? "bg-amber-500/20 text-amber-300" : "text-zinc-300 hover:bg-white/[0.06]"
                                }`}>
                                <span className="flex items-center gap-1.5">
                                  <Scissors className="w-3 h-3 text-violet-400 shrink-0" />
                                  {f.qualityLabel}
                                  {f.height >= 1440 && <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />}
                                </span>
                                {previewFormat?.itag === f.itag && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {allPreviewFormats.length === 1 && (
                  <span className="text-[10px] font-bold text-zinc-600 border border-white/10 px-2 py-1 rounded-lg flex items-center gap-1">
                    <Eye className="w-3 h-3" />{previewFormat?.qualityLabel ?? "Preview"}
                  </span>
                )}
                <button type="button" onClick={fullscreen}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Download target selector + action ── */}
          <div className="px-4 pt-3 pb-4 border-t border-white/5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">Download target</p>
              <div className="relative">
                <button type="button"
                  onClick={() => { setDownloadPickerOpen((v) => !v); setPreviewPickerOpen(false); }}
                  className="flex items-center gap-1.5 text-[10px] font-bold border px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  style={{
                    borderColor: selectedIsAdaptive ? "rgba(245,158,11,0.35)" : "rgba(139,92,246,0.35)",
                    background:  selectedIsAdaptive ? "rgba(245,158,11,0.06)" : "rgba(139,92,246,0.06)",
                    color:       selectedIsAdaptive ? "rgb(253,211,77)"       : "rgb(196,181,253)",
                  }}>
                  {selectedIsAdaptive && <Sparkles className="w-3 h-3" />}
                  {selectedDownload
                    ? `${selectedDownload.qualityLabel}${selectedIsAdaptive ? " +audio" : ` ${selectedDownload.container.toUpperCase()}`}`
                    : "Select quality"}
                  <ChevronDown className={`w-3 h-3 transition-transform ${downloadPickerOpen ? "rotate-180" : ""}`} />
                </button>

                {downloadPickerOpen && (
                  <div className="absolute bottom-full right-0 mb-1.5 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[180px]">
                    {combinedFormats.length > 0 && (
                      <>
                        <p className="text-[9px] font-extrabold text-zinc-600 uppercase tracking-widest px-3 pt-2 pb-1">Video + Audio</p>
                        {combinedFormats.map((f) => (
                          <button key={f.itag} type="button"
                            onMouseDown={() => { setSelectedDownload(f); setDownloadPickerOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                              selectedDownload?.itag === f.itag ? "bg-violet-500/20 text-violet-300" : "text-zinc-300 hover:bg-white/[0.06]"
                            }`}>
                            <span>{f.qualityLabel} {f.container.toUpperCase()}</span>
                            {selectedDownload?.itag === f.itag && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                          </button>
                        ))}
                      </>
                    )}
                    {adaptiveFormats.length > 0 && (
                      <>
                        <p className="text-[9px] font-extrabold text-zinc-600 uppercase tracking-widest px-3 pt-2 pb-1 border-t border-white/5 mt-1">High-res +audio merge</p>
                        {adaptiveFormats.map((f) => (
                          <button key={f.itag} type="button"
                            onMouseDown={() => { setSelectedDownload(f); setDownloadPickerOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                              selectedDownload?.itag === f.itag ? "bg-amber-500/20 text-amber-300" : "text-zinc-300 hover:bg-white/[0.06]"
                            }`}>
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                              {f.qualityLabel} +audio
                              {f.height >= 2160 && <span className="text-[9px] text-amber-500 font-bold">4K</span>}
                              {resolutionLabel(f.height) === "2K" && <span className="text-[9px] text-amber-500 font-bold">2K</span>}
                            </span>
                            {selectedDownload?.itag === f.itag && <CheckCircle2 className="w-3 h-3 shrink-0 text-amber-400" />}
                          </button>
                        ))}
                      </>
                    )}
                    {audioFormat && (
                      <>
                        <p className="text-[9px] font-extrabold text-zinc-600 uppercase tracking-widest px-3 pt-2 pb-1 border-t border-white/5 mt-1">Audio only</p>
                        <button type="button"
                          onMouseDown={() => { setSelectedDownload(audioFormat); setDownloadPickerOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                            selectedDownload?.itag === audioFormat.itag ? "bg-pink-500/20 text-pink-300" : "text-zinc-300 hover:bg-white/[0.06]"
                          }`}>
                          <span>Audio {audioFormat.qualityLabel}</span>
                          {selectedDownload?.itag === audioFormat.itag && <CheckCircle2 className="w-3 h-3 shrink-0 text-pink-400" />}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedDownload && (
              <button type="button"
                onClick={() => onDownload(selectedDownload.itag, selectedIsAdaptive)}
                className="w-full flex items-center justify-center gap-2 font-bold text-sm py-2.5 rounded-xl transition-all cursor-pointer"
                style={{
                  background:   selectedIsAdaptive ? "rgba(245,158,11,0.15)" : "rgba(139,92,246,0.18)",
                  border:       `1px solid ${selectedIsAdaptive ? "rgba(245,158,11,0.4)" : "rgba(139,92,246,0.4)"}`,
                  color:        selectedIsAdaptive ? "rgb(253,211,77)" : "rgb(216,180,254)",
                }}>
                <Download className="w-4 h-4" />
                Download {selectedDownload.qualityLabel}
                {selectedIsAdaptive ? " +audio" : ` ${selectedDownload.container.toUpperCase()}`}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
