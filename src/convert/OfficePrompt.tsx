import { Download } from "lucide-react";
import { useT } from "../i18n";
import type { OfficePrompt } from "./useConvert";

type Props = { prompt: OfficePrompt; sizeMb: number; onDownload(): void; onBuiltIn(): void; onCancel(): void; onStop(): void };

/** Offered once per session before the first job that LibreOffice would do better (PC only). */
export default function OfficePromptDialog({ prompt, sizeMb, onDownload, onBuiltIn, onCancel, onStop }: Props) {
  const t = useT();
  const working = prompt.stage === "downloading" || prompt.stage === "installing";
  const mb = (b: number) => Math.round(b / 1e6);
  return (
    <>
      <div className="scrim" onClick={working ? undefined : onCancel} />
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="office-title"
        onKeyDown={(e) => e.key === "Escape" && !working && onCancel()}
      >
        <div className="dialog-icon">
          <Download size={22} />
        </div>
        <h2 id="office-title">{t.officeTitle}</h2>
        <p>{t.officeBody(sizeMb)}</p>
        {prompt.stage === "downloading" && (
          <>
            <span className="job-progress" role="progressbar" aria-valuenow={prompt.total ? Math.round((prompt.bytes / prompt.total) * 100) : 0}>
              <span style={{ inlineSize: `${prompt.total ? Math.max(2, (prompt.bytes / prompt.total) * 100) : 2}%` }} />
            </span>
            <p className="dialog-status">{t.officeDownloading(mb(prompt.bytes), mb(prompt.total))}</p>
          </>
        )}
        {prompt.stage === "installing" && <p className="dialog-status">{t.officeInstalling}</p>}
        {prompt.stage === "failed" && (
          <p className="field-error" role="alert">
            {t.officeFailed}
          </p>
        )}
        <div className="dialog-actions">
          {prompt.stage === "downloading" ? (
            <button type="button" className="btn btn-ghost" onClick={onStop}>
              {t.cancel}
            </button>
          ) : working ? null : (
            <>
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                {t.cancel}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onBuiltIn}>
                {t.officeBuiltIn}
              </button>
              <button type="button" className="btn btn-primary" onClick={onDownload} autoFocus>
                {t.officeDownload}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
