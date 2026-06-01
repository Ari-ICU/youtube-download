import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { DownloadState } from "@/types";

interface DownloadProgressProps {
  state: DownloadState;
}

/**
 * Inline download progress indicator.
 * Renders one of three states: downloading (with progress bar), completed, or failed.
 * Pass `null` / omit mounting when status is "idle".
 *
 * When progress === 0 (file size unknown / Content-Length missing), renders an
 * indeterminate shimmer bar so the UI never looks frozen.
 */
export default function DownloadProgress({ state }: DownloadProgressProps) {
  if (state.status === "downloading") {
    const hasProgress = state.progress > 0;
    return (
      <div className="w-full bg-violet-500/10 border border-violet-500/20 p-4 rounded-xl backdrop-blur-md">
        <div className="flex items-center justify-between text-xs font-bold text-violet-400 mb-2">
          <span className="flex items-center gap-1.5 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Extracting stream…
          </span>
          <span>
            {hasProgress ? `${state.progress}% · ` : ""}{state.downloadedMb} MB
          </span>
        </div>

        <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-white/5 relative">
          {hasProgress ? (
            /* ── Determinate: real byte progress known ── */
            <div
              className="bg-gradient-to-r from-violet-500 to-pink-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${state.progress}%` }}
            />
          ) : (
            /* ── Indeterminate: Content-Length unavailable, still downloading ── */
            <div
              className="absolute h-full w-2/5 bg-gradient-to-r from-transparent via-violet-500 to-pink-500 rounded-full"
              style={{ animation: "indeterminate-slide 1.5s ease-in-out infinite" }}
            />
          )}
        </div>

        <p className="text-[10px] text-zinc-500 mt-2">
          {hasProgress
            ? "Stream is piped chunk-by-chunk. Do not close this tab."
            : "Buffering stream… file size could not be determined."}
        </p>

        <style>{`
          @keyframes indeterminate-slide {
            0%   { left: -40%; }
            100% { left: 110%; }
          }
        `}</style>
      </div>
    );
  }

  if (state.status === "completed") {
    return (
      <div className="w-full bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-center gap-3 text-emerald-400">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <div className="text-xs">
          <span className="font-bold block">Download complete!</span>
          <span className="text-zinc-400">
            {state.downloadedMb} MB saved — check your browser downloads folder.
          </span>
        </div>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="w-full bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-400">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <div className="text-xs">
          <span className="font-bold block">Stream connection interrupted</span>
          <span className="text-zinc-400">
            YouTube may have throttled the request. Try a different format.
          </span>
        </div>
      </div>
    );
  }

  return null;
}
