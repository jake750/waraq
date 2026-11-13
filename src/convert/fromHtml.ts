// Writers that take sanitized HTML: plain text, Markdown, a printable HTML page, and DOCX.
import TurndownService from "turndown";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import { escapeHtml } from "./sanitize";

export type PageOpts = { size: "A4" | "Letter"; landscape: boolean; marginMm: number };
export const DEFAULT_PAGE: PageOpts = { size: "A4", landscape: false, marginMm: 18 };

const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "TABLE", "TR", "BLOCKQUOTE", "PRE", "FIGURE", "HEADER", "FOOTER", "DL", "DT", "DD", "HR"]);

const parse = (body: string) => new DOMParser().parseFromString(`<!doctype html><body>${body}</body>`, "text/html").body;

// ---- Plain text ---------------------------------------------------------------
export function htmlToText(body: string): string {
  let out = "";
  const nl = (n: number) => {
    out = out.replace(/[ \t]+$/, "");
    const have = /\n*$/.exec(out)![0].length;
    if (out && have < n) out += "\n".repeat(n - have);
  };
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out += (node.textContent ?? "").replace(/\s+/g, " ");
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName;
    if (tag === "BR") return void (out += "\n");
    if (tag === "TABLE") {
      nl(2);
      for (const tr of Array.from(el.querySelectorAll("tr"))) {
        out += Array.from(tr.children)
          .map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim())
          .join("\t");
        out += "\n";
      }
      nl(2);
      return;
    }
    if (tag === "LI") {
      nl(1);
      out += el.parentElement?.tagName === "OL" ? `${Array.from(el.parentElement.children).indexOf(el) + 1}. ` : "- ";
    } else if (BLOCK.has(tag)) nl(2);
    el.childNodes.forEach(walk);
    if (tag === "LI") nl(1);
    else if (BLOCK.has(tag)) nl(2);
  };
  parse(body).childNodes.forEach(walk);
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^ +/gm, "").trim() + "\n";
}

// ---- Markdown -------------------------------------------------------------------
export function htmlToMarkdown(body: string): string {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
  td.addRule("table", {
    filter: "table",
    replacement: (_c, node) => {
      const rows = Array.from((node as HTMLElement).querySelectorAll("tr")).map((tr) =>
        Array.from(tr.children).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim()),
      );
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
      return `\n\n${line(rows[0])}\n|${" --- |".repeat(width)}\n${rows.slice(1).map(line).join("\n")}\n\n`;
    },
  });
  td.remove(["img"]); // data: URLs would bloat the Markdown; images aren't kept (ledgered)
  return td.turndown(parse(body)).trim() + "\n";
}

// ---- Printable HTML page ---------------------------------------------------------------
const FONTS = `"Traditional Arabic", "Simplified Arabic", "Noto Naskh Arabic", "Amiri", "Segoe UI", Arial, sans-serif`;

export function htmlDocument(title: string, body: string, opts: PageOpts = DEFAULT_PAGE): string {
  const size = `${opts.size} ${opts.landscape ? "landscape" : "portrait"}`;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${size}; margin: ${opts.marginMm}mm; }
