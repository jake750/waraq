import { useT } from "../i18n";

/** The reader's keyboard shortcuts (desktop), opened with "?". */
export default function ShortcutsDialog({ onClose }: { onClose(): void }) {
  const t = useT();
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const rows: [string[], string][] = [
    [["←", "→"], t.kbdPages],
    [["Home", "End"], t.kbdFirstLast],
    [[`${mod} +`, `${mod} −`], t.kbdZoom],
    [[`${mod} 0`], t.kbdFit],
    [[`${mod} F`], t.kbdFind],
    [["F11"], t.kbdFull],
    [["N"], t.kbdNight],
    [["Esc"], t.kbdClose],
    [["?"], t.kbdHelp],
  ];
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog kbd-dialog" role="dialog" aria-modal="true" aria-labelledby="kbd-title" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h2 id="kbd-title">{t.kbdTitle}</h2>
        <dl className="kbd-list">
          {rows.map(([keys, label]) => (
            <div key={label}>
              <dt dir="ltr">
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={onClose} autoFocus>
            {t.close}
          </button>
        </div>
      </div>
    </>
  );
}
