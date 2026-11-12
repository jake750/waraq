# Document converter, PDF reader & editor — design

Date: 2026-11-12 · Status: draft for approval · Working name: **TBD** (named later, as with Khama)

## 1. Intent

One private, offline app for everyday document work: convert between PDF and
office/text formats, read PDFs comfortably, and mark them up / reorganise them.
It ships on **Windows (PC)** and **Android (phone)**, and both versions carry
**every feature** (user's requirement). Arabic is a first-class citizen: most
converters and readers break Arabic (disconnected letters, reversed order,
lost RTL), and getting this right is what makes the app worth using.

## 2. Decisions made with the user

- PC app + phone app, both with all features.
- **Quality-per-device** (user picked "Option 1"): the PC uses LibreOffice for
  the strongest Office → PDF fidelity; the phone uses lighter built-in engines.
  Same features and formats on both; complex Word layouts may come out a bit
  less faithful on the phone.
- Scope as proposed and accepted: Converter + Reader + Editor; editing the
  *existing* text inside a PDF is out of v1.
- UI: English default, Arabic optional (RTL), smooth Apple-like motion — same
  conventions as the user's Khama app.

## 3. Calls made by Claude (user may override)

- **Stack:** Tauri 2 + React + TypeScript (Vite) + Rust, one codebase for
  Windows and Android — the stack the user already uses for Khama.
- **Most PDF work runs in the TypeScript layer** so it behaves identically on
  both platforms: rendering/reading with `pdfjs-dist`, writing with `pdf-lib`.
  Rust handles files, processes (LibreOffice), downloads and OS integration.
- **No Pandoc.** Text formats (md/html/txt/epub) are handled in TS; HTML → PDF
  goes through the platform's renderer (see §6). Saves size, one less engine.
- **LibreOffice is not bundled.** On the PC the app first looks for an installed
  LibreOffice; if missing, it offers a one-click download of a pinned portable
  build (SHA-256 verified) on first Office conversion. Keeps the installer
  small. (Khama bundled its tools; here LibreOffice is ~300 MB so it differs.)
- **PDF → Word is built in-house in TS** (text with positions from pdf.js →
  lines/paragraphs/columns/simple tables/images → `.docx` via the `docx`
  library), identical on both platforms. Reason: the usual library
  (pdf2docx) depends on PyMuPDF, which is AGPL.
- **License:** app code MIT. No AGPL dependencies (MuPDF, PyMuPDF,
  Ghostscript). External tools invoked as separate processes keep their own
  licenses.
- **Platforms in v1:** Windows + Android only.
- **Output safety:** never overwrite the original — there is no overwrite
  option anywhere in v1. Outputs go next to the source (PC) or to a
  user-chosen folder / Downloads (phone) with a suffix, e.g.
  `report (converted).pdf`, `report (edited).pdf`.
- **Password-protected PDFs:** fully readable. Editing or running a tool on one
  is allowed, but the result is a new *unprotected* copy, and the app says so
  plainly before saving ("The saved copy will not have a password"). No
  second PDF engine is needed for encryption in v1.
- **Arabic text boxes — looking right beats staying editable elsewhere:** added
  text is shaped (HarfBuzz) and drawn into the page as vector glyphs, wrapped so
  *this app* can still select, move and re-edit it (its source text and style
  are stored in the PDF alongside it). In other readers it looks correct but is
  not editable as an annotation. Highlights, drawings, shapes and notes stay
  standard annotations.
- **Phone Office → PDF acceptance bar:** all text, images and tables are
  present; Arabic is correct and RTL; page size, orientation and margins come
  from the document; headings, lists, bold/italic and colours are kept.
  Headers/footers, page numbers and floating images are best-effort. A
  pixel-identical match with Word is a PC-only goal.
- **Fonts:** on the PC, LibreOffice uses the fonts installed in Windows (which
  include Simplified Arabic, Traditional Arabic, Arial, Times New Roman), so
  Goal 1 holds. On the phone the app bundles open-licence look-alikes (e.g.
  Amiri, Noto Naskh Arabic, Noto Sans Arabic, Noto Sans/Serif, Liberation
  fonts, a few MB total) with a substitution table (Traditional Arabic → Amiri,
  Simplified Arabic → Noto Naskh Arabic, Arial → Liberation Sans, …).
- **LibreOffice source:** the official Document Foundation download server,
  a pinned stable version with its SHA-256 in the app's code, installed
  per-user into the app's data folder without needing admin rights (e.g. an
  administrative extract of the official MSI). The pinned version/hash is
  bumped with app releases. If the download fails, the app links to the
  official site so the user can install it, and then detects it.
- **Test fixtures** are made by us (documents written for the project, plus
  public-domain Arabic and English texts), never real personal files or
  copyrighted books, so the repo can go public safely.

## 4. Goals

1. Convert an Arabic Word file with tables on the PC and get a PDF that looks
   the same as in Word.
2. Convert a text-based PDF to Word and get editable text in the right reading
   order, Arabic connected and right-to-left.
3. Open a 300+ page PDF on the phone, scroll smoothly, search in Arabic,
   highlight and add a note, save, and see the result in another PDF reader.
4. Batch: drop many files, pick a target, get them all with clear progress.

## 5. Non-goals (v1) and anti-goals

**Non-goals (v1):** OCR for scanned PDFs (candidate for phase 2, Arabic +
English); editing existing PDF text like Word; adding/removing passwords
(opening password-protected PDFs *is* supported); certificate-based digital
signatures; iOS, macOS, Linux; cloud sync; accounts; EPUB as a reading format
(EPUB is a conversion input only).

