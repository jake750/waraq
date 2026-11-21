import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useT } from "../i18n";
import { flattenOutline, headingOutline, type OutlineItem } from "./outline";

type Props = { doc: PDFDocumentProxy; current: number; onPick(page: number): void };

export default function OutlinePanel({ doc, current, onPick }: Props) {
  const t = useT();
  const [items, setItems] = useState<OutlineItem[] | null>(null);
  /** True when the list was built from the document's headings (it has no outline of its own). */
  const [built, setBuilt] = useState(false);
  useEffect(() => {
    let alive = true;
    setItems(null);
    setBuilt(false);
    flattenOutline(doc)
      .catch(() => [])
      .then(async (x) => {
        if (x.length || !alive) return x;
        const h = await headingOutline(doc).catch(() => []);
        if (alive) setBuilt(h.length > 0);
        return h;
      })
      .then((x) => alive && setItems(x));
    return () => {
      alive = false;
    };
  }, [doc]);

  if (!items) return <p className="panel-note">{t.loading}</p>;
  if (items.length === 0) return <p className="panel-note">{t.outlineEmpty}</p>;

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
