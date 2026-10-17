import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export type Theme = "charcoal" | "violet" | "mono";

export const THEMES: { id: Theme; name: string; note: string; swatch: [string, string, string] }[] = [
  { id: "charcoal", name: "Charcoal + Amber", note: "Neutral dark, warm accents", swatch: ["#121212", "#f59e0b", "#f97316"] },
  { id: "violet", name: "Midnight Violet", note: "Dark banking dashboard", swatch: ["#17171a", "#7c4dff", "#a78bfa"] },
  { id: "mono", name: "Monochrome Editorial", note: "Light, black and white, serif headlines", swatch: ["#e9e9e7", "#111111", "#4b4b4b"] },
];

export const isTheme = (value: string | null): value is Theme => THEMES.some((theme) => theme.id === value);

// A small menu of colour themes, opened from a palette button.
export function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  return (
    <div className="theme-picker" ref={box}>
      <button className="icon-btn" aria-haspopup="true" aria-expanded={open} aria-label="Change colour theme" title="Colour theme" onClick={() => setOpen(!open)}>
        <Icon name="palette" size={16} />
      </button>
      {open && (
        <div className="theme-menu" role="menu" aria-label="Colour themes">
          <p className="kicker">Colour theme</p>
          {THEMES.map((option) => (
            <button key={option.id} role="menuitemradio" aria-checked={theme === option.id} className={theme === option.id ? "on" : ""} onClick={() => { onChange(option.id); setOpen(false); }}>
              <span className="swatch" aria-hidden="true">{option.swatch.map((colour) => <i key={colour} style={{ background: colour }} />)}</span>
              <span><strong>{option.name}</strong><small>{option.note}</small></span>
              {theme === option.id && <Icon name="check" size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