**Anti-goals — failure even if it "works":**
- Any file leaves the device (no upload, no telemetry of file content).
- An original file is modified or overwritten, or a saved PDF is corrupt in
  other readers.
- Arabic in any output is disconnected, reversed, or has misplaced harakat.
- AGPL code in the app.
- The app is heavy at rest — the user's laptop is weak; LibreOffice is spawned
  only during a conversion and closed after.

## 6. The three parts

### 6.1 Converter

Conversion matrix (✓ = both platforms, PC = PC only):

| From \ To | PDF | DOCX | TXT | MD | HTML | Images |
|---|---|---|---|---|---|---|
| DOCX | ✓ | – | ✓ | ✓ | ✓ | – |
| DOC (legacy Word) | PC | PC | PC | – | – | – |
| ODT, RTF | ✓ | PC | ✓ | – | – | – |
| TXT, MD, HTML | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| EPUB | ✓ | – | ✓ | – | – | – |
| PDF | – | ✓ | ✓ | ✓ | – | PNG/JPG per page |
| JPG/PNG/WEBP | ✓ (one or many → one PDF) | – | – | – | – | – |

**Engines**
- PC, Office → PDF/DOCX: LibreOffice headless (`soffice --convert-to`), one
  conversion at a time, with timeout and a clear error if it fails.
- Phone, Office → PDF: DOCX/ODT/RTF → HTML in TS (e.g. `docx-preview` or
  `mammoth`, an RTF parser, ODT via its XML) → Android WebView print to PDF
  through a small Kotlin Tauri plugin. The WebView shapes Arabic correctly.
- PC, text formats → PDF: same HTML route, through WebView2's print-to-PDF or
  LibreOffice (builder's choice; result must match the phone's quality or better).
- **Legacy `.doc` on the phone is a known gap:** no usable engine exists on
  Android. The app explains this and suggests the PC version.

**PDF tools (both platforms):** merge, split (ranges / every N pages /
each page), extract pages, delete, rotate, reorder, insert blank page or pages
from another PDF, compress (re-encode/downscale embedded images + object
streams; show before/after size; never produce a larger file — keep the
original if so), PDF → images, images → PDF (page size, margins, orientation).

**Batch & queue:** multi-file drop/pick, per-file progress, cancel, results
list with "open" / "show in folder" (PC) / "share" (phone).

### 6.2 Reader

- Continuous scroll and single/two-page modes; two-page mode respects
  right-to-left page order for Arabic books (auto-detect, manual toggle).
- Thumbnails, outline/bookmarks, go-to-page, zoom / fit width / fit page.
- Search that works in Arabic and ignores tashkeel and hamza variants
  (optional toggle); text selection and copy in the right order.
- Night reading mode, remembers last page per file, recent files list.
- Opens password-protected PDFs (password entered in the app's own prompt).
- Becomes an "Open with" target: Windows file association for `.pdf`,
  Android intent filter for PDFs and the share sheet.
- Other formats (DOCX, EPUB…) open by converting to a temporary PDF.

### 6.3 Editor

- Highlight, underline, strikethrough on selected text.
- Add text boxes (font, size, colour, alignment) — **Arabic must be shaped**
  (e.g. HarfBuzz via `harfbuzzjs` with an embedded Arabic-capable font such as
  Noto Naskh Arabic / Noto Sans Arabic), English and mixed text too.
- Freehand drawing, rectangle, ellipse, line/arrow.
- Images and signatures: draw a signature or import an image; saved
  signatures reusable across files.
- Sticky-note comments.
- Fill AcroForm fields.
- Page operations from §6.1 inline (thumbnail strip with drag-to-reorder).
- Undo/redo for the whole session.
- Save keeps marks as standard PDF annotations (editable in other readers),
  except added text boxes (see §3); a "Flatten" option on export bakes
  everything into the page. Save always writes a new file (see §3).

## 7. App shell & design

- Home: three entries (Convert, Read, Edit & tools) + recent files.
- PC: sidebar layout, drag-and-drop anywhere. Phone: bottom tabs, large touch
  targets, works one-handed.
- English default, Arabic optional with full RTL mirroring; every string in
  both languages through one i18n module.
- Light and dark themes; motion is quick and soft (asymmetric ease-out,
  staggered entrances), never slows down work.
- Design work uses the design skills (impeccable / ui-craft / motion-design);
  build follows writing-plans → test-driven development → code review.

## 8. Constraints

- Offline for everything except the optional LibreOffice download.
- Must run well on a weak laptop and a mid-range Android phone; large PDFs
  render lazily (only visible pages), conversion work off the UI thread.
- Android: Storage Access Framework for opening/saving; no broad storage
  permission.
- This PC already has the Android SDK/NDK and JDK 17 (used for Khama).

## 9. Testing

A fixture set checked into the repo: Arabic DOCX with tables and columns,
mixed Arabic/English DOCX, RTF/ODT samples, an Arabic book PDF, a two-column
English PDF, a scanned (image-only) PDF, a password-protected PDF, a form PDF,
a 500-page PDF. Automated tests for conversion/tool logic (output opens, page
counts, text order, Arabic text extracted back matches), plus a manual check
list per release on Windows and a real Android phone.

## 10. Delivery

- Windows installer and signed Android APK, built in CI and published to
  GitHub Releases (repo to be created — ask the user before creating/pushing).
  Unlike Khama, a PDF app is allowed on the Play Store; that's a later choice.
- Suggested build order: app shell + Reader → PDF tools → Converter (PC
  LibreOffice path, then phone path) → Editor → Android polish → release.

## 11. Left to the builder

Exact libraries within the constraints above, component/module structure,
PDF → DOCX layout heuristics, compression algorithm details, HTML → PDF route
on the PC, file naming details, app name and logo (to be decided with the user
later).
