import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useT } from "../i18n";
import type { Match, PageLayout } from "../text/search";

export type SearchState = {
  query: string;
  exact: boolean;
  matchCase: boolean;
  results: Match[];
  current: number;
  scanning: { done: number; total: number } | null;
  noText: boolean;
};

type Props = {
  state: SearchState;
  layouts: Map<number, PageLayout>;
  focusToken: number;
  onChange(patch: Partial<SearchState>): void;
  onPick(index: number): void;
};

function snippet(text: string, m: Match): [string, string, string] {
  const from = Math.max(0, m.start - 32);
  const to = Math.min(text.length, m.end + 32);
  const flat = (s: string) => s.replace(/\s+/g, " ");
  return [
    (from > 0 ? "…" : "") + flat(text.slice(from, m.start)),
    flat(text.slice(m.start, m.end)),
    flat(text.slice(m.end, to)) + (to < text.length ? "…" : ""),
  ];
}

export default function SearchPanel({ state, layouts, focusToken, onChange, onPick }: Props) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusToken]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [state.current]);

  const n = state.results.length;
  const step = (d: 1 | -1) => n && onPick((state.current + d + n) % n);

  return (
    <div className="search-panel">
      <div className="search-box">
        <Search size={16} />
        <input
          ref={input}
          dir="auto"
          type="search"
          value={state.query}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          onChange={(e) => onChange({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            }
          }}
        />
      </div>
      <label className="check">
        <input type="checkbox" checked={state.exact} onChange={(e) => onChange({ exact: e.target.checked })} />
        {t.searchExact}
      </label>
      <label className="check">
        <input type="checkbox" checked={state.matchCase} onChange={(e) => onChange({ matchCase: e.target.checked })} />
        {t.searchMatchCase}
      </label>

      <div className="search-status">
        <span aria-live="polite">
          {state.noText
            ? t.errors.noText
            : state.scanning
              ? t.searchScanning(state.scanning.done, state.scanning.total)
              : state.query.trim()
                ? n
                  ? `${state.current + 1} / ${t.searchCount(n)}`
                  : t.searchNone
                : ""}
        </span>
        <span className="search-nav">
          <button className="icon-btn" disabled={!n} onClick={() => step(-1)} aria-label={t.prevResult} title={t.prevResult}>
            <ChevronUp size={18} />
          </button>
          <button className="icon-btn" disabled={!n} onClick={() => step(1)} aria-label={t.nextResult} title={t.nextResult}>
            <ChevronDown size={18} />
          </button>
        </span>
      </div>

      <ol className="search-results" ref={listRef}>
        {state.results.slice(0, 500).map((m, i) => {
          const text = layouts.get(m.page)?.text ?? "";
          const [a, b, c] = snippet(text, m);
          const firstOfPage = i === 0 || state.results[i - 1].page !== m.page;
          return (
            <li key={`${m.page}-${m.start}`}>
              {firstOfPage && <div className="result-page">{t.recentPage(m.page + 1)}</div>}
              <button dir="auto" aria-current={i === state.current ? "true" : undefined} onClick={() => onPick(i)}>
                {a}
                <mark>{b}</mark>
                {c}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
