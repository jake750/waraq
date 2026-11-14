import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { dict, dirFor, LangContext, type Lang, type Strings } from "./i18n";
import { loadLang, loadTheme, resolveTheme, saveLang, saveTheme, type ThemePref } from "./prefs";
import Layout, { type Route } from "./shell/Layout";
import Home, { type QuickAction } from "./shell/Home";
import ReaderScreen from "./reader/ReaderScreen";
import { displayName, docKey, pickFiles, readDocument, resolveName, type DocRef } from "./files/docRef";
import ConvertScreen from "./convert/ConvertScreen";
import ToolsScreen, { pickPdfs, type Tool } from "./tools/ToolsScreen";
import EditorScreen, { type EditSource } from "./editor/EditorScreen";
import { loadPdf } from "./tools/pages";
import NotPdfPrompt from "./convert/NotPdfPrompt";
import { useConvert } from "./convert/useConvert";
import { openAsPdf } from "./convert/openAsPdf";
import { asConvertError } from "./convert/errors";
import { openPdf, PdfError, type PdfErrorCode } from "./pdf/openPdf";
import { RecentStore, type RecentItem } from "./files/recent";
import { appKV } from "./files/kv";
import RecentList from "./shell/RecentList";
import PasswordPrompt from "./reader/PasswordPrompt";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isAndroid } from "./platform";
import { useUpdates } from "./update/useUpdates";
import { BACK_DIALOG, BACK_ROUTE, useBack } from "./shell/back";

const inTauri = () => "__TAURI_INTERNALS__" in window;

