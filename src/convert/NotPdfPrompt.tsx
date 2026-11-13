import { FileText } from "lucide-react";
import { useT } from "../i18n";

type Props = { name: string; busy: boolean; onConvert(): void; onOpen(): void; onCancel(): void };

/** A non-PDF was opened: convert it (Convert screen) or read it as a temporary PDF. */
export default function NotPdfPrompt({ name, busy, onConvert, onOpen, onCancel }: Props) {
  const t = useT();
  return (
    <>
      <div className="scrim" onClick={busy ? undefined : onCancel} />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="notpdf-title" onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}>
        <div className="dialog-icon">
          <FileText size={22} />
        </div>
        <h2 id="notpdf-title">{t.notPdfTitle}</h2>
        <p dir="auto">{t.notPdfBody(name)}</p>
        {busy && <p className="dialog-status">{t.preparing}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t.cancel}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onConvert} disabled={busy}>
            {t.notPdfConvert}
          </button>
          <button type="button" className="btn btn-primary" onClick={onOpen} disabled={busy} autoFocus>
            {t.notPdfOpen}
          </button>
        </div>
      </div>
    </>
  );
}
