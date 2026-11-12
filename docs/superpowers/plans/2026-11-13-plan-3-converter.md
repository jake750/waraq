# Plan 3 — Converter (PC + phone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Convert between PDF and office/text/image formats on Windows and Android, as in spec §6.1, with a batch queue, and let Home/Reader open non-PDF files by converting to a temporary PDF.

**Architecture:** Every input becomes either (a) a PDF handled by pdf.js/pdf-lib, (b) sanitized HTML (TXT, MD, HTML, DOCX via mammoth, ODT, RTF, EPUB), or (c) images. Outputs are produced from those: HTML → PDF through the platform browser engine's print-to-PDF (WebView2 `PrintToPdf` on Windows, Android `WebView.createPrintDocumentAdapter` in a Kotlin plugin); HTML → DOCX/TXT/MD/HTML in TS; PDF → TXT/MD/DOCX from the Plan 1 layout text; PDF → PNG/JPG via pdf.js canvas; images → PDF via pdf-lib. On the PC, Office inputs (DOCX/DOC/ODT/RTF → PDF/DOCX) go through LibreOffice headless, found installed or downloaded per-user (pinned 26.2.7 MSI, SHA-256 verified, administrative extract).

**Tech Stack:** existing (Tauri 2, React 19, TS, pdf.js 6.5, pdf-lib) + mammoth (BSD-2), marked (MIT), turndown (MIT), docx (MIT), jszip (MIT), happy-dom (dev, tests), tauri-plugin-opener; Rust: webview2-com 0.39 / windows 0.62 (already in the tree via wry), sha2, reqwest (blocking off) or ureq.

**Spec:** docs/superpowers/specs/2026-11-12-document-converter-design.md

## Global Constraints

- Matrix (✓ both, PC = PC only): DOCX→PDF,TXT,MD,HTML ✓ · DOC→PDF,DOCX,TXT PC · ODT,RTF→PDF,TXT ✓, →DOCX PC · TXT/MD/HTML→PDF,DOCX,TXT,MD,HTML ✓ · EPUB→PDF,TXT ✓ · PDF→DOCX,TXT,MD,PNG,JPG ✓ · JPG/PNG/WEBP→PDF ✓ (many → one).
- Never overwrite: outputs get a suffix `name (converted).ext`, then ` (2)`, ` (3)` … if taken. PC: next to the source. Phone: Downloads/Waraq.
- Nothing leaves the device; the only network call is the optional LibreOffice download from download.documentfoundation.org, SHA-256 `480fecf759fc6393bd614fbf43753eb95a8198fc1a065d41b727e3b664cd1e59` for `LibreOffice_26.2.7_Win_x86-64.msi` (373 121 024 bytes).
- LibreOffice runs only during a conversion, one at a time, private profile (`-env:UserInstallation`), 180 s timeout, killed after.
- Arabic must stay connected and RTL in every output: HTML gets `dir="auto"` per block and Arabic-capable fonts; DOCX paragraphs with Arabic get `bidirectional: true` + `rightToLeft` runs.
- Generated HTML has no scripts (sanitized); converting never executes document code.
- All strings in en + ar.

## Review Focus

1. A DOCX with Arabic tables → PDF keeps connected RTL text and the table (PC via LibreOffice; phone via HTML print).
2. A file name that already has a converted sibling → ` (2)` suffix, original untouched.
3. LibreOffice missing → one clear prompt (download 373 MB / use built-in engine / cancel); download failure or hash mismatch → message + link to the official site, no half-installed state.
4. A corrupt/renamed DOCX or EPUB → per-file error in the queue; the rest of the batch continues.
5. Batch of 20 files with one cancelled → others finish; cancelled one leaves no partial output file.

---

### Task 1: Formats and routing (pure)

**Files:** Create `src/convert/formats.ts`; Test `tests/convert/formats.test.ts`.

**Produces:**
- `type Fmt = "pdf"|"docx"|"doc"|"odt"|"rtf"|"txt"|"md"|"html"|"epub"|"png"|"jpg"|"webp"`
- `type Target = "pdf"|"docx"|"txt"|"md"|"html"|"png"|"jpg"`
- `fmtOf(name: string): Fmt | null` (by extension, case-insensitive; .htm→html, .jpeg→jpg, .markdown→md)
- `targetsFor(f: Fmt, platform: "desktop"|"android"): Target[]` — the matrix above.
- `outputName(input: string, target: Target, taken: (n: string) => boolean): string` — `report.docx`→`report (converted).pdf`; same-format targets never offered; image outputs `name (page 1).png` handled by caller.
- `engineFor(f: Fmt, t: Target, platform, loAvailable: boolean): "libreoffice"|"html"|"pdf"|"images"`.

