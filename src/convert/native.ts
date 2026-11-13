// App-side wrappers around the native commands (src-tauri/src/files.rs, print.rs, office.rs, mobile.rs).

import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { readDocument } from "../files/docRef";
import { openPdf } from "../pdf/openPdf";
import { isAndroid } from "../platform";
import { ConvertError, type ConvertErrorCode } from "./errors";
import type { PageOpts } from "./fromHtml";
import { renderPageImage } from "./fromPdf";
import type { Saved } from "./queue";
import type { RunDeps } from "./run";

const CODES: ConvertErrorCode[] = ["bad-input", "unsupported", "engine-failed", "timeout", "cancelled", "office-missing", "write-failed", "protected"];
const toError = (e: unknown) => {
  const s = String(e);
  const code = CODES.find((c) => s.includes(c)) ?? (s.includes("file-missing") ? "bad-input" : "engine-failed");
  return new ConvertError(code, s);
};
const call = <T>(cmd: string, args?: Record<string, unknown>, opts?: Parameters<typeof invoke>[2]) =>
  invoke<T>(cmd, args, opts).catch((e) => {
    throw toError(e);
  });

const join = (dir: string, name: string) => dir + (dir.includes("\\") ? "\\" : "/") + name;

/** Writes bytes as a new file in `dir` ("" = app cache). Returns the final path. */
export function writeNew(bytes: Uint8Array, dir: string, name: string): Promise<string> {
  return call<string>("save_output", bytes as unknown as Record<string, unknown>, {
    headers: { "x-dir": encodeURIComponent(dir), "x-name": encodeURIComponent(name) },
  });
}

/** Saves an output. Desktop: into `dir`. Android: into Downloads/Waraq. */
export async function saveOutput(bytes: Uint8Array, name: string, dir: string, mime: string): Promise<Saved> {
  if (isAndroid()) {
    const tmp = await writeNew(bytes, "", name);
    const r = await call<{ uri: string; label: string }>("android_save_to_downloads", { path: tmp, name, mime });
    return { path: r.uri, uri: r.uri, label: r.label, name: r.label.split("/").pop() || name };
  }
  const path = await writeNew(bytes, dir, name);
  return { path, name: path.split(/[\\/]/).pop() ?? name };
}

/** HTML → PDF with the system browser engine (WebView2 / Android WebView). */
export async function printPdf(html: string, page: PageOpts, signal: AbortSignal): Promise<Uint8Array> {
  const dir = await call<string>("temp_dir");
  const htmlPath = await writeNew(new TextEncoder().encode(html), dir, "page.html");
  const outPath = join(dir, "out.pdf");
  if (signal.aborted) throw new ConvertError("cancelled");
  await call("html_to_pdf", { htmlPath, outPath, opts: { size: page.size, landscape: page.landscape } });
  const buf = await call<ArrayBuffer>("read_file", { path: outPath });
  return new Uint8Array(buf);
}

export type OfficeStatus = { installed: boolean; version: string; downloadBytes: number };

export const officeStatus = (): Promise<OfficeStatus> =>
  isAndroid() ? Promise.resolve({ installed: false, version: "", downloadBytes: 0 }) : call<OfficeStatus>("office_status");

export function officeInstall(onBytes: (n: number) => void): Promise<void> {
  const ch = new Channel<number>();
  ch.onmessage = onBytes;
  return call("office_install", { onProgress: ch });
}

export const officeCancel = () => invoke("office_cancel").catch(() => {});

export async function officeConvert(inputPath: string, target: string, outName: string, outDir: string, signal: AbortSignal): Promise<Saved> {
  const onAbort = () => officeCancel();
  signal.addEventListener("abort", onAbort);
  try {
    const path = await call<string>("office_convert", { input: inputPath, target, outDir, outName });
    return { path, name: path.split(/[\\/]/).pop() ?? outName };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** Opens a finished output with the default app (Android: the system viewer). */
export function openOutput(s: Saved, mime: string): Promise<unknown> {
  return s.uri ? invoke("android_view", { uri: s.uri, mime }) : invoke("open_output", { path: s.path });
}
export const revealOutput = (s: Saved) => invoke("reveal_output", { path: s.path });
export const shareOutput = (s: Saved, mime: string) => invoke("android_share", { uri: s.uri, mime });

export async function pickFolder(): Promise<string | null> {
  const r = await open({ directory: true, multiple: false });
  return typeof r === "string" ? r : null;
}

async function webpToPng(bytes: Uint8Array): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/webp" }));
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  c.width = c.height = 0;
  if (!blob) throw new ConvertError("bad-input");
  return new Uint8Array(await blob.arrayBuffer());
}

export function appDeps(officeReady: () => boolean): RunDeps {
  return {
    platform: isAndroid() ? "android" : "desktop",
    read: readDocument,
    officeReady,
    office: (input, target, name, dir, signal) => {
      if (input.ref.kind !== "path") throw new ConvertError("unsupported");
      return officeConvert(input.ref.path, target, name, dir, signal);
    },
    printPdf,
    save: saveOutput,
    openPdf: (b) => openPdf(b),
    renderPage: (doc: PDFDocumentProxy, i, fmt, dpi) => renderPageImage(doc, i, fmt, dpi),
    toPng: webpToPng,
  };
}
