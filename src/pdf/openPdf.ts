import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";

export type PdfErrorCode = "not-a-pdf" | "password-required" | "wrong-password" | "file-missing" | "read-failed";

export class PdfError extends Error {
  constructor(public code: PdfErrorCode) {
    super(code);
    this.name = "PdfError";
  }
}

// pdf.js PasswordResponses: 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD
function toPdfError(e: unknown): PdfError {
  if (e instanceof PdfError) return e;
  const err = e as { name?: string; code?: number };
  if (err?.name === "PasswordException") return new PdfError(err.code === 2 ? "wrong-password" : "password-required");
  return new PdfError("not-a-pdf");
}

// Where pdf.js finds its decoders (JPEG 2000 / JBIG2 / CCITT wasm), CMaps and standard fonts.
// Without these, most scanned books render as blank pages. Must end with "/".
let assetBase: string | undefined;
export function setPdfAssetBase(base: string): void {
  assetBase = base;
}

/** Opens a PDF. Page 1 is loaded eagerly so a broken file fails here, not later in the viewer. */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  // pdf.js takes ownership of the buffer; copy so the caller can retry (e.g. with a password).
  const task = getDocument({
    data: bytes.slice(),
    password,
    verbosity: 0,
    ...(assetBase && {
      wasmUrl: `${assetBase}wasm/`,
      cMapUrl: `${assetBase}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assetBase}standard_fonts/`,
    }),
  });
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
    await doc.getPage(1);
    return doc;
  } catch (e) {
    await task.destroy().catch(() => {});
    throw toPdfError(e);
  }
}

/** True when any of the first `samplePages` pages has extractable text. */
export async function hasText(doc: PDFDocumentProxy, samplePages = 3): Promise<boolean> {
  const n = Math.min(samplePages, doc.numPages);
  for (let i = 1; i <= n; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    if (tc.items.some((it) => "str" in it && it.str.trim() !== "")) return true;
  }
  return false;
}
