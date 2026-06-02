"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, CheckCircle2, AlertCircle, X,
  Scissors, Download, ChevronDown,
} from "lucide-react";
import type { DownloadState } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaylistQueueItem {
  id: string;
  title: string;
  state: DownloadState;
}

interface PlaylistToastProps {
  items: PlaylistQueueItem[];       // all videos in the active queue
  currentId: string | null;        // which video is actively downloading
  totalCount: number;
  completedCount: number;
  failedCount: number;
  isFinished: boolean;             // whole batch is done
  onDismiss: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusIcon({ state }: { state: DownloadState }) {
  const isMerging = state.phase === "merging";
  if (state.status === "downloading" && isMerging)
    return <Scissors className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />;
  if (state.status === "downloading")
    return <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin shrink-0" />;
  if (state.status === "completed")
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (state.status === "failed")
    return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  return <div className="w-3.5 h-3.5 rounded-full bg-white/10 shrink-0" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlaylistToast({
  items,
  currentId,
  totalCount,
  completedCount,
  failedCount,
  isFinished,
  onDismiss,
}: PlaylistToastProps) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Auto-scroll the list to keep the active item visible
  useEffect(() => {
    if (!expanded || !currentId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-id="${currentId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentId, expanded]);

  // Auto-dismiss 5s after everything is done
  useEffect(() => {
    if (!isFinished) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [isFinished, onDismiss]);

  if (!mounted || items.length === 0) return null;

  const activeItem = items.find((i) => i.id === currentId) ?? null;
  const activeState = activeItem?.state;
  const isMerging = activeState?.phase === "merging";
  const isTransferring = activeState?.phase === "transferring";
  const hasProgress = (activeState?.progress ?? 0) > 0;

  const overallPct = totalCount > 0
    ? Math.round(((completedCount + failedCount) / totalCount) * 100)
    : 0;

  const borderColor = isFinished
    ? failedCount > 0 ? "rgba(248,113,113,0.25)" : "rgba(52,211,153,0.25)"
    : "rgba(139,92,246,0.25)";

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="playlist-toast"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="fixed bottom-6 right-6 z-[9999] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          background: "rgba(10,10,16,0.97)",
          backdropFilter: "blur(12px)",
          borderColor,
        }}
      >
        {/* ── Overall progress bar at top ── */}
        <div className="w-full h-0.5 bg-white/5 overflow-hidden relative">
          {isFinished ? (
            <div
              className="h-full transition-all duration-500"
              style={{
                width: "100%",
                background: failedCount > 0
                  ? "linear-gradient(to right, #f87171, #fb923c)"
                  : "linear-gradient(to right, #34d399, #10b981)",
              }}
            />
          ) : (
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            />
          )}
        </div>

        {/* ── Header ── */}
        <div className="px-4 pt-3.5 pb-2 flex items-start gap-3">
          {/* Icon */}
          <div className="shrink-0 mt-0.5">
            {isFinished
              ? failedCount > 0
                ? <AlertCircle className="w-4 h-4 text-red-400" />
                : <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              : <Download className="w-4 h-4 text-violet-400 animate-pulse" />
            }
          </div>

          <div className="flex-1 min-w-0">
            {/* Title line */}
            <p className="text-xs font-bold text-zinc-100">
              {isFinished
                ? failedCount === 0
                  ? `Playlist complete · ${completedCount} saved`
                  : `Done · ${completedCount} saved, ${failedCount} failed`
                : `Downloading playlist · ${completedCount + failedCount + 1} / ${totalCount}`
              }
            </p>

            {/* Active video progress */}
            {!isFinished && activeItem && activeState && (
              <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                {isMerging
                  ? `Merging — ${activeItem.title}`
                  : isTransferring
                  ? `Saving — ${activeItem.title}`
                  : hasProgress
                  ? `${activeState.progress}% · ${activeState.downloadedMb} MB${activeState.speedMbps ? ` · ${activeState.speedMbps}` : ""} — ${activeItem.title}`
                  : `Starting — ${activeItem.title}`
                }
              </p>
            )}

            {/* Active video sub-progress bar */}
            {!isFinished && hasProgress && !isMerging && activeState && (
              <div className="mt-1.5 w-full h-1 bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all duration-300"
                  style={{ width: `${activeState.progress}%` }}
                />
              </div>
            )}
            {!isFinished && isMerging && (
              <div className="mt-1.5 w-full h-1 bg-white/[0.06] overflow-hidden relative rounded-full">
                <div
                  className="absolute h-full w-2/5 bg-gradient-to-r from-transparent via-amber-500 to-orange-400 rounded-full"
                  style={{ animation: "toast-slide 1.5s ease-in-out infinite" }}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Expand/collapse toggle */}
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="p-1 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                aria-label={expanded ? "Collapse list" : "Expand list"}
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
              </button>
            )}
            {/* Dismiss — only when finished */}
            {isFinished && (
              <button
                type="button"
                onClick={onDismiss}
                className="p-1 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Expandable per-video list ── */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-white/[0.06]"
            >
              <div
                ref={listRef}
                className="max-h-52 overflow-y-auto divide-y divide-white/[0.04] px-1 py-1"
              >
                {items.map((item) => {
                  const s = item.state;
                  const isActive = item.id === currentId;
                  const pct = s.progress ?? 0;
                  return (
                    <div
                      key={item.id}
                      data-id={item.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors ${
                        isActive ? "bg-violet-500/[0.07]" : ""
                      }`}
                    >
                      <StatusIcon state={s} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-zinc-300 truncate leading-snug">
                          {item.title}
                        </p>
                        {s.status === "downloading" && (
                          <div className="mt-1 flex items-center gap-1.5">
                            {s.phase === "merging" ? (
                              <span className="text-[9px] text-amber-400">merging…</span>
                            ) : s.phase === "transferring" ? (
                              <span className="text-[9px] text-violet-400">saving…</span>
                            ) : pct > 0 ? (
                              <>
                                <div className="flex-1 h-0.5 bg-white/[0.08] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-violet-500 rounded-full transition-all duration-300"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-zinc-500 tabular-nums shrink-0">{pct}%</span>
                              </>
                            ) : (
                              <span className="text-[9px] text-zinc-500">starting…</span>
                            )}
                          </div>
                        )}
                        {s.status === "completed" && (
                          <p className="text-[9px] text-emerald-500 mt-0.5">{s.downloadedMb} MB saved</p>
                        )}
                        {s.status === "failed" && (
                          <p className="text-[9px] text-red-400 mt-0.5">failed</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <style>{`
          @keyframes toast-slide {
            0%   { left: -40%; }
            100% { left: 110%; }
          }
        `}</style>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
