"use client";

import { Video, List } from "lucide-react";
import type { ActiveTab, Platform } from "@/types";
import { PLATFORM_CONFIGS } from "@/utils/platforms";

interface TabsProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  platform: Platform;
}

export default function Tabs({ activeTab, setActiveTab, platform }: TabsProps) {
  const cfg = PLATFORM_CONFIGS[platform];

  const tabs: {
    id: ActiveTab;
    label: string;
    shortLabel: string;
    Icon: React.ElementType;
  }[] = [
    {
      id: "single",
      label: cfg.singleTabLabel,
      shortLabel: cfg.singleTabShort,
      Icon: Video,
    },
    {
      id: "playlist",
      label: cfg.playlistTabLabel,
      shortLabel: cfg.playlistTabShort,
      Icon: List,
    },
  ];

  return (
    <div className="flex justify-center mb-6 sm:mb-7 px-1">
      <div className="flex w-full max-w-xs sm:max-w-md bg-zinc-900/70 border border-white/[0.07] p-1 rounded-2xl backdrop-blur-xl shadow-lg">
        {tabs.map(({ id, label, shortLabel, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
                isActive
                  ? cfg.activeTabClass
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
              }`}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
