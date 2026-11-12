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

export async function readDocument(ref: DocRef): Promise<Uint8Array> {
  try {
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
