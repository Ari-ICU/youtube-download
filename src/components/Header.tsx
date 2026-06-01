import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

/**
 * App header — animated brand title and sub-badge.
 * Pure presentational; no props required.
 */
export default function Header() {
  return (
    <header className="text-center mb-10 flex flex-col items-center">
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.8 }}
        className="text-4xl md:text-6xl font-black bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent tracking-tight text-glow mb-4"
      >
        VIBETUBE
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="text-zinc-400 text-sm md:text-base max-w-md"
      >
        High-speed YouTube video and playlist downloader.
        Choose a format and save directly to your device.
      </motion.p>
    </header>
  );
}
