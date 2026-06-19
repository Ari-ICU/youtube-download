"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface HeaderProps {
  platform: "youtube" | "wetv" | "instagram" | "bilibili" | "x";
}

export default function Header({ platform }: HeaderProps) {
  return (
    <header className="text-center mb-8 sm:mb-10 flex flex-col items-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mb-3 sm:mb-4 rounded-full overflow-hidden border border-zinc-800 shadow-2xl shadow-indigo-500/20"
      >
        <Image
          src="/logo.png"
          alt="Anivora Logo"
          fill
          priority
          sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, 96px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent pointer-events-none" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="text-3xl sm:text-4xl md:text-6xl font-black bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent tracking-tight text-glow mb-3"
      >
        ANIVORA
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="text-zinc-400 text-xs sm:text-sm md:text-base max-w-xs sm:max-w-md px-2 text-center"
      >
        {platform === "youtube"
          ? "High-speed YouTube video and playlist downloader. Choose a format and save directly to your device."
          : platform === "wetv"
          ? "Download high-quality WeTV dramas, anime, and shows instantly."
          : platform === "bilibili"
          ? "Download free Bilibili TV anime and videos instantly — no Premium account needed."
          : platform === "x"
          ? "Download high-quality X (Twitter) videos and profile media feeds instantly."
          : "Download high-quality Instagram reels, videos, and posts instantly."}
      </motion.p>
    </header>
  );
}
