"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Upload,
  Trash2,
  Loader2,
  AlertTriangle,
  X,
  FileText,
  HelpCircle,
} from "lucide-react";

interface CookieStatus {
  exists: boolean;
  ageDays?: number;
  sizeKb?: number;
  stale?: boolean;
}

interface CookieModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CookieModal({ isOpen, onClose }: CookieModalProps) {
  const [status, setStatus] = useState<CookieStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/cookies");
      const json = (await res.json()) as CookieStatus;
      setStatus(json);
    } catch {
      setStatus({ exists: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

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
      const json = (await res.json()) as { success?: boolean; error?: string };
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

  const isStale = status?.stale;
  const hasCookies = status?.exists;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-lg glass-panel rounded-3xl border border-white/10 p-6 sm:p-8 shadow-2xl overflow-hidden z-10 flex flex-col gap-6 bg-zinc-950/90"
          >
            {/* Background glowing circle */}
            <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-purple" />
                <h2 className="text-lg font-extrabold text-zinc-100">VIP Authentication & Cookies</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Main Content */}
            <div className="flex flex-col gap-5">
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                To download premium or VIP restricted content from platforms like **WeTV** (to avoid the 4-minute preview restriction) or **Bilibili TV**, you can upload your browser session cookies as a `cookies.txt` file.
              </p>

              {/* ── Status Card ── */}
              {loading ? (
                <div className="w-full py-8 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-purple" />
                </div>
              ) : (
                <motion.div
                  layout
                  className={`w-full rounded-2xl border p-4 flex flex-col gap-3 transition-colors duration-300 ${
                    hasCookies
                      ? isStale
                        ? "bg-yellow-950/20 border-yellow-500/20"
                        : "bg-emerald-950/20 border-emerald-500/20"
                      : "bg-white/[0.02] border-white/5"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 shrink-0 ${
                      hasCookies ? (isStale ? "text-yellow-400" : "text-emerald-400") : "text-zinc-500"
                    }`}>
                      {hasCookies ? (
                        isStale ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />
                      ) : (
                        <ShieldOff className="w-5 h-5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-extrabold leading-tight ${
                        hasCookies ? (isStale ? "text-yellow-300" : "text-emerald-300") : "text-zinc-300"
                      }`}>
                        {hasCookies
                          ? isStale
                            ? "Cookies Loaded — Possibly Expired"
                            : "Cookies Loaded — VIP Access Active"
                          : "No Cookies Uploaded — Free Content Only"}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1 leading-tight">
                        {hasCookies
                          ? `${status.sizeKb} KB · ${status.ageDays === 0 ? "uploaded today" : `${status.ageDays}d old`}${isStale ? " · consider refreshing" : ""}`
                          : "No cookies.txt is currently active on the server. VIP content will only download as short preview clips."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3 mt-1">
                    {/* Upload button */}
                    <label
                      htmlFor="cookies-upload"
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all duration-200 border ${
                        uploading
                          ? "opacity-50 pointer-events-none"
                          : "bg-brand-purple/10 border-brand-purple/20 text-brand-purple hover:bg-brand-purple/20 hover:text-white"
                      }`}
                    >
                      {uploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{hasCookies ? "Update Cookies" : "Upload cookies.txt"}</span>
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

                    {/* Delete button */}
                    {hasCookies && (
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      >
                        {deleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── Instructions Guide ── */}
              <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-zinc-300 text-xs font-bold uppercase tracking-wider">
                  <HelpCircle className="w-4 h-4 text-zinc-400" />
                  <span>How to export & unlock VIP:</span>
                </div>
                <ol className="list-decimal list-inside text-xs text-zinc-500 space-y-1.5 leading-relaxed pl-1">
                  <li>
                    Install the Chrome extension{" "}
                    <a
                      href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-purple hover:underline"
                    >
                      &ldquo;Get cookies.txt LOCALLY&rdquo;
                    </a>.
                  </li>
                  <li>
                    Log in to your <strong>WeTV</strong> (or Bilibili TV) Premium account in your browser.
                  </li>
                  <li>
                    Click the extension icon, choose <strong>Export</strong> (or save as `cookies.txt`).
                  </li>
                  <li>
                    Upload the downloaded `cookies.txt` file using the upload button above.
                  </li>
                </ol>
              </div>
            </div>

            {/* Feedback toast inside modal */}
            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold border ${
                    feedback.type === "ok"
                      ? "bg-emerald-950/40 border-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                      : "bg-red-950/40 border-red-500/20 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.05)]"
                  }`}
                >
                  {feedback.type === "err" && <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <span>{feedback.msg}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
