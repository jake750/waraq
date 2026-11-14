// Marks → a new PDF. Highlights, drawings, shapes, notes and images become standard annotations
// with appearance streams (so every reader shows them). Text boxes are drawn into the page as real,
// shaped text (fontkit joins Arabic; pdf-lib writes ToUnicode, so the text stays selectable).
// `flatten` draws the annotation appearances into the page instead (notes stay notes).

import fontkit from "@pdf-lib/fontkit";
import { jpegOrientation, orientMatrix } from "../convert/exif";
import {
  PDFArray,
  PDFDocument,
  PDFHexString,
  PDFName,

  PDFPage,
  PDFRef,
  PDFString,
  degrees,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
} from "pdf-lib";
import { loadPdf } from "../tools/pages";
import { paragraphRtl, visualRuns } from "./bidi";
import { smoothCurve } from "./geometry";
import type { Mark, Pt, Rect, Rgb } from "./marks";

export type EditorFonts = { arabic: Uint8Array; latin: Uint8Array };
export type WriteOpts = { flatten: boolean };

const f = (n: number) => (Math.round(n * 100) / 100).toString();
const col = ([r, g, b]: Rgb) => `${f(r)} ${f(g)} ${f(b)}`;

type Ap = { bbox: [number, number, number, number]; content: string; resources?: Record<string, unknown>; extra?: (r: PDFRef) => void };

function bounds(points: Pt[], pad: number): [number, number, number, number] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}
const rectPts = (r: Rect): Pt[] => [
  [r.x, r.y],
  [r.x + r.w, r.y + r.h],
];

function ellipsePath(x0: number, y0: number, x1: number, y1: number): string {
  const k = 0.5523;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  return [
    `${f(cx + rx)} ${f(cy)} m`,
    `${f(cx + rx)} ${f(cy + ry * k)} ${f(cx + rx * k)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)} c`,
    `${f(cx - rx * k)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ry * k)} ${f(cx - rx)} ${f(cy)} c`,
    `${f(cx - rx)} ${f(cy - ry * k)} ${f(cx - rx * k)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} c`,
    `${f(cx + rx * k)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ry * k)} ${f(cx + rx)} ${f(cy)} c`,
  ].join("\n");
}

function arrowHead(a: Pt, b: Pt, width: number): string {
  const len = Math.max(8, width * 4);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const p = (d: number): Pt => [b[0] - len * Math.cos(ang + d), b[1] - len * Math.sin(ang + d)];
  const [l, r] = [p(0.45), p(-0.45)];
  return `${f(l[0])} ${f(l[1])} m ${f(b[0])} ${f(b[1])} l ${f(r[0])} ${f(r[1])} l S`;
}

