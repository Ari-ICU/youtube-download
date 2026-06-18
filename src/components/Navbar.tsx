"use client";

import { motion } from "framer-motion";
import { Play, Tv } from "lucide-react";
import Image from "next/image";

interface NavbarProps {
  platform: "youtube" | "wetv";
  setPlatform: (platform: "youtube" | "wetv") => void;
}

export default function Navbar({ platform, setPlatform }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-zinc-950/40 border-b border-white/5 px-4 py-3 sm:px-6">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        
        {/* Brand/Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer group">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-zinc-800 shadow-lg group-hover:border-violet-500/50 transition-colors duration-300">
            <Image
              src="/logo.png"
              alt="VibeTube Logo"
              fill
              sizes="32px"
              className="object-cover"
            />
          </div>
          <span className="text-sm sm:text-base font-black tracking-wider bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent group-hover:from-violet-300 group-hover:to-white transition-all duration-300">
            VIBETUBE
          </span>
        </div>

        {/* Platform Selector Buttons */}
        <div className="flex items-center gap-1.5 bg-zinc-950/80 p-0.5 rounded-xl border border-white/5">
          {/* YouTube button */}
          <button
            onClick={() => setPlatform("youtube")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 cursor-pointer ${
              platform === "youtube"
                ? "bg-red-600/20 text-red-400 border border-red-500/20 shadow-[0_0_15px_rgba(220,38,38,0.15)]"
                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
            }`}
          >
            <Play className="w-3.5 h-3.5 shrink-0" />
            <span>YouTube</span>
          </button>

          {/* WeTV button */}
          <button
            onClick={() => setPlatform("wetv")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 cursor-pointer ${
              platform === "wetv"
                ? "bg-violet-600/20 text-violet-400 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
            }`}
          >
            <Tv className="w-3.5 h-3.5 shrink-0" />
            <span>WeTV</span>
          </button>
        </div>

      </div>
    </nav>
  );
}
