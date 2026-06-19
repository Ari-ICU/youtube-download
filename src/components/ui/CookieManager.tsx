"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ShieldAlert, ShieldOff, Upload, Trash2, Loader2, AlertTriangle } from "lucide-react";

interface CookieStatus {
  exists: boolean;
  ageDays?: number;
  sizeKb?: number;
  stale?: boolean;
}

export default function CookieManager() {
  const [status, setStatus] = useState<CookieStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/cookies");
      const json = await res.json() as CookieStatus;
      setStatus(json);
    } catch {
      setStatus({ exists: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const flash = (type: "ok" | "err", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("cookies", file);
      const res = await fetch("/api/cookies", { method: "POST", body: form });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed");
      flash("ok", "Cookies saved! VIP content is now unlocked.");
      await fetchStatus();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove cookies.txt? VIP content will no longer be accessible.")) return;
    setDeleting(true);
    try {
      await fetch("/api/cookies", { method: "DELETE" });
      flash("ok", "Cookies removed.");
      await fetchStatus();
    } catch {
      flash("err", "Failed to remove cookies.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return null;

  const isStale = status?.stale;
  const hasCookies = status?.exists;

  return (
    <div className="w-full mt-4">
      {/* ── Status Banner ── */}
      <motion.div
        layout
        className={`w-full rounded-2xl border p-4 flex flex-col gap-3 transition-colors duration-300 ${
          hasCookies
            ? isStale
              ? "bg-yellow-950/30 border-yellow-500/20"
              : "bg-emerald-950/30 border-emerald-500/20"
            : "bg-zinc-900/60 border-white/5"
        }`}
      >
        {/* Row: icon + info + actions */}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 ${
            hasCookies ? (isStale ? "text-yellow-400" : "text-emerald-400") : "text-zinc-500"
          }`}>
            {hasCookies
              ? isStale
                ? <ShieldAlert className="w-5 h-5" />
                : <ShieldCheck className="w-5 h-5" />
              : <ShieldOff className="w-5 h-5" />
            }
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold leading-tight ${
              hasCookies ? (isStale ? "text-yellow-300" : "text-emerald-300") : "text-zinc-300"
            }`}>
              {hasCookies
                ? isStale
                  ? "Cookies loaded — possibly expired"
                  : "Cookies loaded — VIP access active"
                : "No cookies — free content only"
              }
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {hasCookies
                ? `${status.sizeKb} KB · ${status.ageDays === 0 ? "uploaded today" : `${status.ageDays}d old`}${isStale ? " · consider refreshing" : ""}`
                : "Upload cookies.txt exported from a logged-in Premium browser session to unlock VIP episodes."
              }
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Upload button */}
            <label
              htmlFor="cookies-upload"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all duration-200 border ${
                uploading
                  ? "opacity-50 pointer-events-none"
                  : "bg-orange-500/10 border-orange-500/20 text-orange-300 hover:bg-orange-500/20 hover:text-orange-200"
              }`}
            >
              {uploading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />
              }
              <span className="hidden sm:inline">{hasCookies ? "Replace" : "Upload"}</span>
            </label>
            <input
              id="cookies-upload"
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className="sr-only"
              onChange={handleUpload}
              disabled={uploading}
            />

            {/* Delete button — only shown when cookies exist */}
            {hasCookies && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                {deleting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
                <span className="hidden sm:inline">Remove</span>
              </button>
            )}
          </div>
        </div>

        {/* Guide — only shown when no cookies */}
        {!hasCookies && (
          <div className="text-[11px] text-zinc-500 leading-relaxed pl-8 border-t border-white/5 pt-3">
            <span className="font-bold text-zinc-400">How to get cookies.txt:</span>
            {" "}Install the{" "}
            <a
              href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 underline underline-offset-2"
            >
              &ldquo;Get cookies.txt LOCALLY&rdquo;
            </a>
            {" "}extension → log in to bilibili.tv with your Premium account → click the extension → Export → upload the file above.
          </div>
        )}
      </motion.div>

      {/* ── Feedback toast ── */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border ${
              feedback.type === "ok"
                ? "bg-emerald-950/40 border-emerald-500/20 text-emerald-300"
                : "bg-red-950/40 border-red-500/20 text-red-300"
            }`}
          >
            {feedback.type === "err" && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            {feedback.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
