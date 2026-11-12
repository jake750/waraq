// Arabic text helpers: loose matching (ignore harakat, tatweel and hamza forms) and direction detection.

const REMOVABLE = /[ً-ٰٟـ]/;
const FOLD: Record<string, string> = {
  "أ": "ا",
  "إ": "ا",
  "آ": "ا",
  "ٱ": "ا",
  "ؤ": "و",
  "ئ": "ي",
  "ى": "ي",
  // Persian/Urdu twins that PDFs often use for Arabic letters
  "ی": "ي",
  "ک": "ك",
  "ھ": "ه",
};

/** Characters dropped by loose matching (harakat, superscript alef, tatweel). */
export const isRemovable = (c: string): boolean => REMOVABLE.test(c);

/** Folds one character for loose matching; returns "" for removable characters. */
export function foldChar(c: string): string {
  return isRemovable(c) ? "" : (FOLD[c] ?? c);
}

export function normalizeArabic(s: string): string {
  let out = "";
  for (const c of s) out += foldChar(c);
  return out;
}

export const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** True when Arabic-script letters are more than half of all letters. */
export function detectRtl(sample: string): boolean {
  let letters = 0;
  let arabic = 0;
  for (const c of sample) {
    if (!/\p{L}/u.test(c)) continue;
    letters++;
    if (ARABIC_SCRIPT.test(c)) arabic++;
  }
  return letters > 0 && arabic / letters > 0.5;
}
