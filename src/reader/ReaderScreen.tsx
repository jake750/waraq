import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useT } from "../i18n";
import { findMatches, pageLayout, type PageLayout } from "../text/search";
import { matchRects } from "./highlight";
import OutlinePanel from "./OutlinePanel";
import Reader from "./Reader";
import SearchPanel, { type SearchState } from "./SearchPanel";
import Thumbnails from "./Thumbnails";
import type { HighlightRect } from "./PageView";

type Tab = "thumbs" | "outline" | "search";

type Props = {
  doc: PDFDocumentProxy;
  docKey: string;
  name: string;
  initialPage?: number;
  onPageChange(page: number): void;
  onClose(): void;
  onEdit?(): void;
};

const isPhone = () => window.matchMedia?.("(max-width: 719px)").matches ?? false;

/** The reader plus its side panel: thumbnails, table of contents and search. */
export default function ReaderScreen(p: Props) {
  const t = useT();
  const { doc } = p;
  const [panelOpen, setPanelOpen] = useState(() => !isPhone());
  const [tab, setTab] = useState<Tab>("thumbs");
  const [ratio, setRatio] = useState(1.414);
  const [focusToken, setFocusToken] = useState(0);
  const layouts = useRef(new Map<number, PageLayout>());
  const [search, setSearch] = useState<SearchState>({
    query: "",
    exact: false,
    matchCase: false,
    results: [],
    current: 0,
    scanning: null,
    noText: false,
  });

  useEffect(() => {
    doc
      .getPage(1)
      .then((pg) => {
        const v = pg.getViewport({ scale: 1 });
        setRatio(v.height / v.width);
      })
      .catch(() => {});
  }, [doc]);

  // Run the search over every page, reusing extracted text; newer queries cancel older ones.
  const { query, exact, matchCase } = search;
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!q) {
      setSearch((s) => ({ ...s, results: [], current: 0, scanning: null, noText: false }));
      return;
    }
    const timer = setTimeout(async () => {
      // "No searchable text" only when every page is empty (a cover/title page may be an image).
      let anyText = false;
      const opts = { loose: !exact, caseSensitive: matchCase };
      const found: typeof search.results = [];
      for (let i = 0; i < doc.numPages; i++) {
        if (cancelled) return;
        let layout = layouts.current.get(i);
        if (!layout) {
          layout = await pageLayout(doc, i).catch(() => ({ text: "", boxes: [] }));
          layouts.current.set(i, layout);
        }
        if (layout.text.trim()) anyText = true;
        for (const m of findMatches([layout.text], q, opts)) found.push({ ...m, page: i });
        if (i % 10 === 9 || i === doc.numPages - 1) {
          const done = i + 1;
          const snapshot = [...found];
          if (!cancelled)
            setSearch((s) => ({
              ...s,
              results: snapshot,
              noText: done === doc.numPages && !anyText,
              scanning: done < doc.numPages ? { done, total: doc.numPages } : null,
              current: Math.min(s.current, Math.max(0, snapshot.length - 1)),
            }));
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc, query, exact, matchCase]);

  const highlights = useMemo(() => {
    const map = new Map<number, HighlightRect[]>();
    search.results.forEach((m, i) => {
      const layout = layouts.current.get(m.page);
      if (!layout) return;
      const list = map.get(m.page + 1) ?? [];
      list.push(...matchRects(layout, m, i === search.current));
      map.set(m.page + 1, list);
    });
    return map;
  }, [search.results, search.current]);

  const focus = search.results[search.current] ?? null;

  const openSearch = useCallback(() => {
    setPanelOpen(true);
    setTab("search");
    setFocusToken((x) => x + 1);
  }, []);

  const tabs: [Tab, string][] = [
    ["thumbs", t.tabThumbs],
    ["outline", t.tabOutline],
    ["search", t.tabSearch],
  ];

  return (
    <>
      <Reader
        doc={doc}
        docKey={p.docKey}
        name={p.name}
        initialPage={p.initialPage}
        onPageChange={p.onPageChange}
        onClose={p.onClose}
        panelOpen={panelOpen}
        onPanelToggle={() => setPanelOpen((o) => !o)}
        onFind={openSearch}
        onEdit={p.onEdit}
        highlights={highlights}
        focus={focus}
        panel={(api) => {
          const pick = (page: number) => {
            api.goTo(page);
            if (isPhone()) setPanelOpen(false);
          };
          return (
            <>
              <div className="sheet-handle phone-only" />
              <div className="panel-tabs" role="tablist">
                {tabs.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="panel-body">
                {tab === "thumbs" && <Thumbnails doc={doc} ratio={ratio} current={api.page} onPick={pick} />}
                {tab === "outline" && <OutlinePanel doc={doc} current={api.page} onPick={pick} />}
                {tab === "search" && (
                  <SearchPanel
                    state={search}
                    layouts={layouts.current}
                    focusToken={focusToken}
                    onChange={(patch) => setSearch((s) => ({ ...s, ...patch, current: 0 }))}
                    onPick={(i) => {
                      setSearch((s) => ({ ...s, current: i }));
                      if (isPhone()) setPanelOpen(false);
                    }}
                  />
                )}
              </div>
            </>
          );
        }}
      />
      {panelOpen && <div className="scrim phone-only" onClick={() => setPanelOpen(false)} />}
    </>
  );
}
