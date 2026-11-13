import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  Circle,
  ClipboardList,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Redo2,
  Signature,
  Square,
  StickyNote,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useT } from "../i18n";
import { openPdf } from "../pdf/openPdf";
import { pageLayout, type PageLayout } from "../text/search";
import { folderOf, suffixName, type DocRef } from "../files/docRef";
import { saveOutput } from "../convert/native";
import { asConvertError } from "../convert/errors";
import type { Saved } from "../convert/queue";
import { Results } from "../tools/ToolsScreen";
import { emptyHistory, historyReduce } from "./history";
import { COLORS, css, newId, type Mark, type Rgb } from "./marks";
import { fitBox } from "./geometry";
import { listFields, fillFields, type Field, type FieldValue } from "./forms";
import { writeMarks } from "./write";
import { editorFonts } from "./fonts";
import EditorPage, { TEXT_TOOLS, type Tool } from "./EditorPage";
import SignaturePad, { type Signature as Sig } from "./SignaturePad";
import FormsPanel from "./FormsPanel";
import "./editor.css";

export type EditSource = { ref: DocRef; name: string; bytes: Uint8Array };
type Props = { src: EditSource; onClose(): void; onToast(msg: string): void };

const GAP = 16;
const STROKES = [1.5, 3, 6];
const SIZES = [11, 14, 20, 28];
const isPhone = () => window.matchMedia?.("(max-width: 719px)").matches ?? false;

/** Image bytes as PNG or JPEG (other formats are redrawn to PNG), with their pixel size. */
async function readImage(file: File): Promise<{ bytes: Uint8Array; fmt: "png" | "jpg"; w: number; h: number }> {
  const raw = new Uint8Array(await file.arrayBuffer());
  const bmp = await createImageBitmap(new Blob([raw]));
  const { width: w, height: h } = bmp;
  const png = raw[0] === 0x89 && raw[1] === 0x50;
  const jpg = raw[0] === 0xff && raw[1] === 0xd8;
  if (png || jpg) {
    bmp.close();
    return { bytes: raw, fmt: png ? "png" : "jpg", w, h };
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("encode"))), "image/png"));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), fmt: "png", w, h };
}

