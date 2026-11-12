# Plan 1 — App shell + PDF Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tauri 2 app that runs on Windows and Android, with a home screen, English/Arabic UI, and a full PDF reader (§6.2 of the spec).

**Architecture:** React + TypeScript UI in the Tauri webview; all PDF reading uses `pdfjs-dist` in the UI layer so Windows and Android behave the same. Rust only reads files by path (desktop), handles file association / single instance, and hosts plugins. Pure logic (search, Arabic normalisation, RTL detection, page virtualisation, recent-files store) lives in small TS modules with Vitest tests; components are verified manually and in the browser pane.

**Tech Stack:** Tauri 2, React 19, TypeScript ~6, Vite 8, Vitest, `pdfjs-dist`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs` (Android content URIs), `@tauri-apps/plugin-store`, `tauri-plugin-single-instance` (desktop). npm (no pnpm on this PC). Same conventions as the user's Khama app (`C:\Users\foura\Documents\khama`).

**Spec:** `docs/superpowers/specs/2026-11-12-document-converter-design.md`

**Program of plans** (each its own document, written when the previous one ships):
1. **Shell + Reader** (this plan) · 2. PDF tools · 3. Converter — PC/LibreOffice path · 4. Converter — phone path + text formats · 5. Editor · 6. Android polish ("Open with" intent, share sheet, recent-file permissions) + release CI.

Opening non-PDF formats in the reader (spec §6.2, via a temporary PDF) arrives with plans 3–4, once the converter exists.

## Global Constraints

- Working name **Waraq** (`productName: "Waraq"`, identifier `com.jake750.waraq`) — placeholder until the user names the app; keep it in `tauri.conf.json` and `i18n.ts` `appName` only.
- Offline: no network calls in this plan. CSP has no remote `connect-src`.
- Never write to or modify an opened file (the reader is read-only).
- English is the default UI language; Arabic optional with full RTL mirroring (`<html dir="rtl" lang="ar">`). Every UI string in both languages via `src/i18n.ts`; `ar` is typed `typeof en` so a missing key fails `tsc`.
- No AGPL dependencies. App license MIT.
- Must stay light on a weak laptop: render only visible pages (± overscan 2); destroy canvases of pages scrolled away.
- Error messages are codes translated in `i18n.ts` (Khama convention), never raw exception text.
- Android: no broad storage permission; files come from the system picker (content URIs).
- Motion: quick, soft, asymmetric ease-out; respect `prefers-reduced-motion`.
- Commit after every task; messages in English, conventional style, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Not-a-PDF / truncated / renamed file** → a translated error ("This file isn't a readable PDF"), no crash, no blank viewer. Test in Task 3.
2. **Path with Arabic letters and spaces** (this very project lives in `converter pdf`, the user's files are named in Arabic) → opens normally. Test in Task 3 (Rust).
3. **Scanned / image-only PDF** → pages render; search says "This document has no searchable text" instead of silently finding nothing. Test in Task 3 (`hasText`), UI in Task 6.
4. **Recent file that was moved or deleted** → reopening shows "File not found", and the entry is removed from the list. Test in Task 7.
5. **500-page PDF** → scrolling keeps at most visible + 4 page canvases alive; memory does not grow with page count. Test in Task 5 (pure) + manual check in Task 10.

---

## File structure

```
package.json, vite.config.ts, vitest.config.ts, tsconfig.json, index.html
scripts/make-fixtures.mjs          generates fixtures (Edge headless print + pdf-lib)
fixtures/                          committed test PDFs + README.md (provenance)
src/main.tsx                       React root, i18n + theme providers
src/App.tsx                        routes: home | reader
src/i18n.ts                        en / ar dictionaries, useT(), dirFor()
src/platform.ts                    isAndroid(), isDesktop()
src/theme.css                      tokens (light/dark), base styles, motion tokens
src/shell/Layout.tsx               sidebar (≥720px) / bottom tabs (<720px), lang + theme toggles
src/shell/Home.tsx                 "Open PDF" + recent files
src/files/docRef.ts                DocRef type, readDocument()
src/files/recent.ts                RecentStore (pure, injectable backend) + tauri-store backend
src/pdf/pdfjs.ts                   configured pdfjs-dist (worker URL)
src/pdf/openPdf.ts                 openPdf(), PdfError codes, hasText()
src/text/arabic.ts                 normalizeArabic(), detectRtl()
src/text/search.ts                 findMatches()
src/reader/layout.ts               pageOffsets(), visiblePages(), spreadGroups(), fitScale()
src/reader/Reader.tsx              toolbar + viewport + side panel
src/reader/PageView.tsx            canvas + text layer + search highlights for one page
src/reader/Thumbnails.tsx, Outline.tsx, SearchPanel.tsx, PasswordPrompt.tsx
src/reader/outline.ts              flattenOutline()
src-tauri/src/lib.rs               plugins, commands, startup-file handling
src-tauri/src/files.rs             read_bytes(), read_file command
tests/*.test.ts                    Vitest suites
```

---

### Task 0: Project scaffold

**Files:** Create `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src-tauri/**` (Cargo.toml, tauri.conf.json, capabilities/default.json, build.rs, src/main.rs, src/lib.rs, icons), `.gitignore` (add `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/android/app/build/`), `tests/smoke.test.ts`.

**Interfaces:** Produces npm scripts `dev`, `build` (`tsc && vite build`), `test` (`vitest run`), `tauri`.

- [ ] **Step 1:** Scaffold mirroring Khama's `package.json` / `Cargo.toml` (React 19, Vite 8, TS ~6, `@tauri-apps/cli` ^2 devDep, edition 2024, lib name `waraq_lib`, crate-type `["staticlib","cdylib","rlib"]`). Dev URL `http://localhost:1420`. Window 1100×780, min 760×560. Bundle targets `["nsis"]`, NSIS languages English + Arabic. CSP: `default-src 'self' ipc: http://ipc.localhost; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' ipc: http://ipc.localhost`.
- [ ] **Step 2:** Add `vitest` and `tests/smoke.test.ts` asserting `1 + 1 === 2`. In `vitest.config.ts` alias `pdfjs-dist` → `pdfjs-dist/legacy/build/pdf.mjs` (node-compatible build).
- [ ] **Step 3:** Run `npm install`, `npm test` → 1 passed; `npm run build` → no errors; `cd src-tauri && cargo check` → ok.
- [ ] **Step 4:** Run `npm run tauri dev` → a window titled "Waraq" opens. Close it.
- [ ] **Step 5:** Commit `chore: scaffold Tauri 2 + React app`.

---

### Task 1: i18n, platform, theme and app shell

**Files:** Create `src/i18n.ts`, `src/platform.ts`, `src/theme.css`, `src/shell/Layout.tsx`, `src/shell/Home.tsx`; modify `src/App.tsx`, `src/main.tsx`. Test `tests/i18n.test.ts`.

**Interfaces:**
- Produces: `type Lang = "en" | "ar"`; `const dict: Record<Lang, typeof en>`; `useT(): typeof en`; `useLang(): { lang: Lang; setLang(l: Lang): void }`; `dirFor(lang: Lang): "ltr" | "rtl"`; `isAndroid(): boolean`; `isDesktop(): boolean`. Lang and theme persist in `localStorage` keys `waraq.lang`, `waraq.theme` (`"light" | "dark" | "system"`).
- Error-code strings live under `en.errors`: `{ notAPdf, passwordRequired, wrongPassword, fileMissing, readFailed, noText }`.

- [ ] **Step 1: Write the failing test** `tests/i18n.test.ts`:

```ts
import { dict, dirFor } from "../src/i18n";
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === "object" ? keys(v).map(s => `${k}.${s}`) : [k]).sort();
test("ar has exactly the en keys", () => expect(keys(dict.ar)).toEqual(keys(dict.en)));
test("no empty strings", () => for (const l of ["en","ar"] as const)
  JSON.stringify(dict[l], (_k, v) => { if (v === "") throw new Error(l); return v; }));
test("dir", () => { expect(dirFor("ar")).toBe("rtl"); expect(dirFor("en")).toBe("ltr"); });
```

- [ ] **Step 2:** Run `npx vitest run tests/i18n.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `src/i18n.ts` and `src/platform.ts` (`isAndroid` = `navigator.userAgent` contains "Android").
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Build the shell **using the design skills** (`anthropic-skills:impeccable` + `ui-craft` for layout/components, `anthropic-skills:motion-design` for transitions). Requirements: Layout = left sidebar ≥720px wide (mirrors to the right in RTL via logical CSS properties only — `margin-inline-start`, never `left`), bottom tab bar below 720px; nav items in this plan: Home, Reader. Language toggle and theme toggle in the sidebar footer / a settings sheet on phone. Arabic UI font: bundle `@fontsource/ibm-plex-sans-arabic` (same as Khama); Latin falls back to the system UI font. Home: a large "Open PDF" drop zone + recent-files list (wired in Task 7; empty state for now: "No recent files yet").
- [ ] **Step 6:** Verify in the browser pane (`npm run dev`, http://localhost:1420): switch language → whole layout mirrors, no string stays English; resize to 375px → bottom tabs; dark theme has no unreadable text.
- [ ] **Step 7:** Commit `feat: app shell with en/ar i18n, themes, responsive layout`.

---

### Task 2: Test fixtures

**Files:** Create `scripts/make-fixtures.mjs`, `fixtures/src/arabic-book.html`, `fixtures/src/english-two-column.html`, `fixtures/arabic-book.source.txt`, `fixtures/README.md`, generated `fixtures/*.pdf`. Add devDeps `pdf-lib`, `@cantoo/pdf-lib` (MIT fork that can encrypt — fixtures only).

**Interfaces:** Produces these committed files, used by later tests:

| File | Content |
|---|---|
| `fixtures/arabic-book.pdf` | 12 A5 pages of original Arabic prose written for the project, some lines fully vowelled, headings "الفصل الأول" … "الفصل الرابع" with a PDF outline |
| `fixtures/arabic-book.source.txt` | The exact text of page 1 of the above (one paragraph per line) |
| `fixtures/english-two-column.pdf` | 3 pages, two-column English text containing the word `lighthouse` exactly 3 times (pages 1, 2, 3) |
| `fixtures/password.pdf` | 2 pages, user password `test123` |
| `fixtures/scanned.pdf` | 2 pages that are images only (no text operators) |
| `fixtures/not-a-pdf.pdf` | the bytes `hello, I am not a pdf` |
| `fixtures/truncated.pdf` | first 40% of the bytes of `english-two-column.pdf` |

- [ ] **Step 1:** Write the HTML sources (Arabic: `<html dir="rtl" lang="ar">`, font Amiri or Noto Naskh Arabic embedded via `@font-face` from a local file in `fixtures/src/fonts/` — OFL, include its licence). All text original — no copied books.
- [ ] **Step 2:** Implement `scripts/make-fixtures.mjs`: print HTML → PDF with `msedge --headless=new --no-pdf-header-footer --generate-pdf-document-outline --print-to-pdf=<out> <file-url>` (Edge path `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`); if the outline flag is ignored, add the outline with pdf-lib's low-level `PDFDict` API. Encrypt with `@cantoo/pdf-lib` `pdfDoc.encrypt({ userPassword: "test123", ownerPassword: "owner123" })`. Make `scanned.pdf` by embedding PNG renders of two pages of the English fixture into a new pdf-lib doc. Add npm script `fixtures`.
- [ ] **Step 3:** Run `npm run fixtures` → all 7 files exist; open `arabic-book.pdf` in Edge → letters connected, RTL, outline panel shows 4 chapters.
- [ ] **Step 4:** Write `fixtures/README.md`: how each file was made, that all text is original, font licence.
- [ ] **Step 5:** Commit `test: add generated PDF fixtures`.

---

### Task 3: Reading files and opening PDFs

**Files:** Create `src-tauri/src/files.rs`, `src/files/docRef.ts`, `src/pdf/pdfjs.ts`, `src/pdf/openPdf.ts`; modify `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml` (add `tauri-plugin-dialog`, `tauri-plugin-fs`, `tempfile` dev-dep). Tests `tests/helpers.ts`, `tests/openPdf.test.ts`, Rust unit tests in `files.rs`.

**Interfaces:**
- Rust: `pub fn read_bytes(path: &Path) -> Result<Vec<u8>, FileError>`; `enum FileError { Missing, Unreadable }` serialised as `"file-missing"` / `"read-failed"`; command `read_file(path: String) -> Result<tauri::ipc::Response, String>` (raw bytes, no JSON array).
- TS: `type DocRef = { kind: "path"; path: string } | { kind: "uri"; uri: string }` (uri = Android content URI); `docName(ref: DocRef): string`; `readDocument(ref: DocRef): Promise<Uint8Array>` (path → `invoke("read_file")`, uri → plugin-fs `readFile`); `pickPdf(): Promise<DocRef | null>` (plugin-dialog, filter `pdf`).
- TS: `type PdfErrorCode = "not-a-pdf" | "password-required" | "wrong-password" | "file-missing" | "read-failed"`; `class PdfError extends Error { code: PdfErrorCode }`; `openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy>`; `hasText(doc: PDFDocumentProxy, samplePages = 3): Promise<boolean>`.

- [ ] **Step 1: Write failing Rust tests** in `files.rs`:

```rust
#[test] fn reads_arabic_path_with_spaces() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("ملف تجريبي.pdf");
    std::fs::write(&p, b"%PDF-1.7").unwrap();
    assert_eq!(read_bytes(&p).unwrap(), b"%PDF-1.7");
}
#[test] fn missing_file_is_missing() {
    assert!(matches!(read_bytes(Path::new("C:/no/such/file.pdf")), Err(FileError::Missing)));
}
```

- [ ] **Step 2:** `cargo test` → FAIL (not defined). **Step 3:** implement; **Step 4:** `cargo test` → PASS.
- [ ] **Step 5: Write failing TS tests.** First `tests/helpers.ts`: `fx(name: string): Uint8Array` (reads `fixtures/<name>`) and `readFixtureText(name: string): string` (UTF-8). Then `tests/openPdf.test.ts`:

```ts
test("opens english", async () => expect((await openPdf(fx("english-two-column.pdf"))).numPages).toBe(3));
test("not a pdf", () => expect(openPdf(fx("not-a-pdf.pdf"))).rejects.toMatchObject({ code: "not-a-pdf" }));
test("truncated", () => expect(openPdf(fx("truncated.pdf"))).rejects.toMatchObject({ code: "not-a-pdf" }));
test("needs password", () => expect(openPdf(fx("password.pdf"))).rejects.toMatchObject({ code: "password-required" }));
test("wrong password", () => expect(openPdf(fx("password.pdf"), "nope")).rejects.toMatchObject({ code: "wrong-password" }));
test("right password", async () => expect((await openPdf(fx("password.pdf"), "test123")).numPages).toBe(2));
test("scanned has no text", async () => expect(await hasText(await openPdf(fx("scanned.pdf")))).toBe(false));
test("arabic has text", async () => expect(await hasText(await openPdf(fx("arabic-book.pdf")))).toBe(true));
```

  Note: if pdf.js manages to open the truncated file (it repairs some), the test instead asserts that `getPage(1)` + `getTextContent()` rejects with `not-a-pdf` — `openPdf` must eagerly load page 1 so a broken file fails at open time either way.
- [ ] **Step 6:** Run → FAIL. **Step 7:** Implement (map pdf.js `PasswordException` codes 1/2 and `InvalidPDFException` / `UnknownErrorException`). **Step 8:** Run → PASS.
- [ ] **Step 9:** Commit `feat: read files and open PDFs with typed errors`.

---

### Task 4: Arabic-aware search and RTL detection

**Files:** Create `src/text/arabic.ts`, `src/text/search.ts`. Test `tests/arabic.test.ts`, `tests/search.test.ts`.

**Interfaces:**
- `normalizeArabic(s: string): string` — removes tashkeel U+064B–U+065F and U+0670, tatweel U+0640; maps أ إ آ ٱ → ا, ؤ → و, ئ → ي, ى → ي. Leaves ة and non-Arabic text unchanged.
- `detectRtl(sample: string): boolean` — true when Arabic-script letters (U+0600–U+06FF, U+0750–U+077F, U+08A0–U+08FF, U+FB50–U+FDFF, U+FE70–U+FEFF) are > 50% of all letters (`\p{L}`).
- `type SearchOpts = { loose: boolean; caseSensitive: boolean }`; `type Match = { page: number; start: number; end: number }` (0-based page; offsets in the **original** page string); `findMatches(pages: string[], query: string, opts: SearchOpts): Match[]`.
- `pageText(doc: PDFDocumentProxy, pageIndex: number): Promise<string>` in `search.ts` — joins `getTextContent()` items, `hasEOL` → `"\n"`.

- [ ] **Step 1: Write failing tests:**

```ts
// arabic.test.ts
test.each([
  ["الْكِتَابُ", "الكتاب"], ["أحمد", "احمد"], ["إسلام", "اسلام"], ["آمن", "امن"],
  ["مسؤول", "مسوول"], ["شاطئ", "شاطي"], ["عَلَى", "علي"], ["كتـــاب", "كتاب"],
  ["مدرسة", "مدرسة"], ["Hello", "Hello"],
])("normalize %s", (i, o) => expect(normalizeArabic(i)).toBe(o));
test("rtl", () => {
  expect(detectRtl("Hello world")).toBe(false);
  expect(detectRtl("مرحبا بالعالم hello")).toBe(true);
  expect(detectRtl("")).toBe(false);
});
// search.test.ts
const L = { loose: true, caseSensitive: false }, S = { loose: false, caseSensitive: false };
test("loose maps back to original offsets", () =>
  expect(findMatches(["قال الْكِتَابُ مفيد"], "الكتاب", L)).toEqual([{ page: 0, start: 4, end: 14 }]));
test("strict needs the vowels", () => expect(findMatches(["قال الْكِتَابُ مفيد"], "الكتاب", S)).toEqual([]));
test("case-insensitive english, all pages", () =>
  expect(findMatches(["a Lighthouse", "x", "lighthouse lighthouse"], "LIGHTHOUSE", S))
    .toEqual([{ page: 0, start: 2, end: 12 }, { page: 2, start: 0, end: 10 }, { page: 2, start: 11, end: 21 }]));
test("empty query", () => expect(findMatches(["abc"], "  ", L)).toEqual([]));
test("arabic fixture page 1 text matches its source", async () => {
  const doc = await openPdf(fx("arabic-book.pdf"));
  const flat = (s: string) => s.replace(/\s+/g, " ").trim();
  expect(flat(await pageText(doc, 0))).toContain(flat(readFixtureText("arabic-book.source.txt").split("\n")[0]));
});
test("english fixture: 3 hits on 3 pages", async () => {
  const doc = await openPdf(fx("english-two-column.pdf"));
  const pages = await Promise.all([0, 1, 2].map(i => pageText(doc, i)));
  expect(findMatches(pages, "lighthouse", S).map(m => m.page)).toEqual([0, 1, 2]);
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. For loose mode, normalise the page while keeping an index map `normIndex → originalIndex` (removed chars map to nothing); match in normalised space, translate back; `end` = original index after the last matched char's trailing removed marks.
- [ ] **Step 4:** Run → PASS. If the Arabic extraction test fails because pdf.js returns visual order, stop and report — it decides how the text layer is used (do not weaken the test).
- [ ] **Step 5:** Commit `feat: Arabic-aware search and RTL detection`.

---

### Task 5: Reader viewport (layout maths + page rendering)

**Files:** Create `src/reader/layout.ts`, `src/reader/PageView.tsx`, `src/reader/Reader.tsx`; modify `src/App.tsx`. Test `tests/layout.test.ts`.

**Interfaces:**
- `pageOffsets(heights: number[], gap: number): number[]` (top of each page).
- `visiblePages(scrollTop: number, viewport: number, heights: number[], gap: number, overscan: number): number[]` (0-based, ascending, clamped).
- `spreadGroups(pageCount: number, coverAlone: boolean): number[][]` (1-based page numbers).
- `fitScale(mode: "width" | "page", page: { w: number; h: number }, box: { w: number; h: number }): number`.
- `Reader` props: `{ doc: PDFDocumentProxy; docKey: string; name: string; initialPage?: number; onPageChange(page: number): void; onClose(): void }`.
- `PageView` props: `{ doc; pageNumber: number; scale: number; night: boolean; highlights: Match[] }`; it renders canvas + pdf.js `TextLayer` and **cancels its render task and releases the canvas (`width = height = 0`) on unmount**.

- [ ] **Step 1: Write failing tests:**

```ts
test("offsets", () => expect(pageOffsets([100, 100, 100], 10)).toEqual([0, 110, 220]));
test("visible", () => {
  const h = [100, 100, 100, 100, 100];
  expect(visiblePages(150, 100, h, 10, 0)).toEqual([1, 2]);
  expect(visiblePages(150, 100, h, 10, 1)).toEqual([0, 1, 2, 3]);
  expect(visiblePages(0, 50, h, 10, 2)).toEqual([0, 1, 2]);
});
test("500 pages keeps the window small", () =>
  expect(visiblePages(400_000, 900, Array(500).fill(1100), 12, 2).length).toBeLessThanOrEqual(6));
test("spreads", () => {
  expect(spreadGroups(5, true)).toEqual([[1], [2, 3], [4, 5]]);
  expect(spreadGroups(4, false)).toEqual([[1, 2], [3, 4]]);
  expect(spreadGroups(1, true)).toEqual([[1]]);
});
test("fit", () => {
  expect(fitScale("width", { w: 600, h: 800 }, { w: 1200, h: 800 })).toBe(2);
  expect(fitScale("page", { w: 600, h: 800 }, { w: 1200, h: 800 })).toBe(1);
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `layout.ts`. **Step 4:** Run → PASS.
- [ ] **Step 5:** Build `PageView` and `Reader` (design skills again for the toolbar). Toolbar: page `n / total` input (go-to-page), zoom −/+, fit width, fit page, view mode (continuous / single / two-page), reading direction toggle (auto from `detectRtl` on the first 3 pages' text; two-page groups use `flex-direction: row-reverse` when RTL), night mode (CSS `filter: invert(1) hue-rotate(180deg)` on canvases only), side-panel toggle, close. Page heights come from each page's viewport at scale 1 before rendering. Keyboard on desktop: ←/→/PgUp/PgDn/Home/End, Ctrl+F opens search, Ctrl +/−; arrow keys follow reading direction. Pinch-zoom on phone.
- [ ] **Step 6:** Verify in the browser pane with a dev-only route that loads `fixtures/arabic-book.pdf` and `english-two-column.pdf` (Vite serves `/fixtures` in dev only): text selection copies Arabic in reading order; two-page mode on the Arabic book shows page 1 on the right; night mode is readable.
- [ ] **Step 7:** Commit `feat: reader viewport with lazy page rendering`.

---

### Task 6: Side panel — thumbnails, outline, search

**Files:** Create `src/reader/outline.ts`, `src/reader/Thumbnails.tsx`, `src/reader/Outline.tsx`, `src/reader/SearchPanel.tsx`; modify `Reader.tsx`. Test `tests/outline.test.ts`.

**Interfaces:**
- `type OutlineItem = { title: string; page: number /* 1-based */; depth: number }`; `flattenOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]>` (resolves named and explicit destinations; items whose destination cannot be resolved are dropped).
- `SearchPanel` uses `pageText`, `findMatches`; loose mode on by default, with a toggle "Match Arabic vowels & hamza exactly"; results list grouped by page with a text snippet; next/prev; highlights passed to `PageView`. Text is extracted lazily and cached per page. If `hasText` is false, show `errors.noText`.

- [ ] **Step 1: Write failing tests:**

```ts
test("arabic book outline", async () => {
  const items = await flattenOutline(await openPdf(fx("arabic-book.pdf")));
  expect(items.map(i => i.title)).toEqual(["الفصل الأول", "الفصل الثاني", "الفصل الثالث", "الفصل الرابع"]);
  expect(items.every(i => i.page >= 1 && i.page <= 12)).toBe(true);
  expect(items.map(i => i.page)).toEqual([...items.map(i => i.page)].sort((a, b) => a - b));
});
test("no outline → empty", async () => expect(await flattenOutline(await openPdf(fx("scanned.pdf")))).toEqual([]));
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `outline.ts`. **Step 4:** Run → PASS.
- [ ] **Step 5:** Build the three panels. Thumbnails render at a small fixed scale, lazily (same `visiblePages` logic), current page highlighted, tap to go. On phone the panel is a bottom sheet.
- [ ] **Step 6:** Verify in the browser pane: search "الكتاب" without vowels finds the vowelled occurrences in the Arabic book; outline jumps to each chapter; search in `scanned.pdf` shows the no-text message.
- [ ] **Step 7:** Commit `feat: thumbnails, outline and Arabic-aware search panel`.

