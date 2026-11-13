import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Download, Home as HomeIcon, RefreshCw, Repeat2, Settings, ShieldCheck, Wrench, X } from "lucide-react";
import { useLang, useT, type Lang } from "../i18n";
import type { ThemePref } from "../prefs";
import { isAndroid } from "../platform";
import type { Updates } from "../update/useUpdates";

export type Route = "home" | "convert" | "tools" | "reader" | "editor";

type Props = {
  route: Route;
  onRoute(r: Route): void;
  readerAvailable: boolean;
  theme: ThemePref;
  onTheme(t: ThemePref): void;
  updates: Updates;
  children: ReactNode;
};

function UpdateSection({ u }: { u: Updates }) {
  const t = useT();
  const s = u.state;
  const status =
    s.status === "checking"
      ? t.updChecking
      : s.status === "latest"
        ? t.updLatest
        : s.status === "error"
          ? t.updError
          : s.status === "unavailable"
            ? t.updUnavailable
            : s.status === "available"
              ? t.updAvailable(s.found.version)
              : s.status === "installing"
                ? t.updInstalling(s.progress)
                : null;
  return (
    <div className="pref">
      <span className="field-label">{t.updTitle}</span>
      <div className="update-box">
        <div className="update-head">
          <span className="update-version">{u.version ? t.updVersion(u.version) : t.appName}</span>
          {s.status === "available" || s.status === "installing" ? (
            <button className="btn btn-primary btn-sm" onClick={u.install} disabled={s.status === "installing"}>
              <Download size={16} />
              {isAndroid() ? t.updDownload : t.updInstall}
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={u.check} disabled={s.status === "checking"}>
              <RefreshCw size={16} className={s.status === "checking" ? "spin" : undefined} />
              {t.updCheck}
            </button>
          )}
        </div>
        {status && (
          <p className={s.status === "error" ? "update-status error" : "update-status"} role="status">
            {status}
          </p>
        )}
        {s.status === "installing" && s.progress !== null && (
          <div className="update-bar" role="progressbar" aria-valuenow={s.progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${s.progress}%` }} />
          </div>
        )}
        {(s.status === "available" || s.status === "installing") && s.found.notes && (
          <p className="update-notes" dir="auto">
            {s.found.notes}
          </p>
        )}
        <label className="check">
          <input type="checkbox" checked={u.auto} onChange={(e) => u.setAuto(e.target.checked)} />
          {t.updAuto}
        </label>
      </div>
    </div>
  );
}

function Prefs({ theme, onTheme, updates }: Pick<Props, "theme" | "onTheme" | "updates">) {
  const t = useT();
  const { lang, setLang } = useLang();
  const langs: [Lang, string][] = [
    ["en", t.langEnglish],
    ["ar", t.langArabic],
  ];
  const themes: [ThemePref, string][] = [
    ["light", t.themeLight],
    ["dark", t.themeDark],
    ["system", t.themeSystem],
  ];
  return (
    <>
      <div className="pref">
        <span className="field-label">{t.language}</span>
        <div className="segmented">
          {langs.map(([l, label]) => (
            <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="pref">
        <span className="field-label">{t.theme}</span>
        <div className="segmented">
          {themes.map(([v, label]) => (
            <button key={v} aria-pressed={theme === v} onClick={() => onTheme(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <UpdateSection u={updates} />
      <p className="settings-note">
        <ShieldCheck size={18} />
        <span>{t.settingsPrivacy}</span>
      </p>
    </>
  );
}

export default function Layout(p: Props) {
  const t = useT();
  // The editor is reached from Tools (or the reader); Tools stays marked as where you are.
  const current: Route = p.route === "editor" ? "tools" : p.route;
  // While reading or editing, the sidebar folds to an icon rail so the page gets the room.
  const rail = p.route === "reader" || p.route === "editor";
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    if (!settings) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSettings(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings]);
  const hasUpdate = p.updates.state.status === "available";
  const settingsIcon = (
    <span className="badge-wrap">
      <Settings size={20} />
      {hasUpdate && <span className="badge-dot" aria-label={t.updBadge} />}
    </span>
  );
  const items: { r: Route; label: string; icon: ReactNode }[] = [
    { r: "home", label: t.navHome, icon: <HomeIcon size={20} /> },
    { r: "convert", label: t.navConvert, icon: <Repeat2 size={20} /> },
    { r: "tools", label: t.navTools, icon: <Wrench size={20} /> },
    // The reader tab only exists while a document is open: no dead, disabled tab.
    ...(p.readerAvailable ? [{ r: "reader" as Route, label: t.navReader, icon: <BookOpen size={20} /> }] : []),
  ];
  return (
    <div className={rail ? "shell rail" : "shell"}>
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.svg" alt="" />
          <span className="nav-label">{t.appName}</span>
        </div>
        <nav>
          {items.map((i) => (
            <button
              key={i.r}
              className="nav-item"
              aria-current={current === i.r ? "page" : undefined}
              onClick={() => p.onRoute(i.r)}
              title={rail ? i.label : undefined}
              aria-label={i.label}
            >
              {i.icon}
              <span className="nav-label">{i.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button
            className="nav-item"
            onClick={() => setSettings(true)}
            title={rail ? t.settings : undefined}
            aria-label={hasUpdate ? `${t.settings} — ${t.updBadge}` : t.settings}
          >
            {settingsIcon}
            <span className="nav-label">{t.settings}</span>
          </button>
        </div>
      </aside>
      <div className="content">{p.children}</div>
      <nav className="tabbar">
        {items.map((i) => (
          <button key={i.r} aria-current={current === i.r ? "page" : undefined} onClick={() => p.onRoute(i.r)}>
            {i.icon}
            {i.label}
          </button>
        ))}
        <button onClick={() => setSettings(true)} aria-label={hasUpdate ? `${t.settings} — ${t.updBadge}` : undefined}>
          {settingsIcon}
          {t.settings}
        </button>
      </nav>
      {settings && (
        <>
          <div className="scrim" onClick={() => setSettings(false)} />
          <div className="sheet settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2 id="settings-title">{t.settings}</h2>
              <button className="icon-btn" onClick={() => setSettings(false)} aria-label={t.close} title={t.close}>
                <X size={20} />
              </button>
            </div>
            <Prefs theme={p.theme} onTheme={p.onTheme} updates={p.updates} />
          </div>
        </>
      )}
    </div>
  );
}
