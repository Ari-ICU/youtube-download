import { Search, Clipboard, ArrowRight, Loader2 } from "lucide-react";

interface UrlInputProps {
  /** Current value of the input field */
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  isLoading: boolean;
  submitLabel?: string;
  loadingLabel?: string;
}

/**
 * Reusable URL input bar with clipboard paste button and animated submit CTA.
 * Used by both SingleDownloader and PlaylistDownloader.
 */
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
      className="w-full glass-panel rounded-2xl p-2.5 flex items-center shadow-lg border border-white/5"
    >
      {/* Input */}
      <div className="flex-1 flex items-center gap-3 px-3">
        <Search className="w-5 h-5 text-zinc-500 shrink-0" />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-0 outline-none text-zinc-100 text-sm placeholder-zinc-500"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePaste}
          title="Paste from clipboard"
          className="px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all cursor-pointer"
        >
          <Clipboard className="w-4 h-4" />
        </button>

        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900 disabled:opacity-50 text-white font-bold text-xs md:text-sm px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {loadingLabel}
            </>
          ) : (
            <>
              {submitLabel}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
