import { useEffect, useState, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useT } from "../i18n";
import Illustration from "../shell/Illustration";
import { pageLayout, type PageLayout } from "../text/search";
import { flattenOutline, headingOutline, type OutlineItem } from "./outline";

/** The list once built, kept by the reader so switching tabs doesn't build it again. */
export type OutlineCache = { doc: PDFDocumentProxy; items: OutlineItem[]; built: boolean };

type Props = {
  doc: PDFDocumentProxy;
  current: number;
  onPick(page: number): void;
  cache: RefObject<OutlineCache | null>;
  /** Page text already read (by search), shared so headings needn't read it again. */
  layouts: Map<number, PageLayout>;
};

export default function OutlinePanel({ doc, current, onPick, cache, layouts }: Props) {
  const t = useT();
  const kept = cache.current?.doc === doc ? cache.current : null;
  const [items, setItems] = useState<OutlineItem[] | null>(kept?.items ?? null);
  /** True when the list was built from the document's headings (it has no outline of its own). */
  const [built, setBuilt] = useState(kept?.built ?? false);
  useEffect(() => {
    if (cache.current?.doc === doc) return;
    let alive = true;
    setItems(null);
    setBuilt(false);
    const read = async (d: PDFDocumentProxy, i: number) => {
      let l = layouts.get(i);
      if (!l) layouts.set(i, (l = await pageLayout(d, i)));
      return l;
    };
    flattenOutline(doc)
      .catch(() => [])
      .then(async (x) => {
        if (x.length) return { items: x, built: false };
        const h = await headingOutline(doc, read, () => alive);
        return { items: h, built: h.length > 0 };
      })
      .then(
        (r) => {
          cache.current = { doc, ...r };
          if (!alive) return;
          setBuilt(r.built);
          setItems(r.items);
        },
        () => alive && setItems([]), // cancelled (left the tab): nothing kept, built again next time
      );
    return () => {
      alive = false;
    };
  }, [doc, cache, layouts]);

  if (!items) return <p className="panel-note">{t.loading}</p>;
  if (items.length === 0)
    return (
      <div className="panel-note">
        <Illustration kind="outline" />
        <p>{t.outlineEmpty}</p>
      </div>
    );

  // The chapter you're in: the last entry starting at or before the current page.
  let here = -1;
  items.forEach((it, i) => {
    if (it.page <= current) here = i;
  });

  return (
    <>
    {built && <p className="panel-note">{t.outlineBuilt}</p>}
    <ul className="outline">
      {items.map((it, i) => (
        <li key={i}>
          <button
            dir="auto"
            aria-current={i === here ? "true" : undefined}
            style={{ paddingInlineStart: 12 + it.depth * 16 }}
            onClick={() => onPick(it.page)}
          >
            <span className="outline-title">{it.title}</span>
            <span className="outline-page">{it.page}</span>
          </button>
        </li>
      ))}
    </ul>
    </>
  );
}
