import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckSquare,
  ExternalLink,
  FilePen,
  FilePlus2,
  FileStack,
  FolderOpen,
  LayoutGrid,
  Minimize2,
  RotateCcw,
  RotateCw,
  Scissors,
  Share2,
  SquareDashed,
  Trash2,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useT } from "../i18n";
import { isAndroid } from "../platform";
import { folderOf, keepAccess, readDocument, resolveName, suffixName, toDocRef, type DocRef } from "../files/docRef";
import { openPdf } from "../pdf/openPdf";
import { asConvertError } from "../convert/errors";
import { openOutput, revealOutput, saveOutput, shareOutput } from "../convert/native";
import type { Saved } from "../convert/queue";
import { assemble, loadPdf, splitGroups, type PageSpec, type SplitMode } from "./pages";
import { deleteSel, insertAfter, moveSel, rotateSel, type Item } from "./organize";
import { compressPdf, type Reencode } from "./compress";
import PdfThumb from "./PdfThumb";
import "./tools.css";

type Tool = "organize" | "merge" | "split" | "compress";
type Source = { ref: DocRef; name: string; bytes: Uint8Array; doc: PDFDocumentProxy };
type Props = { onToast(msg: string): void; onEdit(ref: DocRef): void };

export async function pickPdfs(multiple: boolean): Promise<DocRef[]> {
  // Browser preview only: ?pick=/fixtures/a.pdf,/fixtures/b.pdf stands in for the file dialog.
  const dev = import.meta.env.DEV ? new URLSearchParams(location.search).get("pick") : null;
  if (dev) return dev.split(",").map((p) => ({ kind: "path", path: `dev:${p}` }));
  const r = await open({ multiple, directory: false, filters: [{ name: "PDF", extensions: ["pdf"] }] }).catch(() => null);
  return keepAccess((Array.isArray(r) ? r : typeof r === "string" ? [r] : []).map(toDocRef));
}

/** Reads and checks a PDF for the tools (protected/corrupt files fail here, before any work). */
async function loadSource(ref: DocRef): Promise<Source> {
  const bytes = await readDocument(ref);
  await loadPdf(bytes);
  const doc = await openPdf(bytes);
  return { ref, name: await resolveName(ref), bytes, doc };
}

const save = (bytes: Uint8Array, name: string, src: Source) => saveOutput(bytes, name, folderOf(src.ref), "application/pdf");