Tests: every row of the matrix both platforms; `.DOCX`/`.Htm`/`.jpeg`; outputName with 0/1/2 taken siblings; engine: docx→pdf desktop+lo = libreoffice, desktop no lo = html, android = html; doc on android → no targets.

### Task 2: Text-format readers to HTML (TS)

**Files:** Create `src/convert/toHtml.ts`, `src/convert/rtf.ts`, `src/convert/odt.ts`, `src/convert/epub.ts`, `src/convert/sanitize.ts`; fixtures via `scripts/make-office-fixtures.mjs` (docx built with the `docx` lib: Arabic + English paragraphs, heading, bold, list, a 3×3 Arabic table; odt and epub zipped by hand with jszip; rtf written by hand with `\ansicpg1256` + `\uN?` escapes; md/txt/html); Tests `tests/convert/toHtml.test.ts` (vitest `// @vitest-environment happy-dom`).

**Produces:** `toHtml(bytes: Uint8Array, f: Fmt): Promise<{ title: string; body: string }>` — body is sanitized HTML (no script/style/iframe/object/on* attrs/javascript: URLs; images as data: URLs only).

Tests: each format yields the Arabic sentence intact (NFC) and the heading; DOCX table → `<table>` with 9 cells; RTF cp1256 bytes and `ᕵ?` both decode to Arabic; EPUB chapters in spine order; sanitize strips `<script>` and `onclick`; corrupt zip → throws `ConvertError("bad-input")`.

### Task 3: HTML writers (TS): TXT, MD, HTML, DOCX

**Files:** Create `src/convert/fromHtml.ts`; Test `tests/convert/fromHtml.test.ts` (happy-dom).

**Produces:** `htmlToText(body)`, `htmlToMarkdown(body)` (turndown + tables as GFM), `htmlDocument(title, body, opts?: PageOpts)` (full page, `<meta charset>`, fonts stack incl. "Traditional Arabic","Simplified Arabic","Noto Naskh Arabic","Amiri", Arial; `dir="auto"` on blocks; print CSS `@page { size; margin }`), `htmlToDocx(title, body): Promise<Uint8Array>` (docx lib: h1–h3, p, b/i/u, ul/ol, table, img data: URL, Arabic paragraphs bidirectional).
`type PageOpts = { size: "A4"|"Letter"; landscape: boolean; marginMm: number }`.

Tests: text keeps block line breaks; md has `#` heading and `|` table; docx output re-read with mammoth contains the Arabic sentence and the paragraph XML has `<w:bidi/>`.

### Task 4: PDF readers (TS): TXT, MD, DOCX, images

**Files:** Create `src/convert/fromPdf.ts`; Test `tests/convert/fromPdf.test.ts`.

**Produces:** `pdfParagraphs(doc): Promise<Para[]>` (`Para = { text; size; page; rtl }`; lines from `buildPageLayout`, joined into paragraphs when the vertical gap < 1.5× line height; heading when size ≥ 1.25× body median), `pdfToText(doc)`, `pdfToMarkdown(doc)`, `pdfToDocx(doc)` (headings, paragraphs, page breaks, RTL), `renderPageImage(doc, i, fmt: "png"|"jpg", dpi: number): Promise<Blob>` (app only, canvas).

Tests: arabic-book.pdf → text contains the vowelled sentence in logical order; md starts with `# الفصل الأول`; docx re-read by mammoth contains Arabic sentence; english-two-column → "lighthouse" present.

### Task 5: Images → PDF (TS)

**Files:** Create `src/convert/imagesToPdf.ts`; Test `tests/convert/imagesToPdf.test.ts`.

**Produces:** `imagesToPdf(images: { bytes: Uint8Array; fmt: "png"|"jpg" }[], opts: PageOpts & { fit: "page"|"image" }): Promise<Uint8Array>` (pdf-lib; WEBP is turned into PNG by the caller via canvas). Tests: 2 images → 2 pages; `fit:"image"` page size equals image size in pt; A4 margins honoured.