// id: one per open, so reopening the same file gets a fresh reader (no stale search text).
type OpenDoc = { id: number; ref: DocRef; key: string; name: string; doc: PDFDocumentProxy; initialPage: number };

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
  // A tool picked from Home's quick actions; the Tools screen opens straight into it.
  const [toolStart, setToolStart] = useState<{ tool: Tool; n: number } | null>(null);
  const [open, setOpen] = useState<OpenDoc | null>(null);
  const openRef = useRef<OpenDoc | null>(null);
  const openSeq = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const [locked, setLocked] = useState<{ ref: DocRef; wrong: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const conv = useConvert();
  const updates = useUpdates();
  const [notPdf, setNotPdf] = useState<{ ref: DocRef; name: string; busy: boolean } | null>(null);
  const [edit, setEdit] = useState<{ src: EditSource; from: Route } | null>(null);
  const recentStore = useMemo(() => new RecentStore(appKV()), []);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const refreshRecent = useCallback(() => recentStore.list().then(setRecent).catch(() => {}), [recentStore]);
  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);
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
    async (ref: DocRef, password?: string, temp?: { name: string }) => {
      // Only the latest open wins: a slow file opened earlier must not replace a newer one.
      const seq = ++openSeq.current;
      const stale = () => seq !== openSeq.current;
      try {
        const bytes = await readDocument(ref);
        const doc = await openPdf(bytes, password);
        if (stale()) {
          doc.loadingTask.destroy().catch(() => {});
          return;
        }
        // Android URIs are often opaque: ask the system for the file's real name, then the PDF's title.
        const real = ref.kind === "uri" ? await resolveName(ref) : undefined;
        const title =
          ref.kind === "uri" && !/\.pdf$/i.test(real ?? "")
            ? await doc.getMetadata().then((m) => (m.info as { Title?: string } | undefined)?.Title).catch(() => undefined)
            : undefined;
        const name = temp?.name ?? (real && /\.pdf$/i.test(real) ? real : displayName(ref, title));
        // A converted temporary PDF (opened from a non-PDF) doesn't go into Recent.
        const item = temp ? null : await recentStore.touch(ref, name).catch(() => null);
        if (!temp) refreshRecent();
        const prev = openRef.current;
        const initialPage = Math.min(item?.lastPage ?? 1, doc.numPages);
        if (stale()) {
          doc.loadingTask.destroy().catch(() => {});
          return;
        }
        openRef.current = { id: seq, ref, key: docKey(ref), name, doc, initialPage };
        setOpen(openRef.current);
        setLocked(null);
        setRoute("reader");
        prev?.doc.loadingTask.destroy().catch(() => {});
      } catch (e) {
        if (stale()) return;
        const code = e instanceof PdfError ? e.code : "read-failed";
        if (code === "password-required" || code === "wrong-password") {
          setLocked({ ref, wrong: code === "wrong-password" });
          return;
        }
        if (code === "file-missing") await recentStore.remove(docKey(ref)).then(refreshRecent, () => {});
        setToast(errorText(t, code));
      }
    },
    [t, recentStore, refreshRecent],
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

  // Desktop: the PDF Windows launched us with, files from a second launch, and drag-and-drop.
  // Registered once; the latest openDocument/strings are read through a ref.
  // Files from the picker, a drop or a launch: PDFs open; other files go to the converter.
  const handleFiles = useCallback(
    async (refs: DocRef[], toQueue: boolean) => {
      if (!refs.length) return;
      const named = await Promise.all(refs.map(async (ref) => ({ ref, name: await resolveName(ref) })));
      if (!toQueue && named.length === 1 && /\.pdf$/i.test(named[0].name)) return openDocument(named[0].ref);
      if (!toQueue && named.length === 1) return setNotPdf({ ...named[0], busy: false });
      const skipped = await conv.add(refs);
      if (skipped) setToast(t.skippedFiles(skipped));
      setRoute("convert");
    },
    [openDocument, conv, t],
  );

  // Browser preview only: window.__waraqQueue(["/fixtures/office/sample.docx"]) queues dev files.
  if (import.meta.env.DEV)
    (window as unknown as { __waraqQueue: unknown }).__waraqQueue = (paths: string[]) =>
      handleFiles(
        paths.map((p) => ({ kind: "path", path: `dev:${p}` })),
        true,
      );

  const latest = useRef({ openDocument, t, handleFiles, route });
  latest.current = { openDocument, t, handleFiles, route };
  useEffect(() => {
    if (!inTauri()) return;
    const openDocument = (ref: DocRef) => latest.current.openDocument(ref);
    let alive = true;
    const offs: (() => void)[] = [];
    invoke<string | null>("startup_file")
      .then((path) => {
        if (alive && path) openDocument({ kind: "path", path });
      })
      .catch(() => {});
    // Android: files from "Open with" / "Share", at launch and whenever we come back to the front.
    const takeIncoming = () =>
      invoke<string[]>("android_incoming")
        .then((uris) => {
          const { handleFiles, route } = latest.current;
          if (alive && uris.length) handleFiles(uris.map((uri) => ({ kind: "uri", uri })), route === "convert");
        })
        .catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && takeIncoming();
    if (isAndroid()) {
      takeIncoming();
      document.addEventListener("visibilitychange", onVisible);
      offs.push(() => document.removeEventListener("visibilitychange", onVisible));
    }
    listen<string>("open-file", (e) => openDocument({ kind: "path", path: e.payload })).then((off) =>
      alive ? offs.push(off) : off(),
    );
    getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter" || p.type === "over") setDragOver(true);
        else if (p.type === "leave") setDragOver(false);
        else if (p.type === "drop") {
          setDragOver(false);
          const { handleFiles, route } = latest.current;
          handleFiles(
            p.paths.map((path) => ({ kind: "path", path })),
            route === "convert",
          );
        }
      })
      .then((off) => (alive ? offs.push(off) : off()))
      .catch(() => {});
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
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

  const onPick = async () => handleFiles(await pickFiles(false).catch(() => []), false);

  const onOpenAsPdf = async () => {
    if (!notPdf) return;
    setNotPdf({ ...notPdf, busy: true });
    try {
      const out = await openAsPdf(notPdf.ref, notPdf.name, !!conv.office?.installed);
      setNotPdf(null);
      await openDocument({ kind: "path", path: out.path }, undefined, { name: out.name });
    } catch (e) {
      setNotPdf(null);
      setToast(t.convertErrors[asConvertError(e).code]);
    }
  };

  // The editor works on its own copy of the bytes; protected files are refused before it opens.
  const onQuick = async (a: QuickAction) => {
    if (a === "convert") return setRoute("convert");
    if (a === "edit") {
      const [ref] = await pickPdfs(false);
      if (ref) editDocument(ref);
      return;
    }
    setToolStart((s) => ({ tool: a, n: (s?.n ?? 0) + 1 }));
    setRoute("tools");
  };

  const editDocument = async (ref: DocRef, name?: string) => {
    try {
      const bytes = await readDocument(ref);
      await loadPdf(bytes);
      setEdit({ src: { ref, name: name ?? (await resolveName(ref)), bytes }, from: route === "editor" ? "tools" : route });
      setRoute("editor");
    } catch (e) {
      setToast(t.convertErrors[asConvertError(e, "bad-input").code]);
    }
  };

  const onPageChange = useCallback(
    (page: number) => {
      const cur = openRef.current;
      if (cur) cur.initialPage = page; // coming back to the reader resumes here
      const key = cur?.key;
      if (key) recentStore.setLastPage(key, page).catch(() => {});
    },
    [recentStore],
  );
  const onClose = useCallback(() => {
    const prev = openRef.current;
    openRef.current = null;
    setOpen(null);
    setRoute("home");
    prev?.doc.loadingTask.destroy().catch(() => {});
    refreshRecent();
  }, [refreshRecent]);

  // Android back: the reader closes like its close button; other screens go back to Home.
  // The editor handles back itself (it asks before dropping unsaved changes).
  useBack(route !== "home" && route !== "editor", () => (route === "reader" ? onClose() : setRoute("home")), BACK_ROUTE);
  useBack(!!locked, () => setLocked(null), BACK_DIALOG);

  return (
    <LangContext.Provider value={langCtx}>
      <Layout
        route={route}
        onRoute={setRoute}
        readerAvailable={!!open}
        updates={updates}
        theme={theme}
        onTheme={(v) => {
          saveTheme(v);
          setThemeState(v);
        }}
      >
        {route === "editor" && edit ? (
          <EditorScreen
            key={edit.src.name + edit.src.bytes.length}
            src={edit.src}
            onToast={setToast}
            onClose={() => {
              setRoute(edit.from === "reader" && !open ? "home" : edit.from);
              setEdit(null);
            }}
          />
        ) : route === "tools" ? (
          <ToolsScreen
            key={toolStart?.n ?? 0}
            initialTool={toolStart?.tool}
            onToast={setToast}
            onEdit={(ref) => editDocument(ref)}
          />
        ) : route === "convert" ? (
          <ConvertScreen api={conv} dragOver={dragOver} onToast={setToast} />
        ) : route === "reader" && open ? (
          <ReaderScreen
            key={open.id}
            doc={open.doc}
            docKey={open.key}
            name={open.name}
            initialPage={open.initialPage}
            onPageChange={onPageChange}
            onClose={onClose}
            onEdit={() => editDocument(open.ref, open.name)}
          />
        ) : (
          <Home
            onOpen={onPick}
            onQuick={onQuick}
            dragOver={dragOver}
            recent={
              <RecentList
                items={recent}
                onOpen={(item) => openDocument(item.ref)}
                onRemove={(item) => recentStore.remove(item.key).then(refreshRecent)}
              />
            }
          />
        )}
      </Layout>
      {locked && (
        <PasswordPrompt
          name={displayName(locked.ref)}
          wrong={locked.wrong}
          onSubmit={(pw) => openDocument(locked.ref, pw)}
          onCancel={() => setLocked(null)}
        />
      )}
      {notPdf && (
        <NotPdfPrompt
          name={notPdf.name}
          busy={notPdf.busy}
          onConvert={() => {
            const ref = notPdf.ref;
            setNotPdf(null);
            handleFiles([ref], true);
          }}
          onOpen={onOpenAsPdf}
          onCancel={() => setNotPdf(null)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </LangContext.Provider>
  );
}