export default function ToolsScreen({ onToast, onEdit }: Props) {
  const t = useT();
  const [tool, setTool] = useState<Tool | null>(null);
  const fail = (e: unknown) => onToast(t.convertErrors[asConvertError(e, "bad-input").code]);
  if (tool) {
    const back = () => setTool(null);
    const body =
      tool === "organize" ? (
        <Organize onToast={onToast} fail={fail} />
      ) : tool === "merge" ? (
        <Merge fail={fail} onToast={onToast} />
      ) : tool === "split" ? (
        <Split fail={fail} onToast={onToast} />
      ) : (
        <Compress fail={fail} onToast={onToast} />
      );
    const title = { organize: t.toolOrganize, merge: t.toolMerge, split: t.toolSplit, compress: t.toolCompress }[tool];
    return (
      <div className="tools">
        <div className="tools-inner">
          <header className="tools-head">
            <button className="icon-btn" onClick={back} aria-label={t.back} title={t.back}>
              <ArrowLeft size={20} className="flip-rtl" />
            </button>
            <h1>{title}</h1>
          </header>
          {body}
        </div>
      </div>
    );
  }
  const cards: [Tool | "edit", string, string, ReactNode][] = [
    ["edit", t.toolEdit, t.toolEditSub, <FilePen size={22} />],
    ["organize", t.toolOrganize, t.toolOrganizeSub, <LayoutGrid size={22} />],
    ["merge", t.toolMerge, t.toolMergeSub, <FileStack size={22} />],
    ["split", t.toolSplit, t.toolSplitSub, <Scissors size={22} />],
    ["compress", t.toolCompress, t.toolCompressSub, <Minimize2 size={22} />],
  ];
  return (
    <div className="tools">
      <div className="tools-inner">
        <header className="convert-head">
          <div>
            <h1>{t.toolsTitle}</h1>
            <p>{t.toolsSub}</p>
          </div>
        </header>
        <div className="tool-cards">
          {cards.map(([id, title, sub, icon], i) => (
            <button
              key={id}
              className="tool-card"
              onClick={async () => {
                if (id !== "edit") return setTool(id);
                const [ref] = await pickPdfs(false);
                if (ref) onEdit(ref);
              }}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="tool-icon">{icon}</span>
              <span className="tool-title">{title}</span>
              <span className="tool-sub">{sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Saved results with open / show in folder (PC) / share (phone). */
export function Results({ saved }: { saved: Saved[] }) {
  const t = useT();
  if (!saved.length) return null;
  const mime = "application/pdf";
  const err = () => {};
  return (
    <div className="tool-results" role="status">
      <span className="tool-results-text">{saved.length === 1 ? t.savedAs(saved[0].name) : t.savedParts(saved.length)}</span>
      <button className="btn btn-ghost btn-sm" onClick={() => openOutput(saved[0], mime).catch(err)}>
        <ExternalLink size={16} />
        {t.openFile}
      </button>
      {isAndroid() ? (
        <button className="icon-btn" aria-label={t.share} title={t.share} onClick={() => shareOutput(saved[0], mime).catch(err)}>
          <Share2 size={17} />
        </button>
      ) : (
        <button className="icon-btn" aria-label={t.showInFolder} title={t.showInFolder} onClick={() => revealOutput(saved[0]).catch(err)}>
          <FolderOpen size={17} />
        </button>
      )}
    </div>
  );
}

function Pick({ label, multiple, onPicked }: { label: string; multiple: boolean; onPicked(refs: DocRef[]): void }) {
  return (
    <section className="dropzone">
      <div className="dropzone-icon">
        <FilePlus2 size={26} />
      </div>
      <button className="btn btn-primary" onClick={async () => onPicked(await pickPdfs(multiple))}>
        {label}
      </button>
    </section>
  );
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<void>, fail: (e: unknown) => void) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

// ---------- Organize pages ----------

const A4: [number, number] = [595.28, 841.89];
let keySeq = 0;

function Organize({ fail }: { onToast(m: string): void; fail(e: unknown): void }) {
  const t = useT();
  const [sources, setSources] = useState<Source[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Saved[]>([]);
  const { busy, run } = useBusy();
  const dragKey = useRef<string | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  useEffect(() => () => sourcesRef.current.forEach((s) => s.doc.loadingTask.destroy().catch(() => {})), []);

  const addSource = async (ref: DocRef) => {
    const src = await loadSource(ref);
    const at = sourcesRef.current.length;
    setSources((s) => [...s, src]);
    return Array.from({ length: src.doc.numPages }, (_, i) => ({ key: `p${keySeq++}`, spec: { src: at, index: i, rotate: 0 } as PageSpec }));
  };

  if (!sources.length)
    return (
      <Pick
        label={t.choosePdf}
        multiple={false}
        onPicked={(refs) => refs[0] && run(async () => setItems(await addSource(refs[0])), fail)}
      />
    );

  const first = sources[0];
  // Tapping toggles a page in the selection (works the same with a mouse and on a phone).
  const toggle = (key: string) =>
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const blankSize = async (): Promise<[number, number]> => {
    const near = [...items].reverse().find((it) => sel.has(it.key) && "src" in it.spec) ?? items.find((it) => "src" in it.spec);
    if (!near || !("src" in near.spec)) return A4;
    const pg = await sources[near.spec.src].doc.getPage(near.spec.index + 1);
    const v = pg.getViewport({ scale: 1 });
    return [v.width, v.height];
  };
  const saveAs = (pages: Item[], suffix: string) =>
    run(async () => {
      const bytes = await assemble(
        sources.map((s) => s.bytes),
        pages.map((p) => p.spec),
      );
      setSaved([await save(bytes, suffixName(first.name, suffix), first)]);
    }, fail);

  return (
    <>
      <div className="organize-bar" role="toolbar">
        <span className="organize-count">{sel.size ? t.selectedCount(sel.size) : t.pagesTotal(items.length)}</span>
        <span className="organize-tools">
          <button className="icon-btn" title={sel.size === items.length ? t.selectNone : t.selectAll} aria-label={t.selectAll} onClick={() => setSel(sel.size === items.length ? new Set() : new Set(items.map((i) => i.key)))}>
            <CheckSquare size={18} />
          </button>
          <button className="icon-btn" title={t.rotateLeft} aria-label={t.rotateLeft} disabled={!sel.size} onClick={() => setItems(rotateSel(items, sel, 270))}>
            <RotateCcw size={18} />
          </button>
          <button className="icon-btn" title={t.rotateRight} aria-label={t.rotateRight} disabled={!sel.size} onClick={() => setItems(rotateSel(items, sel, 90))}>
            <RotateCw size={18} />
          </button>
          <button className="icon-btn" title={t.moveEarlier} aria-label={t.moveEarlier} disabled={!sel.size} onClick={() => setItems(moveSel(items, sel, -1))}>
            <ArrowLeft size={18} className="flip-rtl" />
          </button>
          <button className="icon-btn" title={t.moveLater} aria-label={t.moveLater} disabled={!sel.size} onClick={() => setItems(moveSel(items, sel, 1))}>
            <ArrowRight size={18} className="flip-rtl" />
          </button>
          <button
            className="icon-btn danger"
            title={t.deletePages}
            aria-label={t.deletePages}
            disabled={!sel.size || sel.size === items.length}
            onClick={() => {
              setItems(deleteSel(items, sel));
              setSel(new Set());
            }}
          >
            <Trash2 size={18} />
          </button>
          <button className="icon-btn" title={t.insertBlank} aria-label={t.insertBlank} onClick={async () => setItems(insertAfter(items, sel, [{ key: `p${keySeq++}`, spec: { blank: await blankSize() } }]))}>
            <SquareDashed size={18} />
          </button>
          <button
            className="icon-btn"
            title={t.insertFrom}
            aria-label={t.insertFrom}
            disabled={busy}
            onClick={async () => {
              const [ref] = await pickPdfs(false);
              if (ref) run(async () => setItems(insertAfter(items, sel, await addSource(ref))), fail);
            }}
          >
            <FilePlus2 size={18} />
          </button>
        </span>
      </div>

      <ul className="page-grid">
        {items.map((it, i) => {
          const s = it.spec;
          return (
            <li
              key={it.key}
              draggable={!isAndroid()}
              onDragStart={() => (dragKey.current = it.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const from = items.findIndex((x) => x.key === dragKey.current);
                if (from < 0 || from === i) return;
                const next = [...items];
                const [moved] = next.splice(from, 1);
                next.splice(i, 0, moved);
                setItems(next);
              }}
            >
              <button className="page-tile" aria-pressed={sel.has(it.key)} onClick={() => toggle(it.key)}>
                {"src" in s ? (
                  <PdfThumb doc={sources[s.src].doc} index={s.index} rotate={s.rotate} width={120} />
                ) : (
                  <div className="pthumb blank" style={{ width: 120, height: 120 }}>
                    <span>{t.blankPage}</span>
                  </div>
                )}
                <span className="page-label">{i + 1}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="convert-actions">
        <Results saved={saved} />
        <button className="btn btn-ghost" disabled={!sel.size || busy} onClick={() => saveAs(items.filter((i) => sel.has(i.key)), "pages")}>
          {t.extractSelected}
        </button>
        <button className="btn btn-primary" disabled={busy || !items.length} onClick={() => saveAs(items, "edited")}>
          {busy ? t.working : t.saveCopy}
        </button>
      </div>
    </>
  );
}

// ---------- Merge ----------

function Merge({ fail }: { onToast(m: string): void; fail(e: unknown): void }) {
  const t = useT();
  const [list, setList] = useState<{ ref: DocRef; name: string }[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const { busy, run } = useBusy();
  const add = async (refs: DocRef[]) => setList([...list, ...(await Promise.all(refs.map(async (ref) => ({ ref, name: await resolveName(ref) }))))]);
  const move = (i: number, d: number) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setList(next);
  };
  if (!list.length) return <Pick label={t.choosePdfs} multiple onPicked={add} />;
  return (
    <>
      <ul className="job-list">
        {list.map((f, i) => (
          <li key={i} className="job merge-row">
            <span className="job-icon">{i + 1}</span>
            <span className="job-text">
              <span className="job-name">{f.name}</span>
            </span>
            <span className="job-actions">
              <button className="icon-btn" aria-label={t.moveUp} title={t.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={17} />
              </button>
              <button className="icon-btn" aria-label={t.moveDown} title={t.moveDown} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={17} />
              </button>
              <button className="icon-btn" aria-label={t.remove} title={t.remove} onClick={() => setList(list.filter((_, k) => k !== i))}>
                <X size={17} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="convert-actions">
        <Results saved={saved} />
        <button className="btn btn-ghost" onClick={async () => add(await pickPdfs(true))}>
          {t.addMore}
        </button>
        <button
          className="btn btn-primary"
          disabled={list.length < 2 || busy}
          onClick={() =>
            run(async () => {
              const bytes: Uint8Array[] = [];
              const pages: PageSpec[] = [];
              for (const [k, f] of list.entries()) {
                const b = await readDocument(f.ref);
                const n = (await loadPdf(b)).getPageCount();
                bytes.push(b);
                for (let i = 0; i < n; i++) pages.push({ src: k, index: i, rotate: 0 });
              }
              const out = await assemble(bytes, pages);
              setSaved([await saveOutput(out, suffixName(list[0].name, "merged"), folderOf(list[0].ref), "application/pdf")]);
            }, fail)
          }
        >
          {busy ? t.working : t.mergeBtn}
        </button>
      </div>
    </>
  );
}

// ---------- Split ----------

function Split({ fail, onToast }: { onToast(m: string): void; fail(e: unknown): void }) {
  const t = useT();
  const [src, setSrc] = useState<Source | null>(null);
  const [mode, setMode] = useState<"each" | "every" | "ranges">("each");
  const [n, setN] = useState(2);
  const [ranges, setRanges] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);
  const { busy, run } = useBusy();
  useEffect(() => () => void src?.doc.loadingTask.destroy().catch(() => {}), [src]);
  if (!src) return <Pick label={t.choosePdf} multiple={false} onPicked={(r) => r[0] && run(async () => setSrc(await loadSource(r[0])), fail)} />;
  const m: SplitMode = mode === "each" ? { kind: "each" } : mode === "every" ? { kind: "every", n } : { kind: "ranges", text: ranges };
  const groups = splitGroups(src.doc.numPages, m);
  return (
    <>
      <p className="tool-file">
        <span className="job-name">{src.name}</span> · {t.pagesTotal(src.doc.numPages)}
      </p>
      <div className="split-modes" role="radiogroup">
        {(
          [
            ["each", t.splitEach],
            ["every", t.splitEvery],
            ["ranges", t.splitRanges],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="radio-row">
            <input type="radio" name="split" checked={mode === k} onChange={() => setMode(k)} />
            <span>{label}</span>
            {k === "every" && mode === "every" && (
              <input className="num-input" type="number" min={1} max={src.doc.numPages} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} />
            )}
            {k === "ranges" && mode === "ranges" && (
              <input className="text-input" dir="ltr" placeholder={t.splitRangesHint} value={ranges} onChange={(e) => setRanges(e.target.value)} aria-invalid={!groups} />
            )}
          </label>
        ))}
      </div>
      {mode === "ranges" && ranges && !groups && <p className="field-error">{t.badRanges}</p>}
      <div className="convert-actions">
        <Results saved={saved} />
        <button
          className="btn btn-primary"
          disabled={!groups || busy}
          onClick={() =>
            run(async () => {
              const out: Saved[] = [];
              for (const [k, g] of groups!.entries())
                out.push(await save(await assemble([src.bytes], g.map((index) => ({ src: 0, index, rotate: 0 }))), suffixName(src.name, `part ${k + 1}`), src));
              setSaved(out);
              onToast(t.savedParts(out.length));
            }, fail)
          }
        >
          {busy ? t.working : t.splitBtn}
          {groups && groups.length > 1 ? ` (${groups.length})` : ""}
        </button>
      </div>
    </>
  );
}

// ---------- Compress ----------

const PRESETS = { strong: { maxDim: 1200, quality: 0.55 }, balanced: { maxDim: 1800, quality: 0.7 }, light: { maxDim: 2600, quality: 0.82 } };

const reencodeJpeg: Reencode = async (jpeg, maxDim, quality) => {
  const bmp = await createImageBitmap(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
  const k = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
  const out = blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height } : null;
  c.width = c.height = 0;
  return out;
};

const mb = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function Compress({ fail, onToast }: { onToast(m: string): void; fail(e: unknown): void }) {
  const t = useT();
  const [file, setFile] = useState<{ ref: DocRef; name: string } | null>(null);
  const [preset, setPreset] = useState<keyof typeof PRESETS>("balanced");
  const [result, setResult] = useState<{ before: number; after: number } | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const { busy, run } = useBusy();
  if (!file) return <Pick label={t.choosePdf} multiple={false} onPicked={async (r) => r[0] && setFile({ ref: r[0], name: await resolveName(r[0]) })} />;
  return (
    <>
      <p className="tool-file">
        <span className="job-name">{file.name}</span>
      </p>
      <div className="segmented compress-presets">
        {(
          [
            ["strong", t.compressStrong],
            ["balanced", t.compressBalanced],
            ["light", t.compressLight],
          ] as const
        ).map(([k, label]) => (
          <button key={k} aria-pressed={preset === k} onClick={() => setPreset(k)}>
            {label}
          </button>
        ))}
      </div>
      {result && (
        <p className="compress-result">
          {mb(result.before)} → <strong>{mb(result.after)}</strong> ({Math.round((1 - result.after / result.before) * 100)}%)
        </p>
      )}
      <div className="convert-actions">
        <Results saved={saved} />
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const bytes = await readDocument(file.ref);
              const r = await compressPdf(bytes, PRESETS[preset], reencodeJpeg);
              if (!r.smaller) {
                setResult(null);
                onToast(t.alreadySmall);
                return;
              }
              setResult({ before: r.before, after: r.after });
              setSaved([await saveOutput(r.bytes, suffixName(file.name, "compressed"), folderOf(file.ref), "application/pdf")]);
            }, fail)
          }
        >
          {busy ? t.working : t.compressBtn}
        </button>
      </div>
    </>
  );
}
