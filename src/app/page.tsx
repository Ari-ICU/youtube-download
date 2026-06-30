"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import Navbar from "@/components/Navbar";
import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import Footer from "@/components/Footer";
import SingleDownloader from "@/components/SingleDownloader";
import PlaylistDownloader from "@/components/PlaylistDownloader";
import WeTVDownloader from "@/components/WeTVDownloader";
import InstagramDownloader from "@/components/InstagramDownloader";
import BilibiliDownloader from "@/components/BilibiliDownloader";
import XDownloader from "@/components/XDownloader";
import type { ActiveTab } from "@/types";

export default function Home() {
  // Start with defaults so SSR and client initial render match (no hydration mismatch)
  const [platform, setPlatformState] = useState<"youtube" | "wetv" | "instagram" | "bilibili" | "x">("youtube");
  const [activeTab, setActiveTabState] = useState<ActiveTab>("single");
  const [bypassGlobal, setBypassGlobalState] = useState(false);

  // After mount, restore the last-used tab and bypass global state from localStorage
  useEffect(() => {
    const savedPlatform = localStorage.getItem("anivora-platform");
    if (savedPlatform === "youtube" || savedPlatform === "wetv" || savedPlatform === "instagram" || savedPlatform === "bilibili" || savedPlatform === "x") {
      setPlatformState(savedPlatform);
    }
    const savedTab = localStorage.getItem("anivora-active-tab");
    if (savedTab === "single" || savedTab === "playlist") {
      setActiveTabState(savedTab);
    }
    const savedBypass = localStorage.getItem("anivora-bypass-global");
    if (savedBypass === "true") {
      setBypassGlobalState(true);
    }
  }, []);

  const setPlatform = (p: "youtube" | "wetv" | "instagram" | "bilibili" | "x") => {
    localStorage.setItem("anivora-platform", p);
    setPlatformState(p);
  };

  const setActiveTab = (tab: ActiveTab) => {
    localStorage.setItem("anivora-active-tab", tab);
    setActiveTabState(tab);
  };

  const setBypassGlobal = (val: boolean) => {
    localStorage.setItem("anivora-bypass-global", String(val));
    setBypassGlobalState(val);
  };

  return (
    <div className="relative min-h-screen bg-[#050508] overflow-x-clip flex flex-col items-center">
      <Navbar platform={platform} setPlatform={setPlatform} bypassGlobal={bypassGlobal} setBypassGlobal={setBypassGlobal} />

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Anivora",
            url: "https://anivora.app",
            logo: "https://anivora.app/logo.png",
            description:
              "Download high-quality YouTube and WeTV videos, playlists, and MP3 audio instantly.",
            applicationCategory: "MultimediaApplication",
            operatingSystem: "All",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />

      {/* Background blobs — GPU-promoted, static blur, opacity-only animation */}
      <div className="bg-blob z-0" style={{ top: "-10%", left: "-10%", width: "50%", height: "50%" }} />
      <div className="bg-blob z-0" style={{ bottom: "-15%", right: "-10%", width: "60%", height: "60%", animationDelay: "1.5s" }} />

      {/* Main container — full width on mobile, capped on desktop */}
      <div className="w-full max-w-5xl max-h-full z-10 flex flex-col flex-1 justify-between py-8 sm:py-12 px-4 sm:px-6 md:px-8">
        <Header platform={platform} />
        
        <Tabs activeTab={activeTab} setActiveTab={setActiveTab} platform={platform} />

        <main className="flex-1 w-full">
          <AnimatePresence mode="wait">
            {platform === "youtube" && activeTab === "single" && (
              <motion.div
                key="youtube-single-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <SingleDownloader bypassGlobal={bypassGlobal} />
              </motion.div>
            )}

            {platform === "youtube" && activeTab === "playlist" && (
              <motion.div
                key="youtube-playlist-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <PlaylistDownloader platform="youtube" bypassGlobal={bypassGlobal} />
              </motion.div>
            )}

            {platform === "wetv" && activeTab === "single" && (
              <motion.div
                key="wetv-single-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <WeTVDownloader bypassGlobal={bypassGlobal} />
              </motion.div>
            )}

            {platform === "wetv" && activeTab === "playlist" && (
              <motion.div
                key="wetv-playlist-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <PlaylistDownloader platform="wetv" bypassGlobal={bypassGlobal} />
              </motion.div>
            )}

            {platform === "instagram" && activeTab === "single" && (
              <motion.div
                key="instagram-single-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <InstagramDownloader bypassGlobal={bypassGlobal} />
              </motion.div>
            )}

            {platform === "instagram" && activeTab === "playlist" && (
              <motion.div
                key="instagram-playlist-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <PlaylistDownloader platform="instagram" bypassGlobal={bypassGlobal} />
              </motion.div>
            )}

            {platform === "bilibili" && activeTab === "single" && (
              <motion.div
                key="bilibili-single-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <BilibiliDownloader bypassGlobal={bypassGlobal} />
              </motion.div>
            )}

            {platform === "bilibili" && activeTab === "playlist" && (
              <motion.div
                key="bilibili-playlist-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <PlaylistDownloader platform="bilibili" bypassGlobal={bypassGlobal} />
              </motion.div>
            )}

            {platform === "x" && activeTab === "single" && (
              <motion.div
                key="x-single-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <XDownloader bypassGlobal={bypassGlobal} />
              </motion.div>
            )}

            {platform === "x" && activeTab === "playlist" && (
              <motion.div
                key="x-playlist-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                <PlaylistDownloader platform="x" bypassGlobal={bypassGlobal} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Footer />
      </div>
    </div>
  );
}
