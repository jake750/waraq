import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useT } from "../i18n";

type Props = { name: string; wrong: boolean; onSubmit(pw: string): void; onCancel(): void };

/** Asks for a PDF's password. The password is only passed to pdf.js; never stored or logged. */
export default function PasswordPrompt({ name, wrong, onSubmit, onCancel }: Props) {
  const t = useT();
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [wrong]);

  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (pw) onSubmit(pw);
        }}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      >
        <div className="dialog-icon">
          <Lock size={22} />
        </div>
        <h2 id="pw-title">{t.passwordTitle}</h2>
        <p dir="auto">{t.passwordSub(name)}</p>
        <label className="field">
          <span>{t.passwordLabel}</span>
          <span className={`input-wrap${wrong ? " error" : ""}`}>
            <input
              ref={input}
              type={show ? "text" : "password"}
              value={pw}
              autoComplete="off"
              aria-invalid={wrong}
              aria-describedby={wrong ? "pw-error" : undefined}
              onChange={(e) => setPw(e.target.value)}
            />
            <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={t.passwordLabel}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
          {wrong && (
            <span id="pw-error" className="field-error" role="alert">
              {t.errors.wrongPassword}
            </span>
          )}
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!pw}>
            {t.passwordOpen}
          </button>
        </div>
      </form>
    </>
  );
}
