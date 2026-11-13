// What can be converted into what, on which platform, and by which engine (spec §6.1).

export type Fmt = "pdf" | "docx" | "doc" | "odt" | "rtf" | "txt" | "md" | "html" | "epub" | "png" | "jpg" | "webp";
export type Target = "pdf" | "docx" | "txt" | "md" | "html" | "png" | "jpg";
export type Platform = "desktop" | "android";
export type Engine = "libreoffice" | "html" | "pdf" | "images";

const EXT: Record<string, Fmt> = {
  pdf: "pdf",
  docx: "docx",
  doc: "doc",
  odt: "odt",
  rtf: "rtf",
  txt: "txt",
  text: "txt",
  md: "md",
  markdown: "md",
  html: "html",
  htm: "html",
  xhtml: "html",
  epub: "epub",
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  webp: "webp",
};

export function fmtOf(name: string): Fmt | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? (EXT[m[1].toLowerCase()] ?? null) : null;
}

const BOTH: Record<Fmt, Target[]> = {
  docx: ["pdf", "txt", "md", "html"],
  doc: [],
  odt: ["pdf", "txt"],
  rtf: ["pdf", "txt"],
  txt: ["pdf", "docx", "md", "html"],
  md: ["pdf", "docx", "txt", "html"],
  html: ["pdf", "docx", "txt", "md"],
  epub: ["pdf", "txt"],
  pdf: ["docx", "txt", "md", "png", "jpg"],
  png: ["pdf"],
  jpg: ["pdf"],
  webp: ["pdf"],
};

// Needs LibreOffice: only on the PC.
const PC_ONLY: Partial<Record<Fmt, Target[]>> = {
  doc: ["pdf", "docx", "txt"],
  odt: ["docx"],
  rtf: ["docx"],
};

export function targetsFor(f: Fmt, platform: Platform): Target[] {
  return platform === "desktop" ? [...BOTH[f], ...(PC_ONLY[f] ?? [])] : [...BOTH[f]];
}

/** `report.docx` → `report (converted).pdf`, then ` (2)`, ` (3)` … while `taken` says the name exists. */
export function outputName(input: string, target: Target, taken: (name: string) => boolean): string {
  const base = input.replace(/\.[^./\\]+$/, "");
  const first = `${base} (converted).${target}`;
  if (!taken(first)) return first;
  for (let i = 2; ; i++) {
    const n = `${base} (converted) (${i}).${target}`;
    if (!taken(n)) return n;
  }
}

const OFFICE: Fmt[] = ["docx", "doc", "odt", "rtf"];

/** Which engine converts f → t. LibreOffice is used on the PC for Office layout work (PDF/DOCX outputs). */
export function engineFor(f: Fmt, t: Target, platform: Platform, loAvailable: boolean): Engine {
  if (f === "pdf") return "pdf";
  if (f === "png" || f === "jpg" || f === "webp") return "images";
  if (f === "doc") return "libreoffice";
  if (OFFICE.includes(f) && platform === "desktop" && loAvailable && (t === "pdf" || t === "docx")) return "libreoffice";
  if (OFFICE.includes(f) && t === "docx") return "libreoffice"; // ODT/RTF → DOCX is PC-only and needs it
  return "html";
}