---

### Task 7: Recent files and last page

**Files:** Create `src/files/recent.ts`; modify `src/shell/Home.tsx`, `src/App.tsx`, `src-tauri/Cargo.toml` + `lib.rs` (`tauri-plugin-store`). Test `tests/recent.test.ts`.

**Interfaces:**
- `type RecentItem = { key: string; name: string; ref: DocRef; openedAt: number; lastPage: number }`; `key` = the path for `path` refs, the URI for `uri` refs.
- `interface KV { get<T>(k: string): Promise<T | undefined>; set(k: string, v: unknown): Promise<void> }`.
- `class RecentStore { constructor(kv: KV, now = Date.now, max = 20); list(): Promise<RecentItem[]>; touch(ref: DocRef, name: string): Promise<RecentItem>; setLastPage(key: string, page: number): Promise<void>; remove(key: string): Promise<void> }` — stored under KV key `recent`; `touch` keeps the existing `lastPage`.
- `tauriKV(): KV` backed by plugin-store file `waraq.json`.
- `openDocument(ref: DocRef, password?: string)` in `App.tsx`: read → open → on `file-missing` remove from recent and show the error.

- [ ] **Step 1: Write failing tests.** Add `memKV(): KV` (a `Map`-backed KV) to `tests/helpers.ts`, then:

