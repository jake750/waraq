import { Trash2 } from "lucide-react";
import { useT } from "../i18n";
import type { Mark } from "./marks";

type Props = { marks: Mark[]; selected: string | null; onPick(m: Mark): void; onDelete(id: string): void; onClose(): void };

/** The words a mark carries, if any: a note's or text box's text, the text under a highlight. */
export function markExcerpt(m: Mark, max = 80): string {
  const s = (m.kind === "note" || m.kind === "text" ? m.text : m.kind === "highlight" || m.kind === "underline" || m.kind === "strike" ? (m.text ?? "") : "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Everything added to the document, page by page (a bottom sheet on phones), to find, select or delete it. */
export default function MarksPanel({ marks, selected, onPick, onDelete, onClose }: Props) {
  const t = useT();
  const sorted = [...marks].sort((a, b) => a.page - b.page);
  return (
    <aside className="ed-forms" aria-label={t.edMarks}>
      <div className="sheet-handle phone-only" />
      <header className="ed-forms-head">
        <h2>{t.edMarks}</h2>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          {t.edDone}
        </button>
      </header>
      <div className="ed-forms-body">
        {!sorted.length && <p className="ed-muted">{t.edMarksEmpty}</p>}
        <ul className="ed-marks">
          {sorted.map((m) => {
            const ex = markExcerpt(m);
            return (
              <li key={m.id} aria-current={m.id === selected ? "true" : undefined}>
                <button className="ed-mark-row" onClick={() => onPick(m)}>
                  <span className="ed-mark-dot" style={{ background: "color" in m ? `rgb(${m.color.map((v) => Math.round(v * 255)).join(",")})` : "var(--stroke-strong)" }} />
                  <span className="ed-mark-text">
                    <span>{t.edKinds[m.kind]}</span>
                    {ex && (
                      <span className="ed-muted" dir="auto">
                        {ex}
                      </span>
                    )}
                  </span>
                  <span className="ed-mark-page">{t.edPage(m.page + 1)}</span>
                </button>
                <button className="icon-btn danger" onClick={() => onDelete(m.id)} title={t.edDelete} aria-label={t.edDelete}>
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
