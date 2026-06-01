"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
}

interface DropdownProps<T extends string = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

export default function Dropdown<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  className = "",
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "w-full flex items-center justify-between gap-2",
          "bg-zinc-950/60 border rounded-xl px-3.5 py-2.5",
          "text-xs text-zinc-200 text-left",
          "transition-all outline-none",
          open
            ? "border-brand-purple/60 ring-1 ring-brand-purple/20"
            : "border-white/10 hover:border-white/20",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected?.icon && (
            <span className="shrink-0">{selected.icon}</span>
          )}
          <span className="truncate font-medium">{selected?.label}</span>
          {selected?.badge && (
            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-purple/20 text-brand-purple border border-brand-purple/30">
              {selected.badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Menu */}
      {open && (
        <div
          role="listbox"
          className={[
            "absolute z-50 left-0 right-0 mt-1.5",
            "bg-zinc-900/95 backdrop-blur-xl",
            "border border-white/10 rounded-xl shadow-2xl shadow-black/60",
            "overflow-hidden",
            "animate-in fade-in slide-in-from-top-1 duration-150",
          ].join(" ")}
        >
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                role="option"
                aria-selected={isActive}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={[
                  "w-full flex items-center gap-3 px-3.5 py-2.5 text-left",
                  "transition-colors cursor-pointer",
                  isActive
                    ? "bg-brand-purple/15 text-zinc-100"
                    : "text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100",
                ].join(" ")}
              >
                {opt.icon && (
                  <span className="shrink-0 text-zinc-400">{opt.icon}</span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-semibold truncate">
                      {opt.label}
                    </span>
                    {opt.badge && (
                      <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-purple/20 text-brand-purple border border-brand-purple/30">
                        {opt.badge}
                      </span>
                    )}
                  </span>
                  {opt.description && (
                    <span className="block text-[10px] text-zinc-500 mt-0.5 truncate">
                      {opt.description}
                    </span>
                  )}
                </span>
                {isActive && (
                  <Check className="w-3.5 h-3.5 text-brand-purple shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