export default function EditorScreen({ src, onClose, onToast }: Props) {
  const t = useT();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [hist, dispatch] = useReducer(historyReduce, emptyHistory);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<Rgb>(COLORS.yellow);
  const [stroke, setStroke] = useState(STROKES[1]);
  const [textSize, setTextSize] = useState(SIZES[1]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [formsOpen, setFormsOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [saveAsk, setSaveAsk] = useState(false);
  const [flatten, setFlatten] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [cleanAt, setCleanAt] = useState<{ marks: Mark[]; values: Record<string, FieldValue> }>({ marks: emptyHistory.present, values: {} });
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const layouts = useRef(new Map<number, Promise<PageLayout>>());
  const fileInput = useRef<HTMLInputElement>(null);
  const marks = hist.present;
  const dirty = marks !== cleanAt.marks || values !== cleanAt.values;

  // Open the document and read its page sizes and form fields.
  useEffect(() => {
    let alive = true;
    let d: PDFDocumentProxy | undefined;
    (async () => {
      d = await openPdf(src.bytes.slice());
      const s: { w: number; h: number }[] = [];
      for (let i = 1; i <= d.numPages; i++) {
        const v = (await d.getPage(i)).getViewport({ scale: 1 });
        s.push({ w: v.width, h: v.height });
      }
      if (!alive) return;
      setDoc(d);
      setSizes(s);
      const f = await listFields(src.bytes).catch(() => []);
      if (!alive) return;
      setFields(f);
      if (f.length && !isPhone()) setFormsOpen(true);
    })().catch((e) => {
      if (alive) {
        onToast(t.convertErrors[asConvertError(e, "bad-input").code]);
        onClose();
      }
    });
    editorFonts().catch(() => {});
    return () => {
      alive = false;
      d?.loadingTask.destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxW = Math.max(1, ...sizes.map((s) => s.w));
  // Fit to width, then the user's zoom on top (small text is easier to mark zoomed in).
  const scale = Math.min(1.6, Math.max(0.3, (width - (isPhone() ? 16 : 48)) / maxW)) * zoom;

  const layout = useCallback(
    (i: number) => {
      if (!doc) return Promise.reject(new Error("no doc"));
      let l = layouts.current.get(i);
      if (!l) layouts.current.set(i, (l = pageLayout(doc, i)));
      return l;
    },
    [doc],
  );

  // The page in the middle of the screen: images and signatures go there.
  const currentPage = () => {
    const el = scroller.current;
    if (!el) return 0;
    const mid = el.scrollTop + el.clientHeight / 2;
    let y = GAP;
    for (let i = 0; i < sizes.length; i++) {
      y += sizes[i].h * scale + GAP;
      if (y > mid) return i;
    }
    return Math.max(0, sizes.length - 1);
  };

  const place = async (img: { bytes: Uint8Array; fmt: "png" | "jpg"; w: number; h: number }, max: [number, number]) => {
    if (!doc) return;
    const i = currentPage();
    const page = await doc.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    const c = vp.convertToPdfPoint(vp.width / 2, vp.height / 2) as [number, number];
    const box = fitBox(img.w * 0.75, img.h * 0.75, max[0], max[1], c);
    const id = newId();
    dispatch({ type: "add", mark: { id, page: i, kind: "image", box, bytes: img.bytes, fmt: img.fmt } });
    setTool("select");
    setSelected(id);
  };

  const pickTool = (k: Tool) => {
    setEditing(null);
    setSelected(null);
    setTool(k);
    // Sensible first colour per kind of tool, until the user picks one.
    if ((TEXT_TOOLS.includes(k) || k === "note") && color === COLORS.black) setColor(COLORS.yellow);
    if ((k === "text" || k === "ink") && color === COLORS.yellow) setColor(k === "text" ? COLORS.black : COLORS.blue);
  };

  const chooseColor = (c: Rgb) => {
    setColor(c);
    const m = marks.find((x) => x.id === selected);
    if (m && "color" in m) dispatch({ type: "update", id: m.id, patch: { color: c } as Partial<Mark> });
  };

  const remove = useCallback(() => {
    if (!selected) return;
    dispatch({ type: "remove", id: selected });
    setSelected(null);
  }, [selected]);

  const leave = () => (dirty ? setLeaveAsk(true) : onClose());

  // Keyboard: undo/redo, delete, escape.
  const keys = useRef({ remove, leave, editing });
  keys.current = { remove, leave, editing };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (e.key === "Delete" || e.key === "Backspace") keys.current.remove();
      else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const fonts = await editorFonts();
      let out = src.bytes;
      const changed = Object.keys(values).length > 0;
      if (changed || (flatten && fields.length)) out = await fillFields(out, values, fonts, { flatten });
      out = await writeMarks(out, marks, fonts, { flatten });
      const s = await saveOutput(out, suffixName(src.name, "edited"), folderOf(src.ref), "application/pdf");
      setSaved(s);
      setCleanAt({ marks, values });
      setSaveAsk(false);
    } catch (e) {
      onToast(t.convertErrors[asConvertError(e, "bad-input").code]);
    } finally {
      setBusy(false);
    }
  };

  const tools: [Tool, ReactNode, string][] = [
    ["select", <MousePointer2 size={18} />, t.edSelect],
    ["highlight", <Highlighter size={18} />, t.edHighlight],
    ["underline", <Underline size={18} />, t.edUnderline],
    ["strike", <Strikethrough size={18} />, t.edStrike],
    ["ink", <Pencil size={18} />, t.edPen],
    ["rect", <Square size={18} />, t.edRect],
    ["ellipse", <Circle size={18} />, t.edEllipse],
    ["line", <Minus size={18} />, t.edLine],
    ["arrow", <MoveUpRight size={18} />, t.edArrow],
    ["text", <Type size={18} />, t.edText],
    ["note", <StickyNote size={18} />, t.edNote],
  ];
  const showStroke = tool === "ink" || ["rect", "ellipse", "line", "arrow"].includes(tool);
  const byPage = useMemo(() => {
    const m = new Map<number, Mark[]>();
    for (const k of marks) m.set(k.page, [...(m.get(k.page) ?? []), k]);
    return m;
  }, [marks]);
  const noMarks: Mark[] = useMemo(() => [], []);
  // What each field shows on the page: the typed answer, or the value it already has.
  const answers = useMemo(() => {
    const m = new Map<number, { name: string; rect: Field["rect"]; text: string }[]>();
    for (const f of fields) {
      // A radio group's options sit in different places; its answer is shown in the panel only.
      if (f.kind === "radio") continue;
      const v = f.name in values ? values[f.name] : f.value;
      const text = f.kind === "check" ? (v ? "✓" : "") : Array.isArray(v) ? v.join(", ") : String(v ?? "");
      m.set(f.page, [...(m.get(f.page) ?? []), { name: f.name, rect: f.rect, text: f.name in values ? text : "" }]);
    }
    return m;
  }, [fields, values]);
  // The panel focuses this field once it has rendered (on a phone it mounts only now).
  const [focusField, setFocusField] = useState<{ name: string } | null>(null);
  const openField = (name: string) => {
    setFormsOpen(true);
    setFocusField({ name });
  };

  return (
    <div className="editor">
      <header className="reader-bar ed-bar">
        <button className="icon-btn" onClick={leave} title={t.close} aria-label={t.close}>
          <X size={20} />
        </button>
        <div className="ed-title" dir="auto">
          {src.name}
        </div>
        <div className="ed-bar-end">
          <button className="icon-btn" onClick={() => setZoom((z) => Math.max(1, +(z / 1.25).toFixed(3)))} disabled={zoom <= 1} title={t.zoomOut} aria-label={t.zoomOut}>
            <ZoomOut size={18} />
          </button>
          <button className="icon-btn" onClick={() => setZoom((z) => Math.min(4, +(z * 1.25).toFixed(3)))} disabled={zoom >= 4} title={t.zoomIn} aria-label={t.zoomIn}>
            <ZoomIn size={18} />
          </button>
          <button className="icon-btn" onClick={() => dispatch({ type: "undo" })} disabled={!hist.past.length} title={t.edUndo} aria-label={t.edUndo}>
            <Undo2 size={18} className="flip-rtl" />
          </button>
          <button className="icon-btn" onClick={() => dispatch({ type: "redo" })} disabled={!hist.future.length} title={t.edRedo} aria-label={t.edRedo}>
            <Redo2 size={18} className="flip-rtl" />
          </button>
          {fields.length > 0 && (
            <button className="icon-btn" aria-pressed={formsOpen} onClick={() => setFormsOpen(!formsOpen)} title={t.edForms} aria-label={t.edForms}>
              <ClipboardList size={18} />
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setSaveAsk(true)} disabled={!dirty || busy}>
            {t.edSave}
          </button>
        </div>
      </header>

      <div className="ed-strip" role="toolbar" aria-label={t.edTools}>
        {/* Grouped by job: select · mark up text · draw · insert. */}
        {[tools.slice(0, 1), tools.slice(1, 4), tools.slice(4, 9), tools.slice(9)].map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <span className="ed-sep" />}
            <div className="ed-group">
              {group.map(([k, icon, label]) => (
                <button key={k} className="icon-btn" aria-pressed={tool === k} onClick={() => pickTool(k)} title={label} aria-label={label}>
                  {icon}
                </button>
              ))}
              {gi === 3 && (
                <>
                  <button className="icon-btn" onClick={() => fileInput.current?.click()} title={t.edImage} aria-label={t.edImage}>
                    <ImagePlus size={18} />
                  </button>
                  <button className="icon-btn" onClick={() => setSigning(true)} title={t.edSign} aria-label={t.edSign}>
                    <Signature size={18} />
                  </button>
                </>
              )}
            </div>
          </Fragment>
        ))}
        <span className="ed-sep" />
        <div className="ed-group" role="radiogroup" aria-label={t.edColor}>
          {Object.entries(COLORS).map(([name, c]) => (
            <button
              key={name}
              role="radio"
              aria-checked={color === c}
              className="ed-swatch"
              style={{ background: css(c) }}
              onClick={() => chooseColor(c)}
              aria-label={t.edColors[name as keyof typeof t.edColors]}
              title={t.edColors[name as keyof typeof t.edColors]}
            />
          ))}
        </div>
        {showStroke && (
          <>
            <span className="ed-sep" />
            <div className="ed-group" role="radiogroup" aria-label={t.edStroke}>
              {STROKES.map((s) => (
                <button key={s} role="radio" aria-checked={stroke === s} className="icon-btn ed-stroke" onClick={() => setStroke(s)} aria-label={`${t.edStroke} ${s}`}>
                  <span style={{ height: Math.max(2, s * 1.2), background: css(color) }} />
                </button>
              ))}
            </div>
          </>
        )}
        {tool === "text" && (
          <>
            <span className="ed-sep" />
            <div className="ed-group" role="radiogroup" aria-label={t.edTextSize}>
              {SIZES.map((s) => (
                <button key={s} role="radio" aria-checked={textSize === s} className="icon-btn ed-size" onClick={() => setTextSize(s)} aria-label={`${t.edTextSize} ${s}`}>
                  <span style={{ fontSize: 9 + SIZES.indexOf(s) * 3 }}>{t.edAa}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {selected && (
          <>
            <span className="ed-sep" />
            <button className="icon-btn danger" onClick={remove} title={t.edDelete} aria-label={t.edDelete}>
              <Trash2 size={18} />
            </button>
          </>
        )}
      </div>

      {saved && (
        <div className="ed-saved">
          <Results saved={[saved]} />
        </div>
      )}
      {TEXT_TOOLS.includes(tool) && <div className="ed-hint">{t.edTextHint}</div>}

      <div className="ed-body">
        <div ref={scroller} className={`ed-pages${tool === "select" ? "" : " drawing"}`}>
          {doc &&
            sizes.map((s, i) => (
              <EditorPage
                key={i}
                doc={doc}
                index={i}
                size={s}
                scale={scale}
                marks={byPage.get(i) ?? noMarks}
                tool={tool}
                color={color}
                stroke={stroke}
                textSize={textSize}
                selected={selected}
                editing={editing}
                layout={layout}
                onAdd={(m) => dispatch({ type: "add", mark: m })}
                onUpdate={(id, patch) => dispatch({ type: "update", id, patch })}
                onRemove={(id) => dispatch({ type: "remove", id })}
                onSelect={setSelected}
                onEdit={setEditing}
                answers={answers.get(i)}
                onField={openField}
              />
            ))}
          {!doc && <div className="ed-loading">{t.preparing}</div>}
        </div>
        {formsOpen && fields.length > 0 && (
          <FormsPanel
            fields={fields}
            values={values}
            focus={focusField}
            onChange={(name, v) => setValues((old) => ({ ...old, [name]: v }))}
            onPage={(page) => {
              const el = scroller.current;
              if (!el) return;
              let y = 0;
              for (let k = 0; k < page; k++) y += sizes[k].h * scale + GAP;
              el.scrollTo({ top: y, behavior: "smooth" });
              if (isPhone()) setFormsOpen(false);
            }}
            onClose={() => setFormsOpen(false)}
          />
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            await place(await readImage(file), [260, 260]);
          } catch {
            onToast(t.convertErrors["bad-input"]);
          }
        }}
      />

      {signing && (
        <SignaturePad
          onCancel={() => setSigning(false)}
          onUse={(s: Sig) => {
            setSigning(false);
            place({ ...s, fmt: "png", w: s.w / 2, h: s.h / 2 }, [180, 70]);
          }}
        />
      )}

      {saveAsk && (
        <>
          <div className="scrim" onClick={() => !busy && setSaveAsk(false)} />
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-title" onKeyDown={(e) => e.key === "Escape" && !busy && setSaveAsk(false)}>
            <h2 id="save-title">{t.edSaveTitle}</h2>
            <p dir="auto">{t.edSaveSub(suffixName(src.name, "edited"))}</p>
            <label className="check">
              <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
              <span>{t.edFlatten}</span>
            </label>
            <p className="ed-muted">{t.edFlattenSub}</p>
            {busy && <p className="dialog-status">{t.preparing}</p>}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setSaveAsk(false)} disabled={busy}>
                {t.cancel}
              </button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {t.edSave}
              </button>
            </div>
          </div>
        </>
      )}

      {leaveAsk && (
        <>
          <div className="scrim" onClick={() => setLeaveAsk(false)} />
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title" onKeyDown={(e) => e.key === "Escape" && setLeaveAsk(false)}>
            <h2 id="leave-title">{t.edLeaveTitle}</h2>
            <p>{t.edLeaveSub}</p>
            <div className="dialog-actions">
              <button className="btn btn-ghost danger" onClick={onClose}>
                {t.edLeave}
              </button>
              <button className="btn btn-primary" onClick={() => setLeaveAsk(false)}>
                {t.edKeep}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
