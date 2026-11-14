import { FileText } from "lucide-react";
import { useT } from "../i18n";
import { BACK_DIALOG, useBack } from "../shell/back";

type Props = { name: string; busy: boolean; canOpen: boolean; onConvert(): void; onOpen(): void; onCancel(): void };

/** A non-PDF was opened: convert it (Convert screen) or read it as a temporary PDF. */
export default function NotPdfPrompt({ name, busy, canOpen, onConvert, onOpen, onCancel }: Props) {
  const t = useT();
  useBack(true, () => !busy && onCancel(), BACK_DIALOG);
  return (
    <>
      <div className="scrim" onClick={busy ? undefined : onCancel} />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="notpdf-title" onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}>
        <div className="dialog-icon">
          <FileText size={22} />
        </div>
        <h2 id="notpdf-title">{t.notPdfTitle}</h2>
        <p dir="auto" className="clamp" title={name}>
          {t.notPdfBody(name)}
        </p>
        {busy && <p className="dialog-status">{t.preparing}</p>}
        {/* Converting is what most people want for a document, so it is the main action. */}
        <div className="dialog-actions stack">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t.cancel}
          </button>
          {canOpen && (
            <button type="button" className="btn btn-ghost" onClick={onOpen} disabled={busy}>
              {t.notPdfOpen}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onConvert} disabled={busy} autoFocus>
            {t.notPdfConvert}
          </button>
        </div>
      </div>
    </>
  );
}
