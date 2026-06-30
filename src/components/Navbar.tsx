"use client";

import { motion } from "framer-motion";
import { Globe, Key, Play, Tv, Camera, Film } from "lucide-react";
import Image from "next/image";

interface NavbarProps {
  platform: "youtube" | "wetv" | "instagram" | "bilibili" | "x";
  setPlatform: (platform: "youtube" | "wetv" | "instagram" | "bilibili" | "x") => void;
  bypassGlobal: boolean;
  setBypassGlobal: (bypassGlobal: boolean) => void;
  onOpenCookies: () => void;
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

const platforms = [
  {
    id: "youtube" as const,
    label: "YouTube",
    icon: Play,
    activeClass:
      "bg-red-600/20 text-red-400 border border-red-500/20 shadow-[0_0_15px_rgba(220,38,38,0.15)]",
  },
  {
    id: "wetv" as const,
    label: "WeTV",
    icon: Tv,
    activeClass:
      "bg-violet-600/20 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.15)]",
  },
  {
    id: "instagram" as const,
    label: "Instagram",
    icon: Camera,
    activeClass:
      "bg-pink-600/20 text-pink-400 border border-pink-500/20 shadow-[0_0_15px_rgba(219,39,119,0.15)]",
  },
  {
    id: "bilibili" as const,
    label: "Bilibili TV",
    icon: Film,
    activeClass:
      "bg-orange-600/20 text-orange-400 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]",
  },
  {
    id: "x" as const,
    label: "X (Twitter)",
    icon: XIcon,
    activeClass:
      "bg-zinc-800/40 text-zinc-200 border border-zinc-700/50 shadow-[0_0_15px_rgba(255,255,255,0.08)]",
  },
];

export default function Navbar({ platform, setPlatform, bypassGlobal, setBypassGlobal, onOpenCookies }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-zinc-950/40 border-b border-white/5 px-3 py-2.5 sm:px-6 sm:py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">

        {/* Brand/Logo */}
        <div className="flex items-center gap-2 cursor-pointer group shrink-0">
          <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden border border-zinc-800 shadow-lg group-hover:border-violet-500/50 transition-colors duration-300">
            <Image
              src="/logo.png"
              alt="Anivora Logo"
              fill
              sizes="32px"
              className="object-cover"
            />
          </div>
          <span className="hidden xs:block text-sm sm:text-base font-black tracking-wider bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent group-hover:from-violet-300 group-hover:to-white transition-all duration-300">
            ANIVORA
          </span>
        </div>

        {/* Action Group */}
        <div className="flex items-center gap-2">
          {/* Platform Selector Buttons */}
          <div className="flex items-center gap-1 bg-zinc-950/80 p-0.5 rounded-xl border border-white/5">
            {platforms.map(({ id, label, icon: Icon, activeClass }) => (
              <motion.button
                key={id}
                onClick={() => setPlatform(id)}
                whileTap={{ scale: 0.94 }}
                className={`relative flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 cursor-pointer ${
                  platform === id
                    ? activeClass
                    : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {/* Label: hidden on very small screens, visible on sm+ */}
                <span className="hidden sm:inline">{label}</span>
                {/* Short label for xs screens */}
                <span className="inline sm:hidden">
                  {id === "youtube" ? "YT" : id === "wetv" ? "TV" : id === "instagram" ? "IG" : id === "bilibili" ? "BB" : "X"}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Bypass Global Toggle */}
          <motion.button
            onClick={() => setBypassGlobal(!bypassGlobal)}
            whileTap={{ scale: 0.95 }}
            className={`relative flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 border cursor-pointer ${
              bypassGlobal
                ? "bg-emerald-600/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.08)]"
                : "bg-zinc-950/80 text-zinc-500 border-white/5 hover:text-zinc-300 hover:border-zinc-800"
            }`}
            title="Bypass Global Play restrictions (Spoofs location via TH/SG proxy headers)"
          >
            <Globe className={`w-3.5 h-3.5 shrink-0 ${bypassGlobal ? "animate-pulse text-emerald-400" : "text-zinc-500"}`} />
            <span className="hidden xs:inline">Bypass Global</span>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${bypassGlobal ? "bg-emerald-400 shadow-[0_0_8px_#10b981]" : "bg-zinc-600"}`} />
          </motion.button>

          {/* Cookies Settings Button */}
          <motion.button
            onClick={onOpenCookies}
            whileTap={{ scale: 0.95 }}
            className="relative flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 border bg-zinc-950/80 text-zinc-500 border-white/5 hover:text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/60 cursor-pointer"
            title="Manage cookies.txt to authenticate and download VIP content"
          >
            <Key className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
            <span className="hidden xs:inline">VIP Cookies</span>
          </motion.button>
        </div>

      </div>
    </nav>
  );
}
