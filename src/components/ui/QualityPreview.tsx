"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Sparkles,
  Video,
  Music,
  ChevronDown,
  Zap,
  HardDrive,
  Film,
} from "lucide-react";
import type { VideoFormat } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QualityRow {
  format: VideoFormat;
  needsMerge: boolean;
  tier: "4k" | "2k" | "hd" | "sd" | "audio";
}

interface QualityPreviewProps {
  formats: VideoFormat[];
  duration: number;
  isDownloading: boolean;
  onDownload: (itag: string, needsMerge: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTier(f: VideoFormat): QualityRow["tier"] {
  if (!f.hasVideo) return "audio";
  if (f.height >= 2160) return "4k";
  if (f.height >= 1440) return "2k";
  if (f.height >= 720)  return "hd";
  return "sd";
}

// Static colour maps — no dynamic Tailwind class strings
const TIER_STYLES = {
  "4k": {
    border:       "border-rose-500/25",
    bg:           "bg-rose-500/[0.05]",
    hoverBg:      "hover:bg-rose-500/[0.10]",
    hoverBorder:  "hover:border-rose-500/50",
    badgeBg:      "bg-rose-500/20 text-rose-300 border-rose-500/30",
    bar:          "bg-rose-400",
    iconHover:    "group-hover:text-rose-400",
    dot:          "bg-rose-400",
  },
  "2k": {
    border:       "border-amber-500/25",
    bg:           "bg-amber-500/[0.05]",
    hoverBg:      "hover:bg-amber-500/[0.10]",
    hoverBorder:  "hover:border-amber-500/50",
    badgeBg:      "bg-amber-500/20 text-amber-300 border-amber-500/30",
    bar:          "bg-amber-400",
    iconHover:    "group-hover:text-amber-400",
    dot:          "bg-amber-400",
  },
  hd: {
    border:       "border-white/5",
    bg:           "bg-white/[0.02]",
    hoverBg:      "hover:bg-white/[0.06]",
    hoverBorder:  "hover:border-violet-500/40",
    badgeBg:      "bg-violet-500/20 text-violet-300 border-violet-500/30",
    bar:          "bg-violet-500",
    iconHover:    "group-hover:text-violet-400",
    dot:          "bg-violet-400",
  },
  sd: {
    border:       "border-white/5",
    bg:           "bg-white/[0.02]",
    hoverBg:      "hover:bg-white/[0.05]",
    hoverBorder:  "hover:border-blue-500/40",
    badgeBg:      "bg-blue-500/20 text-blue-300 border-blue-500/30",
    bar:          "bg-blue-500",
    iconHover:    "group-hover:text-blue-400",
    dot:          "bg-blue-400",
  },
  audio: {
    border:       "border-white/5",
    bg:           "bg-white/[0.02]",
    hoverBg:      "hover:bg-white/[0.05]",
    hoverBorder:  "hover:border-pink-500/40",
    badgeBg:      "bg-pink-500/20 text-pink-300 border-pink-500/30",
    bar:          "bg-pink-500",
    iconHover:    "group-hover:text-pink-400",
    dot:          "bg-pink-400",
  },
} as const;

const TIER_ICONS: Record<QualityRow["tier"], React.ReactNode> = {
  "4k":  <Sparkles className="w-3 h-3 text-rose-400"   />,
  "2k":  <Sparkles className="w-3 h-3 text-amber-400"  />,
  hd:    <Video    className="w-3 h-3 text-violet-400"  />,
  sd:    <Film     className="w-3 h-3 text-blue-400"    />,
  audio: <Music    className="w-3 h-3 text-pink-400"    />,
};

/** Human-readable codec label */
function codecLabel(vcodec: string | null, acodec: string | null, hasVideo: boolean, vbr: number | null): string {
  const v = (vcodec ?? "").toLowerCase();
  const a = (acodec ?? "").toLowerCase();
  const vLabel = v.startsWith("av01") || v.startsWith("av1") ? "AV1"
    : v.startsWith("vp09") || v.startsWith("vp9") ? "VP9"
    : v.startsWith("avc") ? "H.264"
    : v.startsWith("hev") ? "HEVC"
    : v || "";
  const aLabel = a.startsWith("mp4a") ? "AAC"
    : a.startsWith("opus") ? "Opus"
    : a || "";
  if (!hasVideo) return aLabel || "Audio";
  
  const parts = [vLabel, aLabel].filter(Boolean);
  const codec = parts.join(" + ") || "—";
  
  // Show bitrate for video formats (helps users choose when same codec+res but different quality)
  if (vbr && vbr > 0) {
    const mbps = (vbr / 1000).toFixed(1);
    return `${codec} · ${mbps} Mbps`;
  }
  return codec;
}

/** Short codec tag for the badge */
function codecTag(vcodec: string | null): string {
  const v = (vcodec ?? "").toLowerCase();
  if (v.startsWith("av01") || v.startsWith("av1")) return "AV1";
  if (v.startsWith("vp09") || v.startsWith("vp9")) return "VP9";
  if (v.startsWith("avc"))  return "H.264";
  if (v.startsWith("hev"))  return "HEVC";
  return "";
}

function estimateMb(duration: number, height: number, isAudio: boolean): number {
  if (isAudio)       return (duration * 128_000)    / 8 / 1024 / 1024;
  if (height >= 2160) return (duration * 20_000_000) / 8 / 1024 / 1024;
  if (height >= 1440) return (duration * 10_000_000) / 8 / 1024 / 1024;
  if (height >= 1080) return (duration * 4_000_000)  / 8 / 1024 / 1024;
  if (height >= 720)  return (duration * 2_500_000)  / 8 / 1024 / 1024;
  if (height >= 480)  return (duration * 1_000_000)  / 8 / 1024 / 1024;
  return               (duration * 500_000)           / 8 / 1024 / 1024;
}

// ─── SizeBar ──────────────────────────────────────────────────────────────────

function SizeBar({ mb, maxMb, barClass }: { mb: number; maxMb: number; barClass: string }) {
  const pct = maxMb > 0 ? Math.max(3, Math.round((mb / maxMb) * 100)) : 3;
  return (
    <div className="flex items-center gap-2 w-full min-w-0">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-zinc-400 tabular-nums shrink-0 w-12 text-right">
        {mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`}
      </span>
    </div>
  );
}

// ─── QualityCard ──────────────────────────────────────────────────────────────

function QualityCard({
  row, maxMb, duration, isDownloading, onDownload,
}: {
  row: QualityRow;
  maxMb: number;
  duration: number;
  isDownloading: boolean;
  onDownload: (itag: string, needsMerge: boolean) => void;
}) {
  const { format, needsMerge, tier } = row;
  const s = TIER_STYLES[tier];
  const isAudio = !format.hasVideo;
  const mb = format.contentLength != null
    ? format.contentLength / 1024 / 1024
    : estimateMb(duration, format.height, isAudio);
  const approx = format.contentLength == null;
  const tag = codecTag(format.vcodec ?? null);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className={[
        "group flex flex-col gap-2 p-3 sm:p-3.5 rounded-xl border transition-colors select-none",
        s.bg, s.border, s.hoverBg, s.hoverBorder,
        isDownloading ? "opacity-50 pointer-events-none" : "cursor-pointer",
      ].join(" ")}
      onClick={() => !isDownloading && onDownload(format.itag, needsMerge)}
      role="button"
      tabIndex={isDownloading ? -1 : 0}
      onKeyDown={(e) => e.key === "Enter" && !isDownloading && onDownload(format.itag, needsMerge)}
      aria-label={`Download ${format.qualityLabel} ${format.container.toUpperCase()}`}
    >
      {/* Row 1: tier icon + resolution badge + codec tag + fps + download icon */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {TIER_ICONS[tier]}
          <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${s.badgeBg}`}>
            {format.qualityLabel}
          </span>
          <span className="text-[10px] font-semibold text-zinc-500 uppercase">{format.container}</span>
          {tag && (
            <span className="text-[9px] font-bold text-zinc-600 border border-white/5 px-1 py-0.5 rounded">
              {tag}
            </span>
          )}
          {format.fps && format.fps > 30 && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400">
              <Zap className="w-2.5 h-2.5" />{format.fps}fps
            </span>
          )}
          {needsMerge && (
            <span className="text-[9px] text-zinc-600 border border-white/5 px-1 py-0.5 rounded">
              +audio
            </span>
          )}
        </div>
        <Download className={`w-3.5 h-3.5 shrink-0 text-zinc-600 transition-colors ${s.iconHover}`} />
      </div>

      {/* Row 2: codec string */}
      <div className="flex items-center gap-1 text-[10px] text-zinc-500 min-w-0">
        <Film className="w-3 h-3 shrink-0 text-zinc-600" />
        <span className="truncate">{codecLabel(format.vcodec ?? null, format.acodec ?? null, format.hasVideo, format.vbr ?? null)}</span>
      </div>

      {/* Row 3: size bar */}
      <div className="flex items-center gap-1.5 min-w-0">
        <HardDrive className="w-3 h-3 text-zinc-600 shrink-0" />
        <SizeBar mb={mb} maxMb={maxMb} barClass={s.bar} />
        {approx && <span className="text-[9px] text-zinc-600 shrink-0">~</span>}
      </div>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TIER_ORDER: QualityRow["tier"][] = ["4k", "2k", "hd", "sd", "audio"];
const INITIAL_SHOW = 8;

export default function QualityPreview({
  formats, duration, isDownloading, onDownload,
}: QualityPreviewProps) {
  const [activeTier, setActiveTier] = useState<QualityRow["tier"] | "all">("all");
  const [showAll, setShowAll] = useState(false);

  // Build rows — keep every unique itag (no dedup), sort by tier then height desc
  const allRows: QualityRow[] = formats.map((f) => ({
    format: f,
    needsMerge: f.hasVideo && !f.hasAudio,
    tier: getTier(f),
  }));

  // Sort: tier order, then height desc, then contentLength desc
  const sorted = [...allRows].sort((a, b) => {
    const ti = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    if (ti !== 0) return ti;
    const hi = (b.format.height ?? 0) - (a.format.height ?? 0);
    if (hi !== 0) return hi;
    return (b.format.contentLength ?? 0) - (a.format.contentLength ?? 0);
  });

  const filtered = activeTier === "all"
    ? sorted
    : sorted.filter((r) => r.tier === activeTier);

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_SHOW);
  const hasMore = filtered.length > INITIAL_SHOW;

  const maxMb = Math.max(
    ...sorted.map((r) =>
      r.format.contentLength != null
        ? r.format.contentLength / 1024 / 1024
        : estimateMb(duration, r.format.height, !r.format.hasVideo)
    ),
    1
  );

  const counts = Object.fromEntries(
    TIER_ORDER.map((t) => [t, sorted.filter((r) => r.tier === t).length])
  ) as Record<QualityRow["tier"], number>;

  const tabs: { id: QualityRow["tier"] | "all"; label: string }[] = [
    { id: "all",   label: `All (${sorted.length})` },
    ...(counts["4k"]  > 0 ? [{ id: "4k"    as const, label: `4K (${counts["4k"]})`     }] : []),
    ...(counts["2k"]  > 0 ? [{ id: "2k"    as const, label: `2K (${counts["2k"]})`     }] : []),
    ...(counts.hd     > 0 ? [{ id: "hd"    as const, label: `HD (${counts.hd})`        }] : []),
    ...(counts.sd     > 0 ? [{ id: "sd"    as const, label: `SD (${counts.sd})`        }] : []),
    ...(counts.audio  > 0 ? [{ id: "audio" as const, label: `Audio (${counts.audio})`  }] : []),
  ];

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTier(tab.id); setShowAll(false); }}
            className={[
              "text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer whitespace-nowrap",
              activeTier === tab.id
                ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                : "bg-white/[0.03] text-zinc-500 border-white/5 hover:bg-white/[0.06] hover:text-zinc-300",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((row) => (
            <QualityCard
              key={row.format.itag}
              row={row}
              maxMb={maxMb}
              duration={duration}
              isDownloading={isDownloading}
              onDownload={onDownload}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Show more / less */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 py-1.5 border border-white/5 rounded-xl hover:bg-white/[0.03] transition-all cursor-pointer"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAll ? "rotate-180" : ""}`} />
          {showAll ? "Show less" : `Show ${filtered.length - INITIAL_SHOW} more formats`}
        </button>
      )}

      {filtered.length === 0 && (
        <p className="text-xs text-zinc-500 text-center py-4">No formats in this category.</p>
      )}
    </div>
  );
}
