"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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

interface MenuPos {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

export default function Dropdown<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  className = "",
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  // Only render portal after hydration
  useEffect(() => { setMounted(true); }, []);

  // Calculate menu position from trigger rect
  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const menuHeight = options.length * 56; // approx per item
    const openUp = spaceBelow < menuHeight && r.top > menuHeight;
    setMenuPos({
      top: openUp ? r.top + window.scrollY - menuHeight - 6 : r.bottom + window.scrollY + 6,
      left: r.left + window.scrollX,
      width: r.width,
      openUp,
    });
  }, [options.length]);

  const handleOpen = () => {
    if (disabled) return;
    if (!open) calcPos();
    setOpen((v) => !v);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      // Don't close if clicking inside the trigger or the portal menu
      if (triggerRef.current?.contains(target)) return;
      const menu = document.getElementById("dropdown-portal-menu");
      if (menu?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Close on Escape or scroll
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => { calcPos(); }; // reposition on scroll
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, calcPos]);

  const menu = open && menuPos && mounted ? createPortal(
    <div
      id="dropdown-portal-menu"
      role="listbox"
      style={{
        position: "absolute",
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        zIndex: 9999,
      }}
      className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/80 overflow-hidden"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            role="option"
            aria-selected={isActive}
            type="button"
            onMouseDown={(e) => {
              // Use mousedown so it fires before the outside-click handler
              e.preventDefault();
              onChange(opt.value);
              setOpen(false);
            }}
            className={[
              "w-full flex items-center gap-3 px-3.5 py-2.5 text-left",
              "transition-colors cursor-pointer",
              isActive
                ? "bg-violet-500/15 text-zinc-100"
                : "text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100",
            ].join(" ")}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold">{opt.label}</span>
                {opt.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    {opt.badge}
                  </span>
                )}
              </span>
              {opt.description && (
                <span className="block text-[10px] text-zinc-500 mt-0.5">
                  {opt.description}
                </span>
              )}
            </span>
            {isActive && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
          </button>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "w-full flex items-center justify-between gap-2",
          "bg-zinc-950/60 border rounded-xl px-3.5 py-2.5",
          "text-xs text-zinc-200 text-left transition-all outline-none",
          open
            ? "border-violet-500/60 ring-1 ring-violet-500/20"
            : "border-white/10 hover:border-white/20",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected?.icon && <span className="shrink-0">{selected.icon}</span>}
          <span className="truncate font-medium">{selected?.label}</span>
          {selected?.badge && (
            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
              {selected.badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {menu}
    </div>
  );
}
