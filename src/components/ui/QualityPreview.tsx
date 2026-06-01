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
  tier: "uhd" | "hd" | "sd" | "audio";
}

interface QualityPreviewProps {
  formats: VideoFormat[];
  duration: number; // seconds — used for size estimation when contentLength is null
  isDownloading: boolean;
  onDownload: (itag: string, needsMerge: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTier(f: VideoFormat): QualityRow["tier"] {
  if (!f.hasVideo) return "audio";
  if (f.height >= 1440) return "uhd";
  if (f.height >= 720) return "hd";
  return "sd";
}

function tierMeta(tier: QualityRow["tier"]) {
  switch (tier) {
    case "uhd":
      return {
        label: "4K / UHD",
        icon: <Sparkles className="w-3.5 h-3.5" />,
        color: "text-amber-400",
        border: "border-amber-500/25",
        bg: "bg-amber-500/[0.05]",
        hoverBg: "hover:bg-amber-500/[0.10]",
        hoverBorder: "hover:border-amber-500/50",
        badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        bar: "bg-amber-400",
      };
    case "hd":
      return {
        label: "HD",
        icon: <Video className="w-3.5 h-3.5" />,
        color: "text-brand-purple",
        border: "border-white/5",
        bg: "bg-white/[0.02]",
        hoverBg: "hover:bg-white/[0.06]",
        hoverBorder: "hover:border-brand-purple/40",
        badge: "bg-brand-purple/20 text-purple-300 border-brand-purple/30",
        bar: "bg-brand-purple",
      };
    case "sd":
      return {
        label: "SD",
        icon: <Film className="w-3.5 h-3.5" />,
        color: "text-brand-blue",
        border: "border-white/5",
        bg: "bg-white/[0.02]",
        hoverBg: "hover:bg-white/[0.05]",
        hoverBorder: "hover:border-brand-blue/40",
        badge: "bg-brand-blue/20 text-blue-300 border-brand-blue/30",
        bar: "bg-brand-blue",
      };
    case "audio":
      return {
        label: "Audio",
        icon: <Music className="w-3.5 h-3.5" />,
        color: "text-brand-pink",
        border: "border-white/5",
        bg: "bg-white/[0.02]",
        hoverBg: "hover:bg-white/[0.05]",
        hoverBorder: "hover:border-brand-pink/40",
        badge: "bg-brand-pink/20 text-pink-300 border-brand-pink/30",
        bar: "bg-brand-pink",
      };
  }
}

/** Friendly short codec name */
function codecLabel(vcodec: string | null, acodec: string | null, hasVideo: boolean): string {
  const v = vcodec?.toLowerCase() ?? "";
  const a = acodec?.toLowerCase() ?? "";
  const vLabel = v.startsWith("av0") ? "AV1" : v.startsWith("vp9") ? "VP9" : v.startsWith("avc") ? "H.264" : v ? v.toUpperCase() : "";
  const aLabel = a.startsWith("mp4a") ? "AAC" : a.startsWith("opus") ? "Opus" : a ? a.toUpperCase() : "";
  if (!hasVideo) return aLabel || "Audio";
  return [vLabel, aLabel].filter(Boolean).join(" + ") || "—";
}

/** Estimate size in MB from duration + height when contentLength is absent */
function estimateMb(duration: number, height: number, isAudio: boolean): number {
  if (isAudio) return (duration * 128_000) / 8 / 1024 / 1024;
  if (height >= 2160) return (duration * 20_000_000) / 8 / 1024 / 1024;
  if (height >= 1440) return (duration * 10_000_000) / 8 / 1024 / 1024;
  if (height >= 1080) return (duration * 4_000_000) / 8 / 1024 / 1024;
  if (height >= 720)  return (duration * 2_500_000) / 8 / 1024 / 1024;
  if (height >= 480)  return (duration * 1_000_000) / 8 / 1024 / 1024;
  return (duration * 500_000) / 8 / 1024 / 1024;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Horizontal bar showing relative file size */
function SizeBar({ mb, maxMb, color }: { mb: number; maxMb: number; color: string }) {
  const pct = maxMb > 0 ? Math.max(4, Math.round((mb / maxMb) * 100)) : 4;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-400 tabular-nums w-14 text-right shrink-0">
        {mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`}
      </span>
    </div>
  );
}

/** A single quality row card */
function QualityCard({
  row,
  maxMb,
  duration,
  isDownloading,
  onDownload,
}: {
  row: QualityRow;
  maxMb: number;
  duration: number;
  isDownloading: boolean;
  onDownload: (itag: string, needsMerge: boolean) => void;
}) {
  const { format, needsMerge, tier } = row;
  const meta = tierMeta(tier);
  const isAudio = !format.hasVideo;
  const mb =
    format.contentLength != null
      ? format.contentLength / 1024 / 1024
      : estimateMb(duration, format.height, isAudio);
  const sizeApprox = format.contentLength == null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={[
        "group flex flex-col gap-2.5 p-3.5 rounded-xl border transition-all",
        meta.bg, meta.border, meta.hoverBg, meta.hoverBorder,
        isDownloading ? "opacity-50 pointer-events-none" : "cursor-pointer",
      ].join(" ")}
      onClick={() => !isDownloading && onDownload(format.itag, needsMerge)}
      role="button"
      tabIndex={isDownloading ? -1 : 0}
      onKeyDown={(e) => e.key === "Enter" && !isDownloading && onDownload(format.itag, needsMerge)}
      aria-label={`Download ${format.qualityLabel} ${format.container.toUpperCase()}`}
    >
      {/* Top row: quality label + badges + download icon */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Resolution badge */}
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${meta.badge}`}>
            {format.qualityLabel}
          </span>
          {/* Container */}
          <span className="text-[10px] font-bold text-zinc-500 uppercase">
            {format.container}
          </span>
          {/* FPS */}
          {format.fps && format.fps > 30 && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400">
              <Zap className="w-2.5 h-2.5" />
              {format.fps}fps
            </span>
          )}
          {/* Merge note */}
          {needsMerge && (
            <span className="text-[9px] text-zinc-500 border border-white/5 px-1.5 py-0.5 rounded">
              +audio merge
            </span>
          )}
        </div>
        <Download
          className={`w-4 h-4 shrink-0 mt-0.5 transition-colors text-zinc-500 group-hover:${meta.color}`}
        />
      </div>

      {/* Codec */}
      <div className="flex items-center gap-1 text-[10px] text-zinc-500">
        <Film className="w-3 h-3 shrink-0" />
        {codecLabel(format.vcodec ?? null, format.acodec ?? null, format.hasVideo)}
      </div>

      {/* Size bar */}
      <div className="flex items-center gap-1.5">
        <HardDrive className="w-3 h-3 text-zinc-600 shrink-0" />
        <SizeBar mb={mb} maxMb={maxMb} color={meta.bar} />
        {sizeApprox && (
          <span className="text-[9px] text-zinc-600 shrink-0">~est</span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TIER_ORDER: QualityRow["tier"][] = ["uhd", "hd", "sd", "audio"];

export default function QualityPreview({
  formats,
  duration,
  isDownloading,
  onDownload,
}: QualityPreviewProps) {
  const [activeTier, setActiveTier] = useState<QualityRow["tier"] | "all">("all");
  const [showAll, setShowAll] = useState(false);

  // Build rows — deduplicate by qualityLabel+container, keep best (highest contentLength)
  const seen = new Map<string, QualityRow>();
  for (const f of formats) {
    const tier = getTier(f);
    const needsMerge = f.hasVideo && !f.hasAudio;
    const key = `${f.qualityLabel}-${f.container}-${tier}`;
    const existing = seen.get(key);
    if (!existing || (f.contentLength ?? 0) > (existing.format.contentLength ?? 0)) {
      seen.set(key, { format: f, needsMerge, tier });
    }
  }

  const allRows = TIER_ORDER.flatMap((t) =>
    [...seen.values()].filter((r) => r.tier === t)
  );

  const filtered =
    activeTier === "all" ? allRows : allRows.filter((r) => r.tier === activeTier);

  const INITIAL_SHOW = 6;
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_SHOW);
  const hasMore = filtered.length > INITIAL_SHOW;

  // Max MB across all rows for relative bar scaling
  const maxMb = Math.max(
    ...allRows.map((r) =>
      r.format.contentLength != null
        ? r.format.contentLength / 1024 / 1024
        : estimateMb(duration, r.format.height, !r.format.hasVideo)
    ),
    1
  );

  // Tier tab counts
  const counts = Object.fromEntries(
    TIER_ORDER.map((t) => [t, allRows.filter((r) => r.tier === t).length])
  ) as Record<QualityRow["tier"], number>;

  const tabs: { id: QualityRow["tier"] | "all"; label: string }[] = [
    { id: "all", label: `All (${allRows.length})` },
    ...(counts.uhd > 0 ? [{ id: "uhd" as const, label: `4K (${counts.uhd})` }] : []),
    ...(counts.hd > 0 ? [{ id: "hd" as const, label: `HD (${counts.hd})` }] : []),
    ...(counts.sd > 0 ? [{ id: "sd" as const, label: `SD (${counts.sd})` }] : []),
    ...(counts.audio > 0 ? [{ id: "audio" as const, label: `Audio (${counts.audio})` }] : []),
  ];

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
        {tabs.map((tab) => {
          const isActive = activeTier === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTier(tab.id); setShowAll(false); }}
              className={[
                "text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer",
                isActive
                  ? "bg-brand-purple/20 text-purple-300 border-brand-purple/40"
                  : "bg-white/[0.03] text-zinc-500 border-white/5 hover:bg-white/[0.06] hover:text-zinc-300",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Cards grid — 1 col on mobile, 2 on sm+ */}
      <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
        <AnimatePresence mode="popLayout">
          {visible.map((row) => (
            <QualityCard
              key={`${row.format.itag}-${row.tier}`}
              row={row}
              maxMb={maxMb}
              duration={duration}
              isDownloading={isDownloading}
              onDownload={onDownload}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Show more / less */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 py-1.5 border border-white/5 rounded-xl hover:bg-white/[0.03] transition-all cursor-pointer"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${showAll ? "rotate-180" : ""}`}
          />
          {showAll
            ? "Show less"
            : `Show ${filtered.length - INITIAL_SHOW} more formats`}
        </button>
      )}
    </div>
  );
}
