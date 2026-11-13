import { useEffect } from "react";
import { useT } from "../i18n";
import type { Field, FieldValue } from "./forms";

type Props = {
  fields: Field[];
  values: Record<string, FieldValue>;
  onChange(name: string, v: FieldValue): void;
  onPage(page: number): void;
  onClose(): void;
  /** A field tapped on the page; a new object each tap, so tapping the same field again refocuses it. */
  focus?: { name: string } | null;
};

/** Every fillable field of the PDF, in a side panel (a bottom sheet on phones). */
export default function FormsPanel({ fields, values, onChange, onPage, onClose, focus }: Props) {
  const t = useT();
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`fld-${focus.name}`) as HTMLInputElement | null;
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    el.focus({ preventScroll: true });
  }, [focus]);
  const val = (f: Field) => (f.name in values ? values[f.name] : f.value);
  return (
    <aside className="ed-forms" aria-label={t.edForms}>
      <div className="sheet-handle phone-only" />
      <header className="ed-forms-head">
        <h2>{t.edForms}</h2>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          {t.edDone}
        </button>
      </header>
      <div className="ed-forms-body">
        {fields.map((f) => {
          const v = val(f);
          const id = `fld-${f.name}`;
          const label = (
            <span className="ed-field-label">
              <bdi>{f.name}</bdi>
              <button type="button" className="ed-field-page" onClick={() => onPage(f.page)}>
                {t.pageN(f.page + 1)}
              </button>
            </span>
          );
          if (f.kind === "check")
            return (
              <label key={f.name} className="check ed-field">
                <input id={`fld-${f.name}`} type="checkbox" checked={!!v} disabled={f.readOnly} onChange={(e) => onChange(f.name, e.target.checked)} />
                {label}
              </label>
            );
          return (
            <div key={f.name} className="ed-field">
              <label htmlFor={id}>{label}</label>
              {f.kind === "text" &&
                (f.multiline ? (
                  <textarea id={id} dir="auto" rows={3} maxLength={f.maxLength} value={String(v)} readOnly={f.readOnly} onChange={(e) => onChange(f.name, e.target.value)} />
                ) : (
                  <input id={id} dir="auto" maxLength={f.maxLength} value={String(v)} readOnly={f.readOnly} onChange={(e) => onChange(f.name, e.target.value)} />
                ))}
              {(f.kind === "dropdown" || f.kind === "radio") && (
                <select id={id} dir="auto" value={String(v)} disabled={f.readOnly} onChange={(e) => onChange(f.name, e.target.value)}>
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
              {f.kind === "list" && (
                <select
                  id={id}
                  multiple
                  dir="auto"
                  value={Array.isArray(v) ? v : []}
                  disabled={f.readOnly}
                  onChange={(e) => onChange(f.name, [...e.target.selectedOptions].map((o) => o.value))}
                >
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
