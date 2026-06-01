"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import Footer from "@/components/Footer";
import SingleDownloader from "@/components/SingleDownloader";
import PlaylistDownloader from "@/components/PlaylistDownloader";
import type { ActiveTab } from "@/types";

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("single");

  return (
    <div className="relative min-h-screen bg-[#050508] overflow-x-hidden flex flex-col items-center py-8 sm:py-12 px-4 sm:px-6 md:px-8">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "VibeTube",
            url: "https://vibetube.app",
            logo: "https://vibetube.app/logo.png",
            description:
              "Download high-quality YouTube videos, playlists, and MP3 audio instantly.",
            applicationCategory: "MultimediaApplication",
            operatingSystem: "All",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />

      {/* Background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-radial-gradient animate-pulse-glow z-0 pointer-events-none" />
      <div
        className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] bg-radial-gradient animate-pulse-glow z-0 pointer-events-none"
        style={{ animationDelay: "1.5s" }}
      />

      {/* Main container — full width on mobile, capped on desktop */}
      <div className="w-full max-w-5xl z-10 flex flex-col flex-1 justify-between">
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
                transition={{ duration: 0.35 }}
                className="w-full"
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
                transition={{ duration: 0.35 }}
                className="w-full"
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