### Task 6: Native file IO for outputs

**Files:** Modify `src-tauri/src/files.rs` (+ `write_new_file(dir, name, bytes) -> path` choosing ` (2)`…, `make_temp_path(ext) -> path`); Rust tests. Android: Kotlin plugin `WaraqPlugin.kt` (`saveToDownloads(name, mime, base64) -> uri`, `displayName(uri)`, `share(uri, mime)`), Rust plugin shim `src-tauri/src/mobile.rs`; TS `src/files/output.ts` (`saveOutput(srcRef, name, bytes) -> SavedRef`, `revealOutput`, `openOutput`). Desktop open/reveal via tauri-plugin-opener.

Rust tests: write twice → second gets ` (2)`; Arabic dir with spaces; never truncates an existing file (create_new).

### Task 7: HTML → PDF on Windows (WebView2) and Android (WebView print)

**Files:** Create `src-tauri/src/print.rs` (`#[tauri::command] html_to_pdf(app, html: String, out: String, opts: PageOpts)`: write html to a temp file, hidden `WebviewWindow` label `print-<n>` at its file URL, on load Finished → `with_webview` → `ICoreWebView2_7::PrintToPdf` with `CreatePrintSettings` (size, orientation, margins, backgrounds on, header/footer off); oneshot result; window closed after; 60 s timeout). Android: `WaraqPlugin.htmlToPdf(html, out, opts)` with an off-screen WebView + `PrintDocumentAdapter` driven by a helper in package `android.print` (`PdfPrinter.kt`). TS `src/convert/printPdf.ts` → `htmlToPdf(doc: string, opts): Promise<Uint8Array>`.

Verification: manual — convert arabic fixture HTML; open the output in the reader and in Chrome; text selectable, Arabic connected (no automated test: needs the native engine; ledger it).

### Task 8: LibreOffice locate / download / run (PC)

**Files:** Create `src-tauri/src/office.rs`: `find_soffice(app_data) -> Option<PathBuf>` (app-data `lo/` extract, Program Files, x86, `LIBREOFFICE_PATH` env); `#[tauri::command] office_status`, `office_install(on_progress: Channel<u64>)` (download to temp, stream SHA-256, compare, `msiexec /a <msi> /qn TARGETDIR=<appdata>\lo`, verify `program\soffice.exe`, delete msi; on any error remove the partial dir), `office_convert(input, target, out_dir) -> PathBuf` (copy input to a temp dir with ASCII name, `soffice --headless --norestore -env:UserInstallation=file:///<appdata>/lo-profile --convert-to <filter> --outdir <tmp> <file>`, 180 s timeout + kill, move result to the final non-colliding name). Filters: pdf → `pdf:writer_pdf_Export`, docx → `docx:"MS Word 2007 XML"`, txt → `txt:Text (encoded):UTF8`.

Rust tests: hash check function (good/bad); filter mapping; `find_soffice` with a fake tree in tempdir; ASCII temp name for Arabic input.
Verification: real install from the cached MSI, convert the Arabic DOCX fixture → PDF, open it in the reader.

### Task 9: Convert screen + queue

**Files:** Create `src/convert/queue.ts` (pure state machine: `Job = { id; name; ref; fmt; target; state: "queued"|"running"|"done"|"error"|"cancelled"; progress?; output?; error? }`, `reduce(state, action)`, runs one job at a time, cancel), `src/convert/run.ts` (`runJob(job, deps, signal)` dispatching to engines), `src/convert/ConvertScreen.tsx`, `src/convert/convert.css`, LibreOffice prompt dialog; nav item "Convert" (desktop sidebar + phone tab), i18n keys; Home accepts any convertible file (non-PDF → offered "Convert" / "Open" (temp PDF)). Tests `tests/convert/queue.test.ts`: order, one-at-a-time, cancel queued and running, error doesn't stop the batch, "convert all to X" assigns only supported targets.

### Task 10: Verify + review

`npm test`, `cargo test`, `npm run build`; desktop: convert each fixture to each target, open outputs; Android emulator: DOCX→PDF, PDF→DOCX, images→PDF, outputs in Downloads/Waraq; ledger results. Final whole-branch review happens once after all plans.
