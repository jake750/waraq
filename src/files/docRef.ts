import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { fmtOf, nameWithType, OPENABLE_EXTS, sniffFmt } from "../convert/formats";
import { PdfError } from "../pdf/openPdf";

/** Where a document lives: a filesystem path (desktop) or an Android content URI. */
export type DocRef = { kind: "path"; path: string } | { kind: "uri"; uri: string };

export const docKey = (ref: DocRef): string => (ref.kind === "path" ? ref.path : ref.uri);

export function toDocRef(picked: string): DocRef {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(picked) ? { kind: "uri", uri: picked } : { kind: "path", path: picked };
}

export function docName(ref: DocRef): string {
  const raw = docKey(ref);
  const last = raw.split(/[\\/]/).pop() ?? raw;
  try {
    // Content URIs percent-encode the display name (and often prefix it with "primary:" etc.)
    return decodeURIComponent(last).split(/[:/]/).pop() || last;
  } catch {
    return last;
  }
}

/**
 * The name shown to the user. Some Android providers hand out opaque URIs
 * ("document:1000000070"); then the PDF's own title is the best name we have.
 */
export function displayName(ref: DocRef, title?: string): string {
  const name = docName(ref);
  if (ref.kind === "path" || /\.pdf$/i.test(name)) return name;
  return title?.trim() || "Document.pdf";
}

export async function readDocument(ref: DocRef): Promise<Uint8Array> {
  try {
    // Browser preview only (npm run dev): "dev:/fixtures/x.pdf" is fetched from the Vite server.
    if (import.meta.env.DEV && ref.kind === "path" && ref.path.startsWith("dev:")) {
      const res = await fetch(ref.path.slice(4));
      if (!res.ok || res.headers.get("content-type")?.includes("text/html")) throw new Error("file-missing");
      return new Uint8Array(await res.arrayBuffer());
    }
    if (ref.kind === "path") {
      const buf = await invoke<ArrayBuffer>("read_file", { path: ref.path });
      return new Uint8Array(buf);
    }
    try {
      return await readFile(ref.uri);
    } catch (e) {
      // Android: the picker's grant ended with the last session; read the private copy kept for Recent.
      const copy = await invoke<string | null>("android_recent_copy", { uri: ref.uri }).catch(() => null);
      if (!copy) throw e;
      return new Uint8Array(await invoke<ArrayBuffer>("read_file", { path: copy }));
    }
  } catch (e) {
    const s = String(e);
    throw new PdfError(s.includes("file-missing") ? "file-missing" : s.includes("too-large") ? "too-large" : "read-failed");
  }
}

export async function pickPdf(): Promise<DocRef | null> {
  const picked = await open({ multiple: false, directory: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  return typeof picked === "string" ? toDocRef(picked) : null;
}

/** Every extension the app can open or convert (see convert/formats.ts). */

/** Picks one or more files the app can open or convert. */
export async function pickFiles(multiple = true): Promise<DocRef[]> {
  const picked = await open({ multiple, directory: false, filters: [{ name: "Documents", extensions: OPENABLE_EXTS }] });
  const list = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
  return keepAccess(list.map(toDocRef));
}

/** Android: keep read access to picked files after a restart, so Recent can reopen them. */
export function keepAccess(refs: DocRef[]): DocRef[] {
  for (const r of refs) if (r.kind === "uri") invoke("android_persist", { uri: r.uri }).catch(() => {});
  return refs;
}

// A URI's name never changes, but one file is resolved two or three times on its way in (open, the
// not-a-PDF sheet, the convert queue) and an untyped one is read whole to sniff it: remember the answer.
const names = new Map<string, Promise<string>>();
const NAMES_MAX = 64;

/** The file's real name. Android content URIs are often opaque ("document:1000"), so ask the system. */
export function resolveName(ref: DocRef): Promise<string> {
  if (ref.kind !== "uri") return Promise.resolve(docName(ref));
  const hit = names.get(ref.uri);
  if (hit) return hit;
  const p = lookUpName(ref);
  names.set(ref.uri, p);
  p.catch(() => names.delete(ref.uri));
  if (names.size > NAMES_MAX) names.delete(names.keys().next().value!);
  return p;
}

/** Test hook: forget remembered names. */
export const forgetNames = () => names.clear();

async function lookUpName(ref: DocRef & { kind: "uri" }): Promise<string> {
  {
    const r = await invoke<{ name?: string | null; mime?: string | null }>("android_display_name", { uri: ref.uri }).catch(() => null);
    const name = nameWithType(r?.name || docName(ref), r?.mime);
    const said = fmtOf(name);
    if (said && said !== "doc") return name;
    // Neither the name nor the type says what it is (e.g. "application/octet-stream"), or it says .doc,
    // which is often a renamed .docx: look at the bytes.
    const f = await readDocument(ref).then(sniffFmt, () => null);
    if (said) return f === "docx" ? name.trim().replace(/\.doc$/i, ".docx") : name;
    return f ? `${name.trim()}.${f}` : name;
  }
}

/** The folder holding a desktop file ("" for Android content URIs: outputs go to Downloads). */
export function folderOf(ref: DocRef): string {
  if (ref.kind !== "path" || ref.path.startsWith("dev:")) return "";
  const i = Math.max(ref.path.lastIndexOf("/"), ref.path.lastIndexOf("\\"));
  return i > 0 ? ref.path.slice(0, i) : "";
}

/** "report.pdf" + "edited" → "report (edited).pdf"; editing that again stays "report (edited).pdf". */
export const suffixName = (name: string, suffix: string, ext = "pdf") => {
  let base = name.replace(/\.[^./\\]+$/, "");
  const tail = ` (${suffix})`;
  while (base.endsWith(tail)) base = base.slice(0, -tail.length);
  return `${base}${tail}.${ext}`;
};