/** Appearance and annotation entries for one mark (everything but text boxes). */
function describe(m: Exclude<Mark, { kind: "text" }>): { subtype: string; ap: Ap; entries: Record<string, unknown> } {
  switch (m.kind) {
    case "highlight":
    case "underline":
    case "strike": {
      const quads = m.rects.flatMap((r) => [r.x, r.y + r.h, r.x + r.w, r.y + r.h, r.x, r.y, r.x + r.w, r.y]);
      const bbox = bounds(m.rects.flatMap(rectPts), 1);
      const content =
        m.kind === "highlight"
          ? `/GS0 gs ${col(m.color)} rg ${m.rects.map((r) => `${f(r.x)} ${f(r.y)} ${f(r.w)} ${f(r.h)} re`).join(" ")} f`
          : `${col(m.color)} RG ` +
            m.rects
              .map((r) => {
                const t = Math.max(0.8, r.h * 0.07);
                const y = m.kind === "underline" ? r.y + t : r.y + r.h * 0.48;
                return `${f(t)} w ${f(r.x)} ${f(y)} m ${f(r.x + r.w)} ${f(y)} l S`;
              })
              .join(" ");
      return {
        subtype: { highlight: "Highlight", underline: "Underline", strike: "StrikeOut" }[m.kind],
        ap: { bbox, content, resources: m.kind === "highlight" ? { ExtGState: { GS0: { BM: "Multiply", ca: 1 } } } : undefined },
        entries: { QuadPoints: quads, ...(m.text ? { Contents: PDFHexString.fromText(m.text) } : {}) },
      };
    }
    case "ink": {
      const pts = m.paths.flat();
      const content =
        `${col(m.color)} RG ${f(m.width)} w 1 J 1 j ` +
        m.paths
          .map((p) => {
            // The same smooth curve the editor shows (a single tap stays a round dot).
            const { start, curves } = smoothCurve(p);
            const body = curves.length
              ? curves.map((c) => c.map(([x, y]) => `${f(x)} ${f(y)}`).join(" ") + " c").join(" ")
              : `${f(start[0] + 0.01)} ${f(start[1])} l`;
            return `${f(start[0])} ${f(start[1])} m ${body} S`;
          })
          .join(" ");
      return { subtype: "Ink", ap: { bbox: bounds(pts, m.width), content }, entries: { InkList: m.paths.map((p) => p.flat()), BS: { W: m.width } } };
    }
    case "rect":
    case "ellipse": {
      const [x0, y0, x1, y1] = [Math.min(m.a[0], m.b[0]), Math.min(m.a[1], m.b[1]), Math.max(m.a[0], m.b[0]), Math.max(m.a[1], m.b[1])];
      const path = m.kind === "rect" ? `${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)} re` : ellipsePath(x0, y0, x1, y1);
      return {
        subtype: m.kind === "rect" ? "Square" : "Circle",
        ap: { bbox: [x0 - m.width, y0 - m.width, x1 + m.width, y1 + m.width], content: `${col(m.color)} RG ${f(m.width)} w ${path} S` },
        entries: { BS: { W: m.width } },
      };
    }
    case "line":
    case "arrow": {
      const content =
        `${col(m.color)} RG ${f(m.width)} w 1 J 1 j ${f(m.a[0])} ${f(m.a[1])} m ${f(m.b[0])} ${f(m.b[1])} l S` +
        (m.kind === "arrow" ? " " + arrowHead(m.a, m.b, m.width) : "");
      return {
        subtype: "Line",
        ap: { bbox: bounds([m.a, m.b], Math.max(10, m.width * 5)), content },
        entries: { L: [...m.a, ...m.b], BS: { W: m.width }, LE: [PDFName.of("None"), PDFName.of(m.kind === "arrow" ? "OpenArrow" : "None")] },
      };
    }
    case "note": {
      const [x, y] = m.at;
      const content = `${col(m.color)} rg 0.3 0.3 0.3 RG 0.6 w ${f(x)} ${f(y - 20)} 20 20 re B 0 0 0 RG 1 w ${f(x + 4)} ${f(y - 7)} m ${f(x + 16)} ${f(y - 7)} l ${f(x + 4)} ${f(y - 11)} m ${f(x + 16)} ${f(y - 11)} l ${f(x + 4)} ${f(y - 15)} m ${f(x + 12)} ${f(y - 15)} l S`;
      return {
        subtype: "Text",
        ap: { bbox: [x, y - 20, x + 20, y], content },
        entries: { Contents: PDFHexString.fromText(m.text), Name: PDFName.of("Comment"), Open: false },
      };
    }
    case "image": {
      const { x, y, w, h } = m.box;
      // The box is the photo as seen on screen; a JPEG stored sideways is turned by its EXIF tag.
      const cm = orientMatrix(m.fmt === "jpg" ? jpegOrientation(m.bytes) : 1, x, y, w, h).map(f).join(" ");
      return { subtype: "Stamp", ap: { bbox: [x, y, x + w, y + h], content: `q ${cm} cm /Im0 Do Q` }, entries: {} };
    }
  }
}

/** Wraps the page's existing content in q/Q so our drawing starts from a clean graphics state. */
function isolate(pdf: PDFDocument, page: PDFPage) {
  const ctx = pdf.context;
  const raw = page.node.get(PDFName.of("Contents"));
  if (!raw) return; // an empty page: nothing to wrap
  const resolved = ctx.lookup(raw);
  const arr = resolved instanceof PDFArray ? resolved : ctx.obj([raw]);
  arr.insert(0, ctx.register(ctx.stream("q")));
  arr.push(ctx.register(ctx.stream("Q")));
  page.node.set(PDFName.of("Contents"), arr);
}

export type Fonts = { arabic: PDFFont; latin: PDFFont; hasAr(cp: number): boolean; hasLat(cp: number): boolean };

/** Embeds both editor fonts (subset) into `pdf`. */
export async function embedFonts(pdf: PDFDocument, fonts: EditorFonts): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  const ar = fontkit.create(fonts.arabic as never);
  const lat = fontkit.create(fonts.latin as never);
  return {
    arabic: await pdf.embedFont(fonts.arabic, { subset: true }),
    latin: await pdf.embedFont(fonts.latin, { subset: true }),
    hasAr: (cp) => ar.hasGlyphForCodePoint(cp),
    hasLat: (cp) => lat.hasGlyphForCodePoint(cp),
  };
}

