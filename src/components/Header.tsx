"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { Platform } from "@/types";
import { PLATFORM_CONFIGS } from "@/utils/platforms";

interface HeaderProps {
  platform: Platform;
}

export default function Header({ platform }: HeaderProps) {
  const cfg = PLATFORM_CONFIGS[platform];

  return (
    <header className="text-center mb-6 sm:mb-8 flex flex-col items-center">
      {/* Platform feature pill */}
      <motion.div
        key={`badge-${platform}`}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border mb-4 ${cfg.accentBadge}`}
      >
        <Sparkles className="w-3 h-3 shrink-0" />
        <span>
          {cfg.label} · {cfg.badge}
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white mb-2.5"
      >
        Download{" "}
        <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          {cfg.label}
        </span>{" "}
        Media
      </motion.h1>

      <motion.p
        key={`desc-${platform}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="text-zinc-400 text-xs sm:text-sm md:text-base max-w-xl px-2 text-center leading-relaxed"
      >
        {cfg.description}
      </motion.p>
    </header>
  );
}
