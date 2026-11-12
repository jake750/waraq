import { useEffect, useMemo, useState } from "react";
import { dict, dirFor, LangContext, type Lang } from "./i18n";
import { loadLang, loadTheme, resolveTheme, saveLang, saveTheme, type ThemePref } from "./prefs";
import Layout, { type Route } from "./shell/Layout";
import Home from "./shell/Home";

export default function App() {
  const [lang, setLangState] = useState<Lang>(loadLang);
  const [theme, setThemeState] = useState<ThemePref>(loadTheme);
  const [route, setRoute] = useState<Route>("home");
  const t = dict[lang];

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = dirFor(lang);
    document.title = t.appName;
  }, [lang, t]);

  useEffect(() => {
    const apply = () => (document.documentElement.dataset.theme = resolveTheme(theme));
    apply();
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener("change", apply);
    return () => mq?.removeEventListener("change", apply);
  }, [theme]);

  const langCtx = useMemo(
    () => ({
      lang,
      setLang: (l: Lang) => {
        saveLang(l);
        setLangState(l);
      },
    }),
    [lang],
  );

  return (
    <LangContext.Provider value={langCtx}>
      <Layout
        route={route}
        onRoute={setRoute}
        readerAvailable={false}
        theme={theme}
        onTheme={(v) => {
          saveTheme(v);
          setThemeState(v);
        }}
      >
        <Home
          onOpen={() => {}}
          dragOver={false}
          recent={
            <ul className="recent-list">
              <li className="recent-empty">{t.recentEmpty}</li>
            </ul>
          }
        />
      </Layout>
    </LangContext.Provider>
  );
}
