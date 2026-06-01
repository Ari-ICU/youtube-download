"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Download, Loader2, AlertCircle, Play, Pause,
  Volume2, VolumeX, Maximize2, ChevronDown,
} from "lucide-react";
import type { VideoFormat, VideoDetails } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoPreviewModalProps {
  details: VideoDetails;
  formats: VideoFormat[];
  /** Initial itag to preview. Defaults to best combined format. */
  initialItag?: string;
  onClose: () => void;
  onDownload: (itag: string, needsMerge: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Only formats that have both video+audio are directly playable in <video> */
function getPlayableFormats(formats: VideoFormat[]): VideoFormat[] {
  return formats
    .filter((f) => f.hasVideo && f.hasAudio)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
}

function formatTime(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoPreviewModal({
  details, formats, initialItag, onClose, onDownload,
}: VideoPreviewModalProps) {
  const playable = getPlayableFormats(formats);
  const defaultItag = initialItag ?? playable[0]?.itag ?? "";

  const [selectedItag, setSelectedItag] = useState(defaultItag);
  const [streamUrl, setStreamUrl]       = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl]     = useState(false);
  const [urlError, setUrlError]         = useState<string | null>(null);

  // Player state
  const [playing, setPlaying]     = useState(false);
  const [muted, setMuted]         = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]   = useState(0);
  const [buffered, setBuffered]   = useState(0);
  const [videoLoading, setVideoLoading] = useState(true);

  // Quality picker open
  const [qualityOpen, setQualityOpen] = useState(false);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  // Fetch stream URL whenever selectedItag changes
  const fetchStreamUrl = useCallback(async (itag: string) => {
    setLoadingUrl(true);
    setUrlError(null);
    setStreamUrl(null);
    setVideoLoading(true);
    setPlaying(false);
    try {
      const res = await fetch(
        `/api/preview?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${details.videoId}`)}&itag=${itag}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to get stream URL");
      setStreamUrl(json.streamUrl);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Could not load preview.");
    } finally {
      setLoadingUrl(false);
    }
  }, [details.videoId]);

  useEffect(() => {
    if (selectedItag) fetchStreamUrl(selectedItag);
  }, [selectedItag, fetchStreamUrl]);

  // Video event handlers
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
  };
  const onLoadedMetadata = () => {
    setDuration(videoRef.current?.duration ?? 0);
    setVideoLoading(false);
  };
  const onWaiting  = () => setVideoLoading(true);
  const onCanPlay  = () => setVideoLoading(false);
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

  const selectedFormat = formats.find((f) => f.itag === selectedItag);
  const needsMerge = !!(selectedFormat?.hasVideo && !selectedFormat?.hasAudio);

  const progressPct  = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct  = duration ? (buffered    / duration) * 100 : 0;

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="preview-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="preview-modal-panel"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="w-full max-w-2xl flex flex-col gap-0 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
          style={{ background: "rgba(10,10,16,0.97)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-white/5">
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-zinc-100 line-clamp-1">{details.title}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{details.author}</p>
            </div>
            <button
              type="button" onClick={onClose}
              className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Video area ── */}
          <div className="relative w-full bg-black" style={{ aspectRatio: "16/9" }}>
            {/* Loading / error overlay */}
            {(loadingUrl || (videoLoading && streamUrl)) && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              </div>
            )}
            {urlError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 px-6 text-center">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-xs text-red-400 font-semibold">{urlError}</p>
                <button
                  type="button"
                  onClick={() => fetchStreamUrl(selectedItag)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 border border-white/10 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {streamUrl && (
              <video
                ref={videoRef}
                src={streamUrl}
                className="w-full h-full object-contain"
                onTimeUpdate={onTimeUpdate}
                onLoadedMetadata={onLoadedMetadata}
                onWaiting={onWaiting}
                onCanPlay={onCanPlay}
                onEnded={onEnded}
                onClick={togglePlay}
                playsInline
                preload="metadata"
              />
            )}

            {/* Big play button overlay when paused */}
            {streamUrl && !playing && !videoLoading && !loadingUrl && (
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-full bg-black/60 border border-white/20 flex items-center justify-center group-hover:bg-violet-600/80 transition-colors">
                  <Play className="w-6 h-6 text-white ml-0.5" />
                </div>
              </button>
            )}
          </div>

          {/* ── Controls ── */}
          <div className="px-4 pt-2.5 pb-1">
            {/* Progress bar */}
            <div
              className="relative w-full h-1.5 bg-white/[0.08] rounded-full cursor-pointer group mb-2"
              onClick={seek}
            >
              {/* Buffered */}
              <div
                className="absolute h-full bg-white/[0.15] rounded-full"
                style={{ width: `${bufferedPct}%` }}
              />
              {/* Played */}
              <div
                className="absolute h-full bg-violet-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
              {/* Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progressPct}% - 6px)` }}
              />
            </div>

            {/* Buttons row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {/* Play/Pause */}
                <button
                  type="button" onClick={togglePlay}
                  disabled={!streamUrl || loadingUrl}
                  className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40"
                >
                  {playing
                    ? <Pause  className="w-4 h-4" />
                    : <Play   className="w-4 h-4" />}
                </button>

                {/* Mute */}
                <button
                  type="button" onClick={toggleMute}
                  className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  {muted
                    ? <VolumeX className="w-4 h-4" />
                    : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Time */}
                <span className="text-[10px] text-zinc-500 tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Quality picker */}
                {playable.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setQualityOpen((v) => !v)}
                      className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 border border-white/10 px-2 py-1 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      {selectedFormat?.qualityLabel ?? "Quality"}
                      <ChevronDown className={`w-3 h-3 transition-transform ${qualityOpen ? "rotate-180" : ""}`} />
                    </button>
                    {qualityOpen && (
                      <div className="absolute bottom-full right-0 mb-1.5 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[120px]">
                        {playable.map((f) => (
                          <button
                            key={f.itag}
                            type="button"
                            onMouseDown={() => {
                              setSelectedItag(f.itag);
                              setQualityOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                              f.itag === selectedItag
                                ? "bg-violet-500/20 text-violet-300"
                                : "text-zinc-300 hover:bg-white/[0.06]"
                            }`}
                          >
                            {f.qualityLabel}
                            {f.fps && f.fps > 30 ? ` · ${f.fps}fps` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Fullscreen */}
                <button
                  type="button" onClick={fullscreen}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Footer: format list + download ── */}
          <div className="px-4 pt-2 pb-4 border-t border-white/5 mt-1">
            <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest mb-2">
              Download this video
            </p>
            <div className="flex flex-wrap gap-2">
              {/* Combined formats */}
              {formats
                .filter((f) => f.hasVideo && f.hasAudio)
                .map((f) => (
                  <button
                    key={f.itag}
                    type="button"
                    onClick={() => onDownload(f.itag, false)}
                    className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-violet-500/10 hover:border-violet-500/30 text-zinc-300 hover:text-violet-300 transition-all cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    {f.qualityLabel} {f.container.toUpperCase()}
                  </button>
                ))}
              {/* Best audio */}
              {(() => {
                const audio = formats.find((f) => !f.hasVideo && f.hasAudio && f.container === "m4a")
                  ?? formats.find((f) => !f.hasVideo && f.hasAudio);
                return audio ? (
                  <button
                    key={audio.itag}
                    type="button"
                    onClick={() => onDownload(audio.itag, false)}
                    className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-pink-500/10 hover:border-pink-500/30 text-zinc-300 hover:text-pink-300 transition-all cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    Audio {audio.qualityLabel}
                  </button>
                ) : null;
              })()}
              {/* Best 4K/1080p adaptive */}
              {formats
                .filter((f) => f.hasVideo && !f.hasAudio && f.height >= 1080)
                .slice(0, 3)
                .map((f) => (
                  <button
                    key={f.itag}
                    type="button"
                    onClick={() => onDownload(f.itag, true)}
                    className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] hover:bg-amber-500/10 hover:border-amber-500/40 text-zinc-300 hover:text-amber-300 transition-all cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    {f.qualityLabel} +audio
                  </button>
                ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
