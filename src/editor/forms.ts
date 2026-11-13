// Fillable forms (AcroForm): list the fields, fill them, optionally flatten.
// Text and choice appearances are drawn with the editor fonts and the same bidi layout as text
// boxes, so Arabic and mixed Arabic/Latin values look right in every reader (pdf-lib's own
// appearances use one WinAnsi or one fontkit font and break both).

import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFTextField,
  type PDFField,
  type PDFWidgetAnnotation,
} from "pdf-lib";
import { loadPdf } from "../tools/pages";
import { paragraphRtl } from "./bidi";
import { embedFonts, lineLayout, wrap, type EditorFonts, type Fonts } from "./write";

export type FieldKind = "text" | "check" | "radio" | "dropdown" | "list";
export type FieldValue = string | boolean | string[];
export type Field = {
  name: string;
  kind: FieldKind;
  value: FieldValue;
  options?: string[];
  page: number;
  /** First widget, PDF user space, bottom-left x,y. */
  rect: { x: number; y: number; w: number; h: number };
  readOnly: boolean;
  multiline?: boolean;
  /** Text fields: the most characters the field accepts (/MaxLen). */
  maxLength?: number;
};

function kindOf(f: PDFField): FieldKind | null {
  if (f instanceof PDFTextField) return "text";
  if (f instanceof PDFCheckBox) return "check";
  if (f instanceof PDFRadioGroup) return "radio";
  if (f instanceof PDFDropdown) return "dropdown";
  if (f instanceof PDFOptionList) return "list";
  return null; // buttons, signatures
}

function valueOf(f: PDFField): FieldValue {
  if (f instanceof PDFTextField) return f.getText() ?? "";
  if (f instanceof PDFCheckBox) return f.isChecked();
  if (f instanceof PDFRadioGroup) return f.getSelected() ?? "";
  if (f instanceof PDFDropdown) return f.getSelected()[0] ?? "";
  if (f instanceof PDFOptionList) return f.getSelected();
  return "";
}

function pageIndex(pdf: PDFDocument): (w: PDFWidgetAnnotation, ref?: PDFRef) => number {
  const pages = pdf.getPages();
  const byRef = new Map<string, number>();
  pages.forEach((p, i) => byRef.set(p.ref.toString(), i));
  const byAnnot = new Map<string, number>();
  pages.forEach((p, i) => p.node.Annots()?.asArray().forEach((r) => byAnnot.set(r.toString(), i)));
  return (w, ref) => {
    const p = w.P();
    if (p && byRef.has(p.toString())) return byRef.get(p.toString())!;
    if (ref && byAnnot.has(ref.toString())) return byAnnot.get(ref.toString())!;
    return 0;
  };
}

function refFinder(pdf: PDFDocument): (w: PDFWidgetAnnotation) => PDFRef | undefined {
  const byDict = new Map<unknown, PDFRef>();
  for (const [r, obj] of pdf.context.enumerateIndirectObjects()) byDict.set(obj, r);
  return (w) => byDict.get(w.dict);
}

export async function listFields(bytes: Uint8Array): Promise<Field[]> {
  const pdf = await loadPdf(bytes.slice());
  if (!pdf.catalog.has(PDFName.of("AcroForm"))) return [];
  const where = pageIndex(pdf);
  const refOf = refFinder(pdf);
  const out: Field[] = [];
  for (const f of pdf.getForm().getFields()) {
    const kind = kindOf(f);
    if (!kind) continue;
    const w = f.acroField.getWidgets()[0];
    if (!w) continue;
    const ref = refOf(w);
    const r = w.getRectangle();
    const field: Field = {
      name: f.getName(),
      kind,
      value: valueOf(f),
      page: where(w, ref),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      readOnly: f.isReadOnly(),
    };
    if (f instanceof PDFRadioGroup || f instanceof PDFDropdown || f instanceof PDFOptionList) field.options = f.getOptions();
    if (f instanceof PDFTextField) {
      field.multiline = f.isMultiline();
      const max = f.getMaxLength();
      if (max !== undefined) field.maxLength = max;
    }
    out.push(field);
  }
  return out;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

/** A /Tx appearance stream for `text` inside a w×h widget. */
function textAppearance(pdf: PDFDocument, fonts: Fonts, text: string, w: number, h: number, o: { multiline: boolean; align: 0 | 1 | 2; size: number }): PDFRef {
  const pad = 2;
  const inner = w - pad * 2;
  // A DA size of 0 means "auto"; some writers (pdf-lib among them) store a size fitted to the
  // widget height, which is far too big for wrapped text, so cap it to what fits.
  const fit = o.multiline ? 16 : Math.max(6, h * 0.7);
  const size = Math.min(o.size || (o.multiline ? 11 : Math.min(12, h * 0.62)), fit);
  const lh = size * 1.3;
  const keys = new Map([
    [fonts.arabic, "FAr"],
    [fonts.latin, "FLa"],
  ]);
  const ops: string[] = [];
  const paras = o.multiline ? text.split("\n") : [text.replace(/\n/g, " ")];
  let row = 0;
  for (const para of paras) {
    const rtl = paragraphRtl(para);
    const lines = o.multiline ? wrap(para, inner, size, fonts, rtl) : [para];
    for (const line of lines) {
      const { ps, widths, width } = lineLayout(line, rtl, size, fonts);
      const start = o.align === 1 ? (inner - width) / 2 : o.align === 2 || (o.align === 0 && rtl) ? inner - width : 0;
      let x = pad + (o.multiline ? Math.max(0, start) : start);
      const y = o.multiline ? h - pad - size - row * lh : (h - size) / 2 + size * 0.22;
      ps.forEach((p, i) => {
        ops.push(`/${keys.get(p.font)} ${fmt(size)} Tf 1 0 0 1 ${fmt(x)} ${fmt(y)} Tm ${p.font.encodeText(p.text).toString()} Tj`);
        x += widths[i];
      });
      row++;
    }
  }
  const content = `/Tx BMC q ${pad} ${pad} ${fmt(w - pad * 2)} ${fmt(h - pad * 2)} re W n BT 0 g ${ops.join(" ")} ET Q EMC`;
  const stream = pdf.context.stream(content, {
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, w, h],
    Resources: { Font: { FAr: fonts.arabic.ref, FLa: fonts.latin.ref } },
  });
  return pdf.context.register(stream);
}

