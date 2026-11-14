import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { pageOf } from "./outline";

/** A link area in PDF user space: either a web/mail address or a page in this document. */
export type PageLink = { rect: [number, number, number, number]; url?: string; page?: number };

/** Only web and mail links leave the app; anything else (javascript:, file:, app schemes) is dropped. */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:" ? u.href : null;
  } catch {
    return null;
  }
}

type Annot = { subtype?: string; rect?: number[]; url?: string; unsafeUrl?: string; dest?: string | unknown[] | null };

export async function pageLinks(doc: PDFDocumentProxy, page: PDFPageProxy): Promise<PageLink[]> {
  const annots = (await page.getAnnotations({ intent: "display" })) as Annot[];
  const out: PageLink[] = [];
  for (const a of annots) {
    if (a.subtype !== "Link" || !a.rect || a.rect.length !== 4) continue;
    const rect = a.rect as PageLink["rect"];
    const url = safeUrl(a.url ?? a.unsafeUrl);
    if (url) out.push({ rect, url });
    else if (a.dest) {
      const pg = await pageOf(doc, a.dest);
      if (pg) out.push({ rect, page: pg });
    }
  }
  return out;
}

/** Opens a web or mail link outside the app (the system browser or mail app). */
export async function openLink(url: string) {
  if ("__TAURI_INTERNALS__" in window) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else window.open(url, "_blank", "noopener");
}
