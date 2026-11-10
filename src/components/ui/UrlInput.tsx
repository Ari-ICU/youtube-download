"use client";

import { useState } from "react";
import { Search, Clipboard, Check, ArrowRight, Loader2, X } from "lucide-react";

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  isLoading: boolean;
  submitLabel?: string;
  loadingLabel?: string;
  buttonClassName?: string;
  focusBorderClassName?: string;
}

export default function UrlInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  isLoading,
  submitLabel = "Analyze",
  loadingLabel = "Analyzing…",
  buttonClassName = "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white",
  focusBorderClassName = "focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/15",
}: UrlInputProps) {
  const [pasted, setPasted] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange(text);
        setPasted(true);
        setTimeout(() => setPasted(false), 1500);
      }
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
      className={`w-full glass-panel rounded-2xl p-2 sm:p-2.5 flex items-center gap-1.5 shadow-xl border border-white/[0.08] transition-all duration-200 ${focusBorderClassName}`}
    >
      {/* Search icon */}
      <div className="hidden xs:flex items-center pl-2.5 shrink-0">
        <Search className="w-4 h-4 text-zinc-500" />
      </div>

      {/* Input */}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Media URL"
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-zinc-100 text-xs sm:text-sm placeholder-zinc-500 px-2 sm:px-2.5 py-1.5"
      />

      {/* Clear button when input has text */}
      {value.length > 0 && !isLoading && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Clear URL"
          aria-label="Clear URL"
          className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Paste button */}
      <button
        type="button"
        onClick={handlePaste}
        title="Paste from clipboard"
        aria-label="Paste from clipboard"
        className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-100 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-all cursor-pointer"
      >
        {pasted ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline text-emerald-400">Pasted</span>
          </>
        ) : (
          <>
            <Clipboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Paste</span>
          </>
        )}
      </button>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || !value.trim()}
        className={`shrink-0 ${buttonClassName} disabled:opacity-45 font-bold text-xs sm:text-sm px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl transition-all shadow-lg flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
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
