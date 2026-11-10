"use client";

import { motion } from "framer-motion";
import { Play, Tv, Camera, Film, Sparkles } from "lucide-react";
import Image from "next/image";
import type { Platform } from "@/types";
import { PLATFORM_LIST } from "@/utils/platforms";

interface NavbarProps {
  platform: Platform;
  setPlatform: (platform: Platform) => void;
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const PLATFORM_ICONS: Record<Platform, React.ElementType> = {
  youtube: Play,
  wetv: Tv,
  instagram: Camera,
  bilibili: Film,
  x: XIcon,
};

export default function Navbar({ platform, setPlatform }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-xl bg-zinc-950/70 border-b border-white/[0.06] px-3 py-2.5 sm:px-6 sm:py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        {/* Brand / Logo */}
        <div
          onClick={() => setPlatform("youtube")}
          className="flex items-center gap-2.5 cursor-pointer group shrink-0"
        >
          <div className="relative w-8 h-8 rounded-xl overflow-hidden border border-white/10 shadow-lg group-hover:border-violet-500/50 transition-colors duration-300">
            <Image
              src="/logo.png"
              alt="Anivora Logo"
              fill
              sizes="32px"
              className="object-cover"
            />
          </div>
          <div className="hidden xs:flex flex-col">
            <span className="text-sm sm:text-base font-black tracking-wider bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent leading-none">
              ANIVORA
            </span>
            <span className="text-[9px] font-semibold text-zinc-500 tracking-widest uppercase mt-0.5">
              Media Studio
            </span>
          </div>
        </div>

        {/* Platform Selector Pill Bar */}
        <div className="flex items-center gap-1 bg-zinc-900/70 p-1 rounded-2xl border border-white/[0.06] overflow-x-auto max-w-full">
          {PLATFORM_LIST.map(({ id, label, shortLabel, activeNavClass }) => {
            const Icon = PLATFORM_ICONS[id];
            const isActive = platform === id;
            return (
              <motion.button
                key={id}
                type="button"
                onClick={() => setPlatform(id)}
                whileTap={{ scale: 0.96 }}
                className={`relative flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? activeNavClass
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">{label}</span>
                <span className="inline md:hidden">{shortLabel}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Right Status Badge (Desktop) */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] font-semibold text-zinc-400 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span>4K FFmpeg Ready</span>
        </div>
      </div>
    </nav>
  );
}
