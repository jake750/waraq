import type { PDFDocumentProxy } from "pdfjs-dist";

export type OutlineItem = { title: string; page: number /* 1-based */; depth: number };

type RawNode = { title: string; dest: string | unknown[] | null; items: RawNode[] };

async function pageOf(doc: PDFDocumentProxy, dest: RawNode["dest"]): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const target = explicit[0];
    if (typeof target === "number") return target + 1;
    return (await doc.getPageIndex(target as Parameters<PDFDocumentProxy["getPageIndex"]>[0])) + 1;
  } catch {
    return null;
  }
}

/** Table of contents as a flat list; entries whose destination can't be resolved are dropped. */
export async function flattenOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const root = (await doc.getOutline()) as RawNode[] | null;
  const out: OutlineItem[] = [];
  const walk = async (nodes: RawNode[], depth: number) => {
    for (const node of nodes) {
      const page = await pageOf(doc, node.dest);
      if (page) out.push({ title: node.title.trim(), page, depth });
      if (node.items?.length) await walk(node.items, depth + 1);
    }
  };
  if (root) await walk(root, 0);
  return out;
}
