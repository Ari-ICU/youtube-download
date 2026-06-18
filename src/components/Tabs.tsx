"use client";

import { Video, List, Tv } from "lucide-react";
import type { ActiveTab } from "@/types";

interface TabsProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

const TABS: { id: ActiveTab; label: string; shortLabel: string; Icon: React.ElementType }[] = [
  { id: "single",   label: "Single Downloader",  shortLabel: "Single",   Icon: Video },
  { id: "playlist", label: "Playlist Extractor",  shortLabel: "Playlist", Icon: List  },
  { id: "wetv",     label: "WeTV Downloader",    shortLabel: "WeTV",     Icon: Tv    },
];

export default function Tabs({ activeTab, setActiveTab }: TabsProps) {
  return (
    <div className="flex justify-center mb-6 sm:mb-8 px-1">
      <div className="flex w-full max-w-sm sm:max-w-md bg-zinc-950/80 border border-white/5 p-1 rounded-2xl backdrop-blur-xl">
        {TABS.map(({ id, label, shortLabel, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 cursor-pointer ${
              activeTab === id
                ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            {/* Short label on very small screens, full label on sm+ */}
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
