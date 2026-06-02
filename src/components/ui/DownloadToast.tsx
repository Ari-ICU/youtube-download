"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import type { DownloadState } from "@/types";

interface DownloadToastProps {
  state: DownloadState | null;
  title: string;
  onDismiss: () => void;
}

export default function DownloadToast({ state, title, onDismiss }: DownloadToastProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Auto-dismiss completed/failed after 4 s
  useEffect(() => {
    if (state?.status === "completed" || state?.status === "failed") {
      const t = setTimeout(onDismiss, 4000);
      return () => clearTimeout(t);
    }
  }, [state?.status, onDismiss]);

  if (!mounted || !state || state.status === "idle") return null;

  const isDownloading = state.status === "downloading";
  const isCompleted   = state.status === "completed";
  const isFailed      = state.status === "failed";
  const hasProgress   = state.progress > 0;

  return createPortal(
    <AnimatePresence>
      {state && (
        <motion.div
          key="download-toast"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0,  scale: 1     }}
          exit={{    opacity: 0, y: 16, scale: 0.97  }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed bottom-6 right-6 z-[9999] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border shadow-2xl overflow-hidden"
          style={{
            background: "rgba(10,10,16,0.97)",
            backdropFilter: "blur(12px)",
            borderColor: isCompleted ? "rgba(52,211,153,0.25)"
                       : isFailed   ? "rgba(248,113,113,0.25)"
                       : "rgba(139,92,246,0.25)",
          }}
        >
          {/* Progress bar stripe at top */}
          {isDownloading && (
            <div className="w-full h-0.5 bg-white/5 overflow-hidden relative">
              {hasProgress ? (
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${state.progress}%` }}
                />
              ) : (
                <div
                  className="absolute h-full w-2/5 bg-gradient-to-r from-transparent via-violet-500 to-pink-500 rounded-full"
                  style={{ animation: "toast-slide 1.5s ease-in-out infinite" }}
                />
              )}
            </div>
          )}

          <div className="px-4 py-3.5 flex items-start gap-3">
            {/* Icon */}
            <div className="shrink-0 mt-0.5">
              {isDownloading && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
              {isCompleted   && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {isFailed      && <AlertCircle  className="w-4 h-4 text-red-400"     />}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-zinc-100 truncate">{title}</p>

              {isDownloading && (
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {hasProgress
                    ? `${state.progress}% · ${state.downloadedMb} MB`
                    : `Buffering… ${state.downloadedMb} MB`}
                </p>
              )}
              {isCompleted && (
                <p className="text-[10px] text-emerald-400 mt-0.5">
                  Done — {state.downloadedMb} MB saved
                </p>
              )}
              {isFailed && (
                <p className="text-[10px] text-red-400 mt-0.5">
                  Failed. Try a different format.
                </p>
              )}

              {/* Inline progress bar for downloading */}
              {isDownloading && hasProgress && (
                <div className="mt-2 w-full h-1 bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all duration-300"
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              )}
            </div>

            {/* Dismiss */}
            {!isDownloading && (
              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 p-1 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <style>{`
            @keyframes toast-slide {
              0%   { left: -40%; }
              100% { left: 110%; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
