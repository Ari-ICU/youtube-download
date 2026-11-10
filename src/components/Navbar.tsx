"use client";

import { motion } from "framer-motion";
import { Play, Sparkles } from "lucide-react";
import Image from "next/image";
import type { Platform } from "@/types";
import { PLATFORM_LIST } from "@/utils/platforms";

interface NavbarProps {
  platform: Platform;
  setPlatform: (platform: Platform) => void;
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
    </svg>
  );
}

const PLATFORM_ICONS: Record<Platform, React.ElementType> = {
  youtube: Play,
  tiktok: TikTokIcon,
  facebook: FacebookIcon,
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
          <div className="relative w-8 h-8 rounded-xl overflow-hidden border border-white/10 shadow-lg group-hover:border-red-500/50 transition-colors duration-300">
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
        <div className="flex items-center gap-1.5 bg-zinc-900/70 p-1 rounded-2xl border border-white/[0.06] overflow-x-auto max-w-full">
          {PLATFORM_LIST.map(({ id, label, shortLabel, activeNavClass }) => {
            const Icon = PLATFORM_ICONS[id];
            const isActive = platform === id;
            return (
              <motion.button
                key={id}
                type="button"
                onClick={() => setPlatform(id)}
                whileTap={{ scale: 0.96 }}
                className={`relative flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? activeNavClass
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
                <span className="inline sm:hidden">{shortLabel}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Right Status Badge (Desktop) */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] font-semibold text-zinc-400 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>4K UHD Ready</span>
        </div>
      </div>
    </nav>
  );
}
