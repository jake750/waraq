// Old Word (.doc, Word 97–2003) without LibreOffice: reads the main text through the piece table
// ([MS-DOC] FIB → Clx → PlcPcd) and turns paragraphs and tables into HTML. No images or styling.

import CFB from "cfb";
import { ConvertError } from "./errors";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function stream(file: CFB.CFB$Container, name: string): Uint8Array {
  const e = CFB.find(file, name);
  if (!e?.content) throw new ConvertError("bad-input", `no ${name} stream`);
  return e.content instanceof Uint8Array ? e.content : Uint8Array.from(e.content as ArrayLike<number>);
}

/** The document's main text as Word stores it (\r paragraphs, \x07 cells, \x13–\x15 fields). */
export function docRawText(bytes: Uint8Array): string {
  let file: CFB.CFB$Container;
  try {
    file = CFB.read(bytes, { type: "array" });
  } catch (e) {
    throw new ConvertError("bad-input", String(e));
  }
  const wd = stream(file, "WordDocument");
  const w = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  if (w.getUint16(0, true) !== 0xa5ec) throw new ConvertError("bad-input", "not a Word document");
  const flags = w.getUint16(0x0a, true);
  if (flags & 0x0100) throw new ConvertError("protected");
  const table = stream(file, flags & 0x0200 ? "1Table" : "0Table");
  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);

  // FIB: base (32) → csw + fibRgW → cslw + fibRgLw → cbRgFcLcb + fibRgFcLcb.
  const csw = w.getUint16(32, true);
  const lw = 34 + csw * 2 + 2;
  const ccpText = w.getUint32(lw + 3 * 4, true);
  const fcLcb = lw + w.getUint16(lw - 2, true) * 4 + 2;
  const fcClx = w.getUint32(fcLcb + 33 * 8, true);
  const lcbClx = w.getUint32(fcLcb + 33 * 8 + 4, true);

  // Clx: any Prc entries (0x01) come first, then the Pcdt (0x02).
  let p = fcClx;
  while (p < fcClx + lcbClx && table[p] === 0x01) p += 3 + t.getInt16(p + 1, true);
  if (table[p] !== 0x02) throw new ConvertError("bad-input", "no piece table");
  const lcb = t.getUint32(p + 1, true);
  const plc = p + 5;
  const n = (lcb - 4) / 12;

  const cp1252 = new TextDecoder("windows-1252");
  const utf16 = new TextDecoder("utf-16le");
  let out = "";
  for (let i = 0; i < n && out.length < ccpText; i++) {
    const cpStart = t.getUint32(plc + i * 4, true);
    const cpEnd = Math.min(t.getUint32(plc + (i + 1) * 4, true), ccpText);
    if (cpEnd <= cpStart) continue;
    const raw = t.getUint32(plc + (n + 1) * 4 + i * 8 + 2, true);
    const len = cpEnd - cpStart;
    if (raw & 0x40000000) {
      const at = (raw & 0x3fffffff) / 2;
      out += cp1252.decode(wd.subarray(at, at + len));
    } else {
      out += utf16.decode(wd.subarray(raw, raw + len * 2));
    }
  }
  return out;
}

const CELL = "\x07";

/**
 * Word's control characters → paragraphs (field results kept, field codes dropped). A table row comes
 * back as one line with its cells separated by CELL: Word ends each cell with it, then the row too.
 */
export function docParagraphs(raw: string): string[] {
  let text = "";
  const fields: boolean[] = []; // per open field: still in its code part?
  for (const ch of raw) {
    if (ch === "\x13") fields.push(true);
    else if (ch === "\x14") fields.length && (fields[fields.length - 1] = false);
    else if (ch === "\x15") fields.pop();
    else if (fields.some((code) => code)) continue;
    else if (ch === "\r" || ch === "\x0c" || ch === "\x0b") text += "\n";
    else if (ch === CELL) text += text.endsWith(CELL) ? "\n" : CELL;
    else if (ch === "\x1e") text += "-";
    else if (ch === "\t" || ch >= " ") text += ch;
  }
  return text
    .split("\n")
    .map((l) => (l.endsWith(CELL) ? l.slice(0, -1) : l).trim())
    .filter((l) => l.length > 0);
}

export function docToHtml(bytes: Uint8Array): { title: string; body: string } {
  const html: string[] = [];
  let rows: string[] = [];
  const flush = () => {
    if (rows.length) html.push(`<table>${rows.join("")}</table>`);
    rows = [];
  };
  for (const line of docParagraphs(docRawText(bytes))) {
    if (line.includes(CELL)) {
      rows.push(`<tr>${line.split(CELL).map((c) => `<td dir="auto">${esc(c.trim())}</td>`).join("")}</tr>`);
    } else {
      flush();
      html.push(`<p dir="auto">${esc(line)}</p>`);
    }
  }
  flush();
  return { title: "", body: html.join("\n") };
}
