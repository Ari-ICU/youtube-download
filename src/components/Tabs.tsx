import { Video, List } from "lucide-react";
import type { ActiveTab } from "@/types";

interface TabsProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

const TABS: { id: ActiveTab; label: string; Icon: React.ElementType }[] = [
  { id: "single", label: "Single Downloader", Icon: Video },
  { id: "playlist", label: "Playlist Extractor", Icon: List },
];

/**
 * Tab switcher bar.
 * Receives the active tab and a setter callback — no internal state.
 */
export default function Tabs({ activeTab, setActiveTab }: TabsProps) {
  return (
    <div className="flex justify-center mb-8">
      <div className="flex bg-zinc-950/80 border border-white/5 p-1 rounded-2xl backdrop-blur-xl">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold transition-all duration-300 cursor-pointer ${
              activeTab === id
                ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
