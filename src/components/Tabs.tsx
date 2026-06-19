"use client";

import { Video, List } from "lucide-react";
import type { ActiveTab } from "@/types";

interface TabsProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  platform: "youtube" | "wetv" | "instagram" | "bilibili";
}

const TABS: { id: ActiveTab; label: string; shortLabel: string; Icon: React.ElementType }[] = [
  { id: "single",   label: "Single Downloader",  shortLabel: "Single",   Icon: Video },
  { id: "playlist", label: "Playlist Extractor",  shortLabel: "Playlist", Icon: List  },
];

export default function Tabs({ activeTab, setActiveTab, platform }: TabsProps) {
  const tabs = TABS.map((tab) => {
    if (platform === "wetv") {
      return {
        ...tab,
        label: tab.id === "single" ? "Episode Downloader" : "Series Extractor",
        shortLabel: tab.id === "single" ? "Episode" : "Series",
      };
    }
    if (platform === "instagram") {
      return {
        ...tab,
        label: tab.id === "single" ? "Single Video/Reel" : "Profile Extractor",
        shortLabel: tab.id === "single" ? "Single" : "Profile",
      };
    }
    if (platform === "bilibili") {
      return {
        ...tab,
        label: tab.id === "single" ? "Video Downloader" : "Series Extractor",
        shortLabel: tab.id === "single" ? "Video" : "Series",
      };
    }
    return tab;
  });

  const getTabActiveClass = () => {
    switch (platform) {
      case "bilibili":
        return "bg-orange-600 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)]";
      case "wetv":
        return "bg-brand-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]";
      case "instagram":
        return "bg-brand-pink text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]";
      default:
        return "bg-brand-purple text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]";
    }
  };

  return (
    <div className="flex justify-center mb-6 sm:mb-8 px-1">
      <div className="flex w-full max-w-xs sm:max-w-md bg-zinc-950/80 border border-white/5 p-1 rounded-2xl backdrop-blur-xl">
        {tabs.map(({ id, label, shortLabel, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 cursor-pointer ${
              activeTab === id
                ? getTabActiveClass()
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
