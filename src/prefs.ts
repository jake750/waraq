// Small UI preferences kept in localStorage (language, theme, conversion choices).
import type { Lang } from "./i18n";

export type ThemePref = "light" | "dark" | "system";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage unavailable: the preference is simply not remembered */
  }
}

/** The saved language; on first run, Arabic when the system speaks Arabic. */
export function loadLang(systemLang = typeof navigator !== "undefined" ? navigator.language : ""): Lang {
  const v = read("waraq.lang");
  if (v === "ar" || v === "en") return v;
  return /^ar([-_]|$)/i.test(systemLang) ? "ar" : "en";
}
export const saveLang = (l: Lang) => write("waraq.lang", l);

export function loadTheme(): ThemePref {
  const v = read("waraq.theme");
  return v === "light" || v === "system" ? v : "dark";
}
export const saveTheme = (t: ThemePref) => write("waraq.theme", t);

export function resolveTheme(t: ThemePref): "light" | "dark" {
  if (t !== "system") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Updates: automatic daily check (on by default) and when the last automatic check ran.
export const loadAutoUpdate = (): boolean => read("waraq.autoUpdate") !== "off";
export const saveAutoUpdate = (on: boolean) => write("waraq.autoUpdate", on ? "on" : "off");
export function loadLastUpdateCheck(): number | null {
  const n = Number(read("waraq.lastUpdateCheck"));
  return Number.isFinite(n) && n > 0 ? n : null;
}
export const saveLastUpdateCheck = (t: number) => write("waraq.lastUpdateCheck", String(t));

// Conversion (desktop): "use the built-in engine" instead of LibreOffice, and the chosen output folder.
export const loadOfficeDeclined = (): boolean => read("waraq.officeDeclined") === "yes";
export const saveOfficeDeclined = (v: boolean) => write("waraq.officeDeclined", v ? "yes" : "no");
export const loadSaveFolder = (): string | null => read("waraq.saveFolder") || null;
export const saveSaveFolder = (dir: string | null) => write("waraq.saveFolder", dir ?? "");

// Reader: the view mode and reading direction each document was last read in (newest 50 documents).
export type DocView = { view?: "continuous" | "single" | "spread"; rtl?: boolean };
const DOC_VIEWS = "waraq.docViews";
const DOC_VIEWS_MAX = 50;
function docViews(): [string, DocView][] {
  try {
    const v = JSON.parse(read(DOC_VIEWS) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export const loadDocView = (key: string): DocView => docViews().find(([k]) => k === key)?.[1] ?? {};
export function saveDocView(key: string, v: DocView) {
  const rest = docViews().filter(([k]) => k !== key);
  write(DOC_VIEWS, JSON.stringify([[key, v], ...rest].slice(0, DOC_VIEWS_MAX)));
}
