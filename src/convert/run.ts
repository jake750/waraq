// Runs one queue job: picks the engine (formats.engineFor), converts, saves a NEW file.
// Everything platform-specific comes in through `RunDeps`, so routing is testable in Node.

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { DocRef } from "../files/docRef";
import { PdfError } from "../pdf/openPdf";
import { ConvertError, asConvertError } from "./errors";
import { engineFor, outputName, type Platform, type Target } from "./formats";
import { DEFAULT_PAGE, htmlDocument, htmlToDocx, htmlToMarkdown, htmlToText, type PageOpts } from "./fromHtml";
import { pdfToDocx, pdfToMarkdown, pdfToText } from "./fromPdf";
import { imagesToPdf, type ImageInput } from "./imagesToPdf";
import type { Input, Job, Saved } from "./queue";
import { toHtml } from "./toHtml";

export type RunDeps = {
  platform: Platform;
  read(ref: DocRef): Promise<Uint8Array>;
  /** LibreOffice installed and not declined for this session. */
  officeReady(): boolean;
  office(input: Input, target: Target, outName: string, dir: string, signal: AbortSignal): Promise<Saved>;
  printPdf(html: string, opts: PageOpts, signal: AbortSignal): Promise<Uint8Array>;
  /** Writes a new file (never overwrites); `dir` "" = the platform default (Android: Downloads/Waraq). */
  save(bytes: Uint8Array, name: string, dir: string, mime: string): Promise<Saved>;
  openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy>;
  renderPage(doc: PDFDocumentProxy, index: number, fmt: "png" | "jpg", dpi: number): Promise<Uint8Array>;
  /** WEBP → PNG (canvas); pdf-lib embeds only PNG/JPG. */
  toPng(bytes: Uint8Array): Promise<Uint8Array>;
};

export type RunOpts = { dir: string; page?: PageOpts; dpi?: number; fit?: "page" | "image" };

export const MIME: Record<Target, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  png: "image/png",
  jpg: "image/jpeg",
};

const utf8 = (s: string) => new TextEncoder().encode(s);

export async function runJob(
  job: Job,
  deps: RunDeps,
  opts: RunOpts,
  signal: AbortSignal,
  onProgress: (p: number) => void,
): Promise<Saved> {
  const check = () => {
    if (signal.aborted) throw new ConvertError("cancelled");
  };
  const page = opts.page ?? DEFAULT_PAGE;
  const name = outputName(job.inputs[0].name, job.target, () => false);
  const save = async (bytes: Uint8Array, n = name, t: Target = job.target) => {
    check();
    try {
      return await deps.save(bytes, n, opts.dir, MIME[t]);
    } catch (e) {
      throw asConvertError(e, "write-failed");
    }
  };
  try {
    check();
    const engine = engineFor(job.fmt, job.target, deps.platform, deps.officeReady());
    if (engine === "libreoffice") {
      if (deps.platform !== "desktop" || !deps.officeReady()) throw new ConvertError("office-missing");
      return await deps.office(job.inputs[0], job.target, name, opts.dir, signal);
    }

    if (engine === "images") {
      const images: ImageInput[] = [];
      for (const [i, input] of job.inputs.entries()) {
        check();
        const bytes = await deps.read(input.ref);
        const fmt = /\.jpe?g$/i.test(input.name) ? "jpg" : "png";
        images.push({ bytes: /\.webp$/i.test(input.name) ? await deps.toPng(bytes) : bytes, fmt });
        onProgress(((i + 1) / job.inputs.length) * 0.5);
      }
      const pdf = await imagesToPdf(images, { ...page, fit: opts.fit ?? "page" }, (n) => onProgress(0.5 + (n / images.length) * 0.5)).catch(
        (e) => {
          throw new ConvertError("bad-input", String(e));
        },
      );
      return await save(pdf);
    }

    const bytes = await deps.read(job.inputs[0].ref);
    check();

    if (engine === "pdf") {
      const doc = await deps.openPdf(bytes).catch((e) => {
        throw new ConvertError(e instanceof PdfError && e.code.startsWith("password") ? "protected" : "bad-input");
      });
      try {
        const onPage = (n: number) => onProgress(n / doc.numPages);
        switch (job.target) {
          case "txt":
            return await save(utf8(await pdfToText(doc, onPage, signal)));
          case "md":
            return await save(utf8(await pdfToMarkdown(doc, onPage, signal)));
          case "docx":
            return await save(await pdfToDocx(doc, onPage, signal));
          case "png":
          case "jpg": {
            const base = job.inputs[0].name.replace(/\.[^./\\]+$/, "");
            let first: Saved | undefined;
            for (let i = 0; i < doc.numPages; i++) {
              check();
              const img = await deps.renderPage(doc, i, job.target, opts.dpi ?? 150);
              const s = await save(img, `${base} (page ${i + 1}).${job.target}`);
              first ??= s;
              onProgress((i + 1) / doc.numPages);
            }
            return { ...first!, count: doc.numPages };
          }
          default:
            throw new ConvertError("unsupported");
        }
      } finally {
        doc.loadingTask.destroy().catch(() => {});
      }
    }

    // engine "html": every text/Office input goes through sanitized HTML.
    const { title, body } = await toHtml(bytes, job.fmt);
    onProgress(0.4);
    check();
    const docTitle = title || job.inputs[0].name.replace(/\.[^./\\]+$/, "");
    switch (job.target) {
      case "txt":
        return await save(utf8(htmlToText(body)));
      case "md":
        return await save(utf8(htmlToMarkdown(body)));
      case "html":
        return await save(utf8(htmlDocument(docTitle, body, page)));
      case "docx":
        return await save(await htmlToDocx(docTitle, body));
      case "pdf":
        return await save(await deps.printPdf(htmlDocument(docTitle, body, page), page, signal));
      default:
        throw new ConvertError("unsupported");
    }
  } catch (e) {
    if (signal.aborted || (e as Error)?.name === "AbortError") throw new ConvertError("cancelled");
    throw asConvertError(e);
  }
}
