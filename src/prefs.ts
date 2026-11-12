// Small UI preferences kept in localStorage (language, theme).
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

export const loadLang = (): Lang => (read("waraq.lang") === "ar" ? "ar" : "en");
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
