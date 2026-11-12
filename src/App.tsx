import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { dict, dirFor, LangContext, type Lang, type Strings } from "./i18n";
import { loadLang, loadTheme, resolveTheme, saveLang, saveTheme, type ThemePref } from "./prefs";
import Layout, { type Route } from "./shell/Layout";
import Home from "./shell/Home";
import Reader from "./reader/Reader";
import { docKey, docName, pickPdf, readDocument, type DocRef } from "./files/docRef";
import { openPdf, PdfError, type PdfErrorCode } from "./pdf/openPdf";

type OpenDoc = { ref: DocRef; key: string; name: string; doc: PDFDocumentProxy; initialPage: number };

export function errorText(t: Strings, code: PdfErrorCode): string {
  const map: Record<PdfErrorCode, keyof Strings["errors"]> = {
    "not-a-pdf": "notAPdf",
    "password-required": "passwordRequired",
    "wrong-password": "wrongPassword",
    "file-missing": "fileMissing",
    "read-failed": "readFailed",
  };
  return t.errors[map[code]];
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(loadLang);
  const [theme, setThemeState] = useState<ThemePref>(loadTheme);
  const [route, setRoute] = useState<Route>("home");
  const [open, setOpen] = useState<OpenDoc | null>(null);
  const openRef = useRef<OpenDoc | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const t = dict[lang];

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = dirFor(lang);
    document.title = open ? `${open.name} — ${t.appName}` : t.appName;
  }, [lang, t, open]);

  useEffect(() => {
    const apply = () => (document.documentElement.dataset.theme = resolveTheme(theme));
    apply();
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener("change", apply);
    return () => mq?.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const openDocument = useCallback(
    async (ref: DocRef, password?: string) => {
      try {
        const bytes = await readDocument(ref);
        const doc = await openPdf(bytes, password);
        const prev = openRef.current;
        openRef.current = { ref, key: docKey(ref), name: docName(ref), doc, initialPage: 1 };
        setOpen(openRef.current);
        setRoute("reader");
        prev?.doc.loadingTask.destroy().catch(() => {});
      } catch (e) {
        setToast(errorText(t, e instanceof PdfError ? e.code : "read-failed"));
      }
    },
    [t],
  );

  // Browser preview: ?open=/fixtures/arabic-book.pdf
  const devOpened = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || devOpened.current) return;
    devOpened.current = true;
    const q = new URLSearchParams(location.search).get("open");
    if (q) openDocument({ kind: "path", path: `dev:${q}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const onPick = async () => {
    const ref = await pickPdf().catch(() => null);
    if (ref) openDocument(ref);
  };

  const onPageChange = useCallback(() => {}, []);
  const onClose = useCallback(() => {
    const prev = openRef.current;
    openRef.current = null;
    setOpen(null);
    setRoute("home");
    prev?.doc.loadingTask.destroy().catch(() => {});
  }, []);

  return (
    <LangContext.Provider value={langCtx}>
      <Layout
        route={route}
        onRoute={setRoute}
        readerAvailable={!!open}
        theme={theme}
        onTheme={(v) => {
          saveTheme(v);
          setThemeState(v);
        }}
      >
        {route === "reader" && open ? (
          <Reader
            key={open.key}
            doc={open.doc}
            docKey={open.key}
            name={open.name}
            initialPage={open.initialPage}
            onPageChange={onPageChange}
            onClose={onClose}
          />
        ) : (
          <Home
            onOpen={onPick}
            dragOver={false}
            recent={
              <ul className="recent-list">
                <li className="recent-empty">{t.recentEmpty}</li>
              </ul>
            }
          />
        )}
      </Layout>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </LangContext.Provider>
  );
}
