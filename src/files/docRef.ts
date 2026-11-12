import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
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
    return await readFile(ref.uri);
  } catch (e) {
    throw new PdfError(String(e).includes("file-missing") ? "file-missing" : "read-failed");
  }
}

export async function pickPdf(): Promise<DocRef | null> {
  const picked = await open({ multiple: false, directory: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  return typeof picked === "string" ? toDocRef(picked) : null;
}
