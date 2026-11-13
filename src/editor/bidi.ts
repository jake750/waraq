// Logical text → runs in visual (left-to-right) order, each run still in logical order so the
// shaper (fontkit) can join Arabic; an rtl run is shaped right-to-left. A small Unicode bidi
// (W1, W7, N1/N2, I1/I2, L2) for one paragraph without embeddings — enough for text boxes.

export type Run = { text: string; rtl: boolean };
type T = "L" | "R" | "EN" | "N";

const ARABIC = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const MARK = /\p{Mn}/u;

function typeOf(c: string): T {
  if (/\p{Nd}/u.test(c)) return "EN"; // Arabic-Indic digits are AN; treated like EN here
  if (ARABIC.test(c) && /\p{L}/u.test(c)) return "R";
  if (/\p{L}/u.test(c)) return "L";
  return "N";
}

export function paragraphRtl(text: string): boolean {
  for (const c of text) {
    const t = typeOf(c);
    if (t === "R") return true;
    if (t === "L") return false;
  }
  return false;
}

export function visualRuns(text: string, dir?: "ltr" | "rtl"): Run[] {
  const chars = [...text];
  if (!chars.length) return [];
  const rtl = dir ? dir === "rtl" : paragraphRtl(text);
  const types: T[] = [];
  // W1: a mark takes the type of the character before it.
  chars.forEach((c, i) => types.push(MARK.test(c) && i > 0 ? types[i - 1] : typeOf(c)));
  // W7: digits after Latin (back to the last strong letter, or the paragraph start) read as Latin.
  let strong: "L" | "R" = rtl ? "R" : "L";
  for (let i = 0; i < types.length; i++) {
    if (types[i] === "L" || types[i] === "R") strong = types[i] as "L" | "R";
    else if (types[i] === "EN" && strong === "L") types[i] = "L";
  }
  // N1/N2: neutrals between two of the same direction (numbers count as R) take it; else the paragraph's.
  const dirAt = (t: T): "L" | "R" => (t === "L" ? "L" : "R");
  const base = rtl ? 1 : 0;
  const levels = types.map((t, i) => {
    if (t === "R") return 1;
    if (t === "L") return rtl ? 2 : 0;
    if (t === "EN") return 2;
    let a: "L" | "R" = rtl ? "R" : "L";
    for (let j = i - 1; j >= 0; j--)
      if (types[j] !== "N") {
        a = dirAt(types[j]);
        break;
      }
    let b: "L" | "R" = rtl ? "R" : "L";
    for (let j = i + 1; j < types.length; j++)
      if (types[j] !== "N") {
        b = dirAt(types[j]);
        break;
      }
    if (a === b) return a === "R" ? 1 : rtl ? 2 : 0;
    return base;
  });
  // Level runs in logical order, then L2: reverse runs of segments at level ≥ k, highest k first.
  let segs: { text: string; level: number }[] = [];
  chars.forEach((c, i) => {
    const last = segs[segs.length - 1];
    if (last && last.level === levels[i]) last.text += c;
    else segs.push({ text: c, level: levels[i] });
  });
  const max = Math.max(...segs.map((s) => s.level));
  for (let k = max; k >= 1; k--) {
    const out: typeof segs = [];
    let i = 0;
    while (i < segs.length) {
      if (segs[i].level < k) {
        out.push(segs[i++]);
        continue;
      }
      let j = i;
      while (j < segs.length && segs[j].level >= k) j++;
      out.push(...segs.slice(i, j).reverse());
      i = j;
    }
    segs = out;
  }
  return segs.map((s) => ({ text: s.text, rtl: s.level % 2 === 1 }));
}
