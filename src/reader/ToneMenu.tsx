import { useEffect, useRef } from "react";
import { Check, Coffee, Moon, Sun, SunMoon } from "lucide-react";
import { useT } from "../i18n";
import type { PageTone } from "../prefs";
import { ICON } from "../shell/icons";

type Props = {
  tone: PageTone;
  level: 0 | 1 | 2;
  warm: boolean;
  onTone(t: PageTone): void;
  onLevel(l: 0 | 1 | 2): void;
  onWarm(w: boolean): void;
  onClose(): void;
};

/** The page-colour menu under the moon button: day, night, sepia or match the app, and how night looks. */
export default function ToneMenu({ tone, level, warm, onTone, onLevel, onWarm, onClose }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const tones: [PageTone, string, typeof Sun][] = [
    ["day", t.toneDay, Sun],
    ["night", t.night, Moon],
    ["sepia", t.sepia, Coffee],
    ["auto", t.toneAuto, SunMoon],
  ];
  const levels: [0 | 1 | 2, string][] = [
    [0, t.nightDim],
    [1, t.nightNormal],
    [2, t.nightBright],
  ];
  const nightish = tone === "night" || tone === "auto";

  // Focus the chosen tone; Escape or a click outside closes the menu.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Arrow keys move between the tone items.
  const onItemsKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    e.preventDefault();
  };

  return (
    <>
      <div className="tone-scrim" onClick={onClose} />
      <div ref={ref} className="tone-menu" role="menu" aria-label={t.pageTone} onKeyDown={onItemsKey}>
        {tones.map(([v, label, Icon]) => (
          <button key={v} role="menuitemradio" aria-checked={tone === v} className="tone-item" onClick={() => onTone(v)}>
            <Icon size={ICON.md} aria-hidden />
            <span>{label}</span>
            {tone === v && <Check size={ICON.sm} className="tone-check" aria-hidden />}
          </button>
        ))}
        {nightish && (
          <div className="tone-night">
            <span className="field-label" id="tone-level">
              {t.nightText}
            </span>
            <div className="segmented" role="group" aria-labelledby="tone-level">
              {levels.map(([v, label]) => (
                <button key={v} aria-pressed={level === v} onClick={() => onLevel(v)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={warm} onChange={(e) => onWarm(e.target.checked)} />
              <span>{t.nightWarm}</span>
            </label>
          </div>
        )}
      </div>
    </>
  );
}