/** One visual run split into pieces drawable with a single font, in visual order. */
function pieces(run: { text: string; rtl: boolean }, fonts: Fonts): { text: string; font: PDFFont }[] {
  const out: { text: string; font: PDFFont }[] = [];
  for (const ch of run.text) {
    const cp = ch.codePointAt(0)!;
    const ar = /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(ch) || (run.rtl && fonts.hasAr(cp)) || !fonts.hasLat(cp);
    const font = ar ? fonts.arabic : fonts.latin;
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += ch;
    else out.push({ text: ch, font });
  }
  return run.rtl ? out.reverse() : out;
}

export function lineLayout(line: string, rtlPara: boolean, size: number, fonts: Fonts) {
  const ps = visualRuns(line, rtlPara ? "rtl" : "ltr").flatMap((r) => pieces(r, fonts));
  const widths = ps.map((p) => p.font.widthOfTextAtSize(p.text, size));
  return { ps, widths, width: widths.reduce((a, b) => a + b, 0) };
}

export function wrap(text: string, width: number, size: number, fonts: Fonts, rtl: boolean): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const word of para.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && lineLayout(next, rtl, size, fonts).width > width) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
  }
  return lines;
}

function drawTextBox(page: PDFPage, m: Extract<Mark, { kind: "text" }>, fonts: Fonts) {
  const r = (page.getRotation().angle * Math.PI) / 180;
  const right: Pt = [Math.cos(r), Math.sin(r)];
  const down: Pt = [Math.sin(r), -Math.cos(r)];
  const at = (lx: number, ly: number): Pt => [m.at[0] + right[0] * lx + down[0] * ly, m.at[1] + right[1] * lx + down[1] * ly];
  const lh = m.size * 1.45;
  let row = 0;
  for (const para of m.text.split("\n")) {
    const rtl = paragraphRtl(para);
    for (const line of wrap(para, m.width, m.size, fonts, rtl)) {
      const { ps, widths, width } = lineLayout(line, rtl, m.size, fonts);
      const start = m.align === "center" ? (m.width - width) / 2 : (m.align === "start") === rtl ? m.width - width : 0;
      let lx = Math.max(0, start);
      const ly = row * lh + m.size;
      ps.forEach((p, i) => {
        const [x, y] = at(lx, ly);
        page.drawText(p.text, { x, y, size: m.size, font: p.font, color: rgb(...m.color), rotate: degrees(page.getRotation().angle) });
        lx += widths[i];
      });
      row++;
    }
  }
}

export async function writeMarks(input: Uint8Array, marks: Mark[], fonts: EditorFonts, opts: WriteOpts): Promise<Uint8Array> {
  const pdf = await loadPdf(input.slice());
  const ctx = pdf.context;
  const pages = pdf.getPages();
  let loaded: Fonts | undefined;
  const textFonts = async (): Promise<Fonts> => (loaded ??= await embedFonts(pdf, fonts));
  const isolated = new Set<number>();
  const prepare = (i: number) => {
    if (!isolated.has(i)) isolate(pdf, pages[i]);
    isolated.add(i);
  };

  for (const m of marks) {
    const page = pages[m.page];
    if (!page) continue;
    if (m.kind === "text") {
      prepare(m.page);
      drawTextBox(page, m, await textFonts());
      continue;
    }
    const { subtype, ap, entries } = describe(m);
    const resources: Record<string, unknown> = { ...(ap.resources ?? {}) };
    if (m.kind === "image") {
      const img = m.fmt === "png" ? await pdf.embedPng(m.bytes) : await pdf.embedJpg(m.bytes);
      resources.XObject = { Im0: img.ref };
    }
    const form = ctx.register(
      ctx.stream(ap.content, { Type: "XObject", Subtype: "Form", BBox: ap.bbox, Resources: ctx.obj(resources as never) }),
    );
    if (opts.flatten && m.kind !== "note") {
      prepare(m.page);
      const name = page.node.newXObject("Fm", form);
      page.pushOperators(pushGraphicsState(), drawObject(name), popGraphicsState());
      continue;
    }
    const annot = ctx.obj({
      Type: "Annot",
      Subtype: subtype,
      Rect: ap.bbox,
      F: 4,
      NM: PDFString.of(m.id),
      M: PDFString.fromDate(new Date()),
      ...("color" in m ? { C: [...m.color] } : {}),
      AP: { N: form },
      ...(entries as object),
    } as never);
    page.node.addAnnot(ctx.register(annot));
  }
  return pdf.save({ useObjectStreams: true });
}

