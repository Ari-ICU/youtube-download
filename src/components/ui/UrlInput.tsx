"use client";

import { Search, Clipboard, ArrowRight, Loader2 } from "lucide-react";

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  isLoading: boolean;
  submitLabel?: string;
  loadingLabel?: string;
}

export default function UrlInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  isLoading,
  submitLabel = "Analyze",
  loadingLabel = "Parsing...",
}: UrlInputProps) {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onChange(text);
    } catch {
      // Clipboard access denied — silently ignore
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoading && value.trim()) onSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full glass-panel rounded-2xl p-2 sm:p-2.5 flex items-center gap-1 shadow-lg border border-white/5"
    >
      {/* Search icon — hidden on very small screens to save space */}
      <div className="hidden xs:flex items-center pl-2 shrink-0">
        <Search className="w-4 h-4 text-zinc-500" />
      </div>

      {/* Input */}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-zinc-100 text-xs sm:text-sm placeholder-zinc-500 px-2 sm:px-3 py-1"
      />

      {/* Paste button */}
      <button
        type="button"
        onClick={handlePaste}
        title="Paste from clipboard"
        className="shrink-0 p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all cursor-pointer"
      >
        <Clipboard className="w-4 h-4" />
      </button>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || !value.trim()}
        className="shrink-0 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl transition-all shadow-md flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
            <span className="hidden sm:inline">{loadingLabel}</span>
          </>
        ) : (
          <>
            <span>{submitLabel}</span>
            <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </>
        )}
      </button>
    </form>
  );
}