function daSize(f: PDFTextField | PDFDropdown): number {
  const m = /(\d+(?:\.\d+)?)\s+Tf/.exec(f.acroField.getDefaultAppearance() ?? "");
  return m ? Number(m[1]) : 0;
}

function drawAppearance(pdf: PDFDocument, fonts: Fonts, f: PDFTextField | PDFDropdown, text: string) {
  const multiline = f instanceof PDFTextField && f.isMultiline();
  const q = f instanceof PDFTextField ? f.acroField.getQuadding() ?? 0 : 0;
  for (const w of f.acroField.getWidgets()) {
    const r = w.getRectangle();
    const ap = textAppearance(pdf, fonts, text, r.width, r.height, { multiline, align: (q as 0 | 1 | 2) ?? 0, size: daSize(f) });
    w.setNormalAppearance(ap);
  }
}

/** True when pdf-lib's flatten can find a normal appearance stream for this widget. */
function hasAppearance(f: PDFField, w: PDFWidgetAnnotation): boolean {
  let ap;
  try {
    ap = w.getNormalAppearance();
  } catch {
    return false;
  }
  if (ap instanceof PDFRef) return true;
  if (!(f instanceof PDFCheckBox || f instanceof PDFRadioGroup)) return false;
  const value = f.acroField.getValue();
  return ap.get(value) instanceof PDFRef || ap.get(PDFName.of("Off")) instanceof PDFRef;
}

/** Fills the named fields; read-only and unknown names are skipped. Returns a new PDF. */
export async function fillFields(
  input: Uint8Array,
  values: Record<string, FieldValue>,
  fonts: EditorFonts,
  opts: { flatten: boolean },
): Promise<Uint8Array> {
  const pdf = await loadPdf(input.slice());
  const form = pdf.getForm();
  let embedded: Fonts | undefined;
  const textFonts = async () => (embedded ??= await embedFonts(pdf, fonts));
  for (const f of form.getFields()) {
    if (!(f.getName() in values) || f.isReadOnly()) continue;
    const v = values[f.getName()];
    if (f instanceof PDFTextField) {
      const max = f.getMaxLength();
      const s = [...String(v ?? "")].slice(0, max ?? Infinity).join("");
      f.setText(s);
      drawAppearance(pdf, await textFonts(), f, s);
    } else if (f instanceof PDFCheckBox) {
      if (v) f.check();
      else f.uncheck();
    } else if (f instanceof PDFRadioGroup) {
      if (typeof v === "string" && f.getOptions().includes(v)) f.select(v);
      else if (!v) f.clear();
    } else if (f instanceof PDFDropdown) {
      const s = String(v ?? "");
      if (s && !f.getOptions().includes(s) && !f.isEditable()) continue;
      if (s) f.select(s);
      else f.clear();
      drawAppearance(pdf, await textFonts(), f, s);
    } else if (f instanceof PDFOptionList) {
      const list = (Array.isArray(v) ? v : [String(v)]).filter((s) => f.getOptions().includes(s));
      if (list.length) f.select(list);
      else f.clear();
    }
  }
  if (opts.flatten) {
    // pdf-lib's flatten throws on a widget with no usable normal appearance, which real-world forms have.
    for (const f of form.getFields())
      for (const w of f.acroField.getWidgets()) {
        if (hasAppearance(f, w)) continue;
        if (f instanceof PDFTextField) drawAppearance(pdf, await textFonts(), f, f.getText() ?? "");
        else if (f instanceof PDFDropdown) drawAppearance(pdf, await textFonts(), f, f.getSelected()[0] ?? "");
        if (!hasAppearance(f, w)) {
          const r = w.getRectangle();
          w.setNormalAppearance(pdf.context.register(pdf.context.formXObject([], { BBox: [0, 0, r.width, r.height] })));
        }
      }
    form.flatten({ updateFieldAppearances: false });
  }
  return pdf.save({ updateFieldAppearances: false });
}
