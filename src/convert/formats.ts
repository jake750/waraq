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

/** Every file extension Waraq can open or convert (one list for the file picker and the type check). */
export const OPENABLE_EXTS = Object.keys(EXT);

export function fmtOf(name: string): Fmt | null {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? (EXT[m[1].toLowerCase()] ?? null) : null;
}

const MIME: Record<string, Fmt> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/epub+zip": "epub",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Android names can lack an extension ("report" from Drive/WhatsApp): add one from the MIME type. */
export function nameWithType(name: string, mime: string | null | undefined): string {
  if (fmtOf(name)) return name;
  const f = mime ? MIME[mime.split(";")[0].trim().toLowerCase()] : undefined;
  return f ? `${name}.${f}` : name;
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => {
  let s = "";
  for (let i = from; i < Math.min(to, b.length); i++) s += String.fromCharCode(b[i]);
  return s;
};

const hasBytes = (b: Uint8Array, text: string, from: number, to: number) => {
  const sig = Array.from(text, (c) => c.charCodeAt(0));
  const end = Math.min(to, b.length) - sig.length;
  for (let i = Math.max(0, from); i <= end; i++) if (b[i] === sig[0] && startsWith(b, sig, i)) return true;
  return false;
};

/** The format from the file's own bytes, for names that say nothing (no or unknown extension). */
export function sniffFmt(b: Uint8Array): Fmt | null {
  if (ascii(b, 0, 1024).includes("%PDF-")) return "pdf";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpg";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "doc";
  if (ascii(b, 0, 5) === "{\\rtf") return "rtf";
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    // ODT/EPUB store "mimetype" first; DOCX names its parts in plain text in the zip headers.
    const head = ascii(b, 30, 100);
    if (head.startsWith("mimetypeapplication/vnd.oasis.opendocument.text")) return "odt";
    if (head.startsWith("mimetypeapplication/epub+zip")) return "epub";
    // The part is named in its local header (near the start) and in the central directory (at the end):
    // look only there, never at the whole file.
    const WIN = 64 * 1024;
    return hasBytes(b, "word/document.xml", 0, WIN) || hasBytes(b, "word/document.xml", b.length - WIN, b.length) ? "docx" : null;
  }
  return null;
}

const BOTH: Record<Fmt, Target[]> = {
  docx: ["pdf", "txt", "md", "html"],
  doc: ["pdf", "txt", "md", "html"], // built-in reader (docText.ts): text and tables, no images
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
  doc: ["docx"],
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
  if (OFFICE.includes(f) && platform === "desktop" && loAvailable && (t === "pdf" || t === "docx")) return "libreoffice";
  if (OFFICE.includes(f) && t === "docx") return "libreoffice"; // DOC/ODT/RTF → DOCX is PC-only and needs it
  if (f === "doc" && platform === "desktop" && loAvailable) return "libreoffice"; // better than text-only
  return "html";
}

/** The MIME type of each output, for opening and sharing it. */
export const TARGET_MIME: Record<Target, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  png: "image/png",
  jpg: "image/jpeg",
};
