"use client";

import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";

import Navbar from "@/components/Navbar";
import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import Footer from "@/components/Footer";
import SingleDownloader from "@/components/SingleDownloader";
import PlaylistDownloader from "@/components/PlaylistDownloader";
import type { ActiveTab, Platform } from "@/types";

const emptySubscribe = () => () => {};

export default function Home() {
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [platform, setPlatformState] = useState<Platform>("youtube");
  const [activeTab, setActiveTabState] = useState<ActiveTab>("single");

  // Read saved values once hydrated without cascading effect setState
  const effectivePlatform: Platform = isHydrated
    ? (() => {
        const saved = localStorage.getItem("anivora-platform") as Platform | null;
        if (
          saved === "youtube" ||
          saved === "wetv" ||
          saved === "instagram" ||
          saved === "bilibili" ||
          saved === "x"
        ) {
          return platform !== "youtube" ? platform : saved;
        }
        return platform;
      })()
    : platform;

  const effectiveTab: ActiveTab = isHydrated
    ? (() => {
        const saved = localStorage.getItem("anivora-active-tab") as ActiveTab | null;
        if (saved === "single" || saved === "playlist") {
          return activeTab !== "single" ? activeTab : saved;
        }
        return activeTab;
      })()
    : activeTab;

  const setPlatform = (p: Platform) => {
    localStorage.setItem("anivora-platform", p);
    setPlatformState(p);
  };

  const setActiveTab = (tab: ActiveTab) => {
    localStorage.setItem("anivora-active-tab", tab);
    setActiveTabState(tab);
  };

  return (
    <div className="relative min-h-screen bg-[#050508] overflow-x-clip flex flex-col items-center">
      <Navbar platform={effectivePlatform} setPlatform={setPlatform} />

      {/* Structured SEO */}
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
              "High-speed public video and playlist downloader supporting YouTube, WeTV, Instagram, Bilibili TV, and X.",
            applicationCategory: "MultimediaApplication",
            operatingSystem: "All",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />

      {/* Ambient background glows */}
      <div
        className="bg-blob z-0"
        style={{ top: "-10%", left: "-10%", width: "50%", height: "50%" }}
      />
      <div
        className="bg-blob z-0"
        style={{
          bottom: "-15%",
          right: "-10%",
          width: "60%",
          height: "60%",
          animationDelay: "1.5s",
        }}
      />

      {/* Main container */}
      <div className="w-full max-w-5xl z-10 flex flex-col flex-1 justify-between py-6 sm:py-10 px-4 sm:px-6 md:px-8">
        <Header platform={effectivePlatform} />

        <Tabs activeTab={effectiveTab} setActiveTab={setActiveTab} platform={effectivePlatform} />

        <main className="flex-1 w-full">
          <AnimatePresence mode="wait">
            {effectiveTab === "single" ? (
              <motion.div
                key={`single-${effectivePlatform}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="w-full"
              >
                <SingleDownloader
                  platform={effectivePlatform}
                  onPlatformChange={(p) => setPlatform(p)}
                />
              </motion.div>
            ) : (
              <motion.div
                key={`playlist-${effectivePlatform}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="w-full"
              >
                <PlaylistDownloader
                  platform={effectivePlatform}
                  onPlatformChange={(p) => setPlatform(p)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Footer />
      </div>
    </div>
  );
}