```ts
test("most recent first, deduped, capped", async () => {
  let t = 0; const s = new RecentStore(memKV(), () => ++t, 3);
  for (const p of ["a", "b", "c", "a", "d"]) await s.touch({ kind: "path", path: p }, p);
  expect((await s.list()).map(i => i.key)).toEqual(["d", "a", "c"]);
});
test("last page survives touch", async () => {
  const s = new RecentStore(memKV()); const r = { kind: "path", path: "x" } as const;
  await s.touch(r, "x"); await s.setLastPage("x", 7); await s.touch(r, "x");
  expect((await s.list())[0].lastPage).toBe(7);
});
test("remove", async () => {
  const s = new RecentStore(memKV()); await s.touch({ kind: "path", path: "x" }, "x");
  await s.remove("x"); expect(await s.list()).toEqual([]);
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Wire Home's recent list (name, folder, relative date, page n) and the reader's `onPageChange` (debounced 500 ms) to `setLastPage`; reopening resumes at `lastPage`.
- [ ] **Step 6:** Manual check in `npm run tauri dev`: open a fixture, go to page 5, close, reopen from recent → page 5. Rename the file on disk, click it in recent → "File not found", entry disappears.
- [ ] **Step 7:** Commit `feat: recent files and resume at last page`.

---

### Task 8: Ways to open a file (desktop)

**Files:** Create `src/reader/PasswordPrompt.tsx`; modify `src/shell/Home.tsx`, `src/App.tsx`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (`tauri-plugin-single-instance`, desktop only).

**Interfaces:**
- Rust command `startup_file() -> Option<String>`: the first CLI argument that ends in `.pdf` (case-insensitive) when launched via file association.
- Event `open-file` (payload `String` path) emitted when a second instance is launched with a PDF; the existing window is focused.
- `tauri.conf.json` `bundle.fileAssociations`: `[{ "ext": ["pdf"], "name": "PDF document", "description": "PDF document", "role": "Viewer", "mimeType": "application/pdf" }]`.
- `PasswordPrompt` props `{ name: string; wrong: boolean; onSubmit(pw: string): void; onCancel(): void }` — the password is never stored or logged.

- [ ] **Step 1:** Add Rust test for the argument picker: `pick_pdf_arg(&["waraq.exe", "--flag", "C:\\كتب\\ملف.PDF"]) == Some("C:\\كتب\\ملف.PDF")` and `pick_pdf_arg(&["waraq.exe"]) == None`. Run → FAIL; implement `fn pick_pdf_arg(args: &[&str]) -> Option<String>`; run → PASS.
- [ ] **Step 2:** Implement: "Open PDF" button + picker; drag-and-drop anywhere in the window (Tauri `onDragDropEvent`, only `.pdf`; other types → toast "Only PDF files can be opened in the reader for now"); startup file; single-instance forwarding; password prompt loop on `password-required` / `wrong-password`.
- [ ] **Step 3:** Manual check: `npm run tauri build -- --debug`, install the NSIS build, right-click a PDF → Open with → Waraq opens it; with Waraq already open, double-click another PDF → same window shows it; drag `password.pdf` → prompt; wrong password shows the error; `test123` opens.
- [ ] **Step 4:** Commit `feat: open PDFs by picker, drag-drop, file association, with password prompt`.

---

### Task 9: Android build

**Files:** `src-tauri/gen/android/**` (generated), `src-tauri/tauri.android.conf.json` if needed; modify `src/shell/Layout.tsx` for touch details.

**Interfaces:** Consumes everything above. On Android, `pickPdf()` returns `{ kind: "uri" }` and `readDocument` uses plugin-fs `readFile`.

- [ ] **Step 1:** Set env for the session: `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`, `NDK_HOME=%ANDROID_HOME%\ndk\28.2.13676358` (JDK 17 already set). Run `npm run tauri android init`.
- [ ] **Step 2:** `npm run tauri android build -- --debug --apk --target aarch64` → APK produced. Start an emulator (or a USB device) and `npm run tauri android dev`.
- [ ] **Step 3:** Manual check on Android: copy the fixtures to the device's Download folder; open each from the picker; bottom tabs, Arabic UI, pinch-zoom, search, outline sheet, password prompt all work; the pdf.js worker loads (no "fake worker" warning in `adb logcat`).
- [ ] **Step 4:** Commit `feat: Android build of the reader`.

---

### Task 10: Performance and final verification

- [ ] **Step 1:** Add `scripts/make-big-pdf.mjs` (pdf-lib, 500 pages of standard-font text, written to the scratch/OS temp dir, not committed).
- [ ] **Step 2:** On the desktop build, open the 500-page PDF, scroll from page 1 to 500, then run in devtools `document.querySelectorAll("canvas").length` → ≤ 6 main-view canvases (+ thumbnails visible in the panel). Task Manager memory after scrolling back to page 1 is within ~1.5× of the value at page 1 at first open.
- [ ] **Step 3:** Run `npm test`, `cargo test`, `npm run build` → all pass.
- [ ] **Step 4:** Request code review (`superpowers:requesting-code-review`) on the branch; fix findings.
- [ ] **Step 5:** Commit any fixes; tag `v0.1.0-reader`.
