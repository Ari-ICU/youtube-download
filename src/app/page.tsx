"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import Footer from "@/components/Footer";
import SingleDownloader from "@/components/SingleDownloader";
import PlaylistDownloader from "@/components/PlaylistDownloader";
import type { ActiveTab } from "@/types";

/**
 * Root page — thin orchestrator that owns only navigation state.
 * All download logic lives inside SingleDownloader / PlaylistDownloader.
 */
export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("single");

  return (
    <div className="relative min-h-screen bg-[#050508] overflow-hidden flex flex-col items-center py-12 px-4 md:px-8">
      {/* Cinematic glowing background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-radial-gradient animate-pulse-glow z-0" />
      <div
        className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] bg-radial-gradient animate-pulse-glow z-0"
        style={{ animationDelay: "1.5s" }}
      />

      {/* Main container */}
      <div className="w-full max-w-4xl z-10 flex flex-col flex-1 justify-between">
        <Header />

        <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />

        <main className="flex-1 w-full">
          <AnimatePresence mode="wait">
            {activeTab === "single" && (
              <motion.div
                key="single-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="w-full flex flex-col items-center"
              >
                <SingleDownloader />
              </motion.div>
            )}

            {activeTab === "playlist" && (
              <motion.div
                key="playlist-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="w-full flex flex-col items-center"
              >
                <PlaylistDownloader />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Footer />
      </div>
    </div>
  );
}
