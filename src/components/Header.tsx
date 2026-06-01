import { motion } from "framer-motion";
import Image from "next/image";

/**
 * App header — animated brand title and logo.
 * Pure presentational; no props required.
 */
export default function Header() {
  return (
    <header className="text-center mb-10 flex flex-col items-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative w-20 h-20 md:w-24 md:h-24 mb-4 rounded-full overflow-hidden border border-zinc-800 shadow-2xl shadow-indigo-500/20"
      >
        <Image
          src="/logo.png"
          alt="VibeTube Logo"
          fill
          priority
          sizes="(max-width: 768px) 80px, 96px"
          className="object-cover"
        />
        {/* Subtle overlay glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent pointer-events-none" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="text-4xl md:text-6xl font-black bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent tracking-tight text-glow mb-4"
      >
        VIBETUBE
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="text-zinc-400 text-sm md:text-base max-w-md"
      >
        High-speed YouTube video and playlist downloader.
        Choose a format and save directly to your device.
      </motion.p>
    </header>
  );
}