html { font-family: ${FONTS}; font-size: 12pt; line-height: 1.6; color: #111; }
body { margin: 0; unicode-bidi: plaintext; }
h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 14pt; }
h1, h2, h3 { line-height: 1.3; page-break-after: avoid; break-after: avoid; }
p { margin: 0 0 0.7em; text-align: start; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; margin: 0.6em 0; page-break-inside: auto; }
tr { page-break-inside: avoid; }
td, th { border: 1px solid #888; padding: 4px 8px; vertical-align: top; text-align: start; }
pre, code { font-family: Consolas, "Courier New", monospace; white-space: pre-wrap; }
blockquote { margin: 0 1.5em; color: #333; }
</style></head>
<body>${body}</body></html>`;
}

// ---- DOCX ------------------------------------------------------------------------------
const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const firstStrong = (s: string): "rtl" | "ltr" | null => {
  for (const ch of s) {
    if (RTL_RE.test(ch)) return "rtl";
    if (/\p{L}/u.test(ch)) return "ltr";
  }
  return null;
};

type Fmt = { bold?: boolean; italics?: boolean; underline?: { type: "single" } };

function imageSize(bytes: Uint8Array, type: "png" | "jpg" | "gif"): { w: number; h: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (type === "png") return { w: v.getUint32(16), h: v.getUint32(20) };
    if (type === "gif") return { w: v.getUint16(6, true), h: v.getUint16(8, true) };
    for (let i = 2; i < bytes.length - 9; ) {
      if (bytes[i] !== 0xff) return { w: 400, h: 300 };
      const marker = bytes[i + 1];
      const len = v.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { w: v.getUint16(i + 7), h: v.getUint16(i + 5) };
      i += 2 + len;
    }
  } catch {
    /* fall through */
  }
  return { w: 400, h: 300 };
}

function dataImage(src: string): ImageRun | null {
  const m = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(src);
  if (!m) return null;
  const type = (m[1].toLowerCase().startsWith("jp") ? "jpg" : m[1].toLowerCase()) as "png" | "jpg" | "gif";
  const bin = atob(m[2]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const { w, h } = imageSize(data, type);
  const k = Math.min(1, 600 / w);
  return new ImageRun({ type, data, transformation: { width: Math.round(w * k), height: Math.round(h * k) } });
}

function runs(el: Node, fmt: Fmt = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      const text = (n.textContent ?? "").replace(/\s+/g, " ");
      if (text) out.push(new TextRun({ text, ...fmt, rightToLeft: RTL_RE.test(text) }));
      return;
    }
    if (n.nodeType !== 1) return;
    const e = n as Element;
    switch (e.tagName) {
      case "BR":
        out.push(new TextRun({ text: "", break: 1 }));
        break;
      case "B":
      case "STRONG":
        out.push(...runs(e, { ...fmt, bold: true }));
        break;
      case "I":
      case "EM":
        out.push(...runs(e, { ...fmt, italics: true }));
        break;
      case "U":
        out.push(...runs(e, { ...fmt, underline: { type: "single" } }));
        break;
      case "IMG": {
        const img = dataImage(e.getAttribute("src") ?? "");
        if (img) out.push(img);
        break;
      }
      case "A": {
        const href = e.getAttribute("href") ?? "";
        const children = runs(e, fmt).filter((r): r is TextRun => r instanceof TextRun);
        if (/^https?:/i.test(href) && children.length) out.push(new ExternalHyperlink({ link: href, children }));
        else out.push(...children);
        break;
      }
      default:
        out.push(...runs(e, fmt));
    }
  });
  return out;
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function para(el: Element, extra: Record<string, unknown> = {}): Paragraph {
  const rtl = (el.getAttribute("dir") === "rtl" || firstStrong(el.textContent ?? "") === "rtl") && el.getAttribute("dir") !== "ltr";
  return new Paragraph({ ...extra, bidirectional: rtl, alignment: rtl ? AlignmentType.RIGHT : undefined, children: runs(el) });
}

function blocks(root: Element): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const inlineBuf: Node[] = [];
  const flushInline = () => {
    if (!inlineBuf.length) return;
    const wrap = root.ownerDocument.createElement("p");
    inlineBuf.splice(0).forEach((n) => wrap.appendChild(n.cloneNode(true)));
    if ((wrap.textContent ?? "").trim() || wrap.querySelector("img")) out.push(para(wrap));
  };
  root.childNodes.forEach((n) => {
    if (n.nodeType !== 1 || !BLOCK.has((n as Element).tagName)) {
      inlineBuf.push(n);
      return;
    }
    flushInline();
    const el = n as Element;
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) out.push(para(el, { heading: HEADINGS[Number(tag[1]) - 1] }));
    else if (tag === "UL" || tag === "OL") {
      for (const li of Array.from(el.children).filter((c) => c.tagName === "LI")) {
        out.push(para(li, tag === "UL" ? { bullet: { level: 0 } } : { numbering: { reference: "ol", level: 0 } }));
      }
    } else if (tag === "TABLE") {
      const rows = Array.from(el.querySelectorAll("tr"));
      if (!rows.length) return;
      const rtl = firstStrong(el.textContent ?? "") === "rtl";
      out.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          visuallyRightToLeft: rtl,
          rows: rows.map(
            (tr) =>
              new TableRow({
                children: Array.from(tr.children).map((td) => {
                  const inner = blocks(td).filter((b): b is Paragraph => b instanceof Paragraph);
                  return new TableCell({ children: inner.length ? inner : [new Paragraph("")] });
                }),
              }),
          ),
        }),
      );
    } else if (tag === "HR") out.push(new Paragraph({ thematicBreak: true }));
    else if (["P", "LI", "DT", "DD", "PRE", "BLOCKQUOTE"].includes(tag) && !Array.from(el.children).some((c) => BLOCK.has(c.tagName))) {
      if ((el.textContent ?? "").trim() || el.querySelector("img")) out.push(para(el));
    } else out.push(...blocks(el));
  });
  flushInline();
  return out;
}

export async function htmlToDocx(title: string, body: string): Promise<Uint8Array> {
  const children = blocks(parse(body));
  const doc = new Document({
    title,
    numbering: {
      config: [{ reference: "ol", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }],
    },
    styles: { default: { document: { run: { font: { ascii: "Calibri", hAnsi: "Calibri", cs: "Traditional Arabic" }, size: 24 } } } },
    sections: [{ children: children.length ? children : [new Paragraph("")] }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
