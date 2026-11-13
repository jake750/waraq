import { useState, type ReactNode } from "react";
import { BookOpen, Home as HomeIcon, Repeat2, Settings, Wrench } from "lucide-react";
import { useLang, useT, type Lang } from "../i18n";
import type { ThemePref } from "../prefs";

export type Route = "home" | "convert" | "tools" | "reader";

type Props = {
  route: Route;
  onRoute(r: Route): void;
  readerAvailable: boolean;
  theme: ThemePref;
  onTheme(t: ThemePref): void;
  children: ReactNode;
};

function Prefs({ theme, onTheme }: Pick<Props, "theme" | "onTheme">) {
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
      <span className="field-label">{t.language}</span>
      <div className="segmented">
        {langs.map(([l, label]) => (
          <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>
            {label}
          </button>
        ))}
      </div>
      <span className="field-label">{t.theme}</span>
      <div className="segmented">
        {themes.map(([v, label]) => (
          <button key={v} aria-pressed={theme === v} onClick={() => onTheme(v)}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

export default function Layout(p: Props) {
  const t = useT();
  const [sheet, setSheet] = useState(false);
  const items: { r: Route; label: string; icon: ReactNode; disabled?: boolean }[] = [
    { r: "home", label: t.navHome, icon: <HomeIcon size={20} /> },
    { r: "convert", label: t.navConvert, icon: <Repeat2 size={20} /> },
    { r: "tools", label: t.navTools, icon: <Wrench size={20} /> },
    { r: "reader", label: t.navReader, icon: <BookOpen size={20} />, disabled: !p.readerAvailable },
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.svg" alt="" />
          {t.appName}
        </div>
        <nav>
          {items.map((i) => (
            <button
              key={i.r}
              className="nav-item"
              aria-current={p.route === i.r ? "page" : undefined}
              disabled={i.disabled}
              onClick={() => p.onRoute(i.r)}
              style={{ width: "100%" }}
            >
              {i.icon}
              {i.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Prefs theme={p.theme} onTheme={p.onTheme} />
        </div>
      </aside>
      <div className="content">{p.children}</div>
      <nav className="tabbar">
        {items.map((i) => (
          <button
            key={i.r}
            aria-current={p.route === i.r ? "page" : undefined}
            disabled={i.disabled}
            onClick={() => p.onRoute(i.r)}
          >
            {i.icon}
            {i.label}
          </button>
        ))}
        <button onClick={() => setSheet(true)}>
          <Settings size={20} />
          {t.settings}
        </button>
      </nav>
      {sheet && (
        <>
          <div className="scrim" onClick={() => setSheet(false)} />
          <div className="sheet" role="dialog" aria-label={t.settings}>
            <div className="sheet-handle" />
            <Prefs theme={p.theme} onTheme={p.onTheme} />
          </div>
        </>
      )}
    </div>
  );
}
