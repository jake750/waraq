# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Waraq (ورق)**: a document converter, PDF reader and PDF editor for Windows (Tauri desktop) and
Android. The UI is Arabic-first (RTL), with a full English translation (`src/i18n.ts`). Windows
conversions go through a per-user LibreOffice install; Android uses built-in engines only. The app
reaches the network for only two things: that one optional LibreOffice download (SHA-256 pinned), and update checks against this repo's GitHub
releases (`latest.json`; automatic at most once a day, can be turned off in Settings). The
app never overwrites an opened file: every operation writes a new file (suffixed, e.g. `"name
(edited).pdf"`; Android writes to `Download/Waraq`).

Talk to the user in Arabic; code, comments, and commit messages are English.

## Commands

```bash
npm run dev                 # Vite dev server on :1420 (browser-only preview, see below)
npm test                    # vitest run — the whole suite
npx vitest run <path>       # a single test file
npx vitest run -t "<name>"  # a single test by name
npx tsc --noEmit -p .       # typecheck
npm run fixtures            # regenerate fixtures/ via scripts/make-fixtures.mjs

npx tauri dev                                      # full desktop app (Tauri + webview)
npx tauri build                                    # Windows installer (bundle.targets = "all")
npx tauri android dev                              # Android, device/emulator
npx tauri android build --apk --target aarch64     # release APK, arm64 (phones)
npx tauri android build --apk --target x86_64      # release APK, emulator testing

cd src-tauri && cargo test  # Rust unit tests (files.rs, office.rs, ...)
```

**Updates and signing.** `bundle.createUpdaterArtifacts` is on, so every `tauri build` needs the
updater signing key in the environment (`TAURI_SIGNING_PRIVATE_KEY` = path or contents of
`~/.tauri/waraq.key`, plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`); the matching public key is
`plugins.updater.pubkey` in `tauri.conf.json`. Never commit the private key. Releases come from
`.github/workflows/release.yml`: bump `version` in `tauri.conf.json` (and `package.json`/`Cargo.toml`),
push a `vX.Y.Z` tag, and tauri-action builds Windows + macOS, signs them and publishes `latest.json`
(the repo secrets `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` must be set). Desktop installs update
through `tauri-plugin-updater` (`src/update/native.ts`); Android can't self-update a sideloaded
APK, so `update.rs`'s `latest_release` reads the same `latest.json` and the app opens the release
page — attach the APK (signed with the release keystore below) to each release by hand. Android only
installs an APK over an existing one signed with the same key, so every release APK must come from
`waraq-release.keystore`; anyone still on an older debug-signed APK has to uninstall it once.

The GitHub Actions workflow `.github/workflows/build-macos.yml` (`workflow_dispatch`) builds a
universal macOS `.dmg`/`.app` via `tauri build --target universal-apple-darwin`. It must run on
`macos-15` — `macos-14` is rejected outright for this account and `macos-13`/`macos-13-large`
queue forever without ever getting a runner. The macOS app is unsigned (no Apple Developer
certificate), so it needs "right-click → Open" past Gatekeeper on first launch.

**Android signing.** A real release keystore exists at `~/.android/waraq-release.keystore`
(alias `waraq`) — deliberately outside the repo, never committed. `src-tauri/gen/android/app/
build.gradle.kts` reads `src-tauri/gen/android/app/keystore.properties` (gitignored by Tauri's own
generated `.gitignore`; holds `storeFile`/`storePassword`/`keyAlias`/`keyPassword`) and wires a
`release` `signingConfig` from it when that file exists, so `npx tauri android build --apk
--target aarch64` produces an APK already signed with the release key — no manual zipalign/
apksigner pass needed. Without that properties file (e.g. a fresh clone, or CI), release builds
stay unsigned, same as before. **The repo is public** — the keystore and its password must never
be added to git; ask the user before touching `.gitignore` entries that cover them. The user holds
the actual password (asked for it once, keep it out of this file and out of anything committed).

**Browser preview without Tauri** (`npm run dev` + the Browser pane, no `tauri dev`): there is no
Tauri IPC bridge, so `readDocument` (`src/files/docRef.ts`) special-cases
`DocRef = { kind: "path", path: "dev:/fixtures/x.pdf" }` to `fetch()` the file straight from Vite's
static server. The "Open a file" button and real drag-drop (`WaraqPlugin`'s `onDragDropEvent`) don't
work in this mode — only the `dev:/fixtures/...` entries already in "Recent" are useful for manual
checks.

## Architecture

**Platform boundary.** Everything platform-specific (reading files, saving output, printing HTML to
PDF, running LibreOffice, picking images) is injected as a `deps` object into otherwise pure,
Node-testable functions — see `RunDeps` in `src/convert/run.ts` and `appDeps()` in
`src/convert/native.ts`. `src/platform.ts` (`isAndroid()`/`isDesktop()`, by `navigator.userAgent`)
is the only place that branches on OS; most feature code never checks it directly. A `DocRef`
(`src/files/docRef.ts`) is either `{ kind: "path" }` (desktop filesystem path) or `{ kind: "uri" }`
(Android `content://` URI from a picker/intent) — reading, naming, and persisting access all branch
on this union, not on platform.

**Rust side** (`src-tauri/src/`) is a thin set of `#[tauri::command]`s, one file per concern:
`files.rs` (read/save/open/reveal — `save_output` takes either a JSON or raw IPC body),
`office.rs` (Windows-only: finds/installs LibreOffice per-user with a pinned, SHA-256-checked MSI,
serializes conversions through a `Mutex` so only one runs at a time), `print.rs` (HTML → PDF via the
system webview's print-to-PDF, WebView2 on Windows / WebView on Android), `mobile.rs` (Android
intents: incoming shared/opened files, persisting a picked URI's permission, `android_display_name`
for URIs with no real filename), `launch.rs` (parse the file path handed to a second instance /
process launch). `lib.rs` wires up plugins and registers every command.

**Android plugin** (`src-tauri/gen/android/app/src/main/java/com/jake750/waraq/WaraqPlugin.kt`)
owns the VIEW/SEND intent filter: `load()` reads the launch intent, `onNewIntent` queues files
opened while already running, and the JS side polls `android_incoming` at startup and on
`visibilitychange`.

**Conversion pipeline** (`src/convert/`): `formats.ts` picks an engine for an
(input format, target format) pair; `run.ts` executes one `Job` against `RunDeps`, writing a new
file via `save()` (never overwriting). Three engine families: native JS (`fromPdf.ts`/`fromHtml.ts`/
`toHtml.ts`/`epub.ts`/`imagesToPdf.ts`, using pdf.js + pdf-lib + mammoth/turndown), LibreOffice
(desktop only, via the Rust `office_convert` command), and print-to-PDF (`printPdf`, for
HTML → PDF where a real layout engine is wanted). `sanitize.ts` strips everything that could run
code or reach the network from converted HTML (scripts, handlers, non-data: `src`/`href`,
`background`/`poster`/etc.) before it's ever rendered or printed; `fromHtml.ts`'s `htmlDocument()`
also sets a strict CSP on the printable page. `exif.ts` reads JPEG orientation so phone photos don't
come out sideways across images→PDF, the editor, and compress.

**Reader** (`src/reader/`): `PageView.tsx` renders one page per `pdfjs-dist` (aliased in
`vite.config.ts` to the **legacy** build — needed for older Android WebViews — with a custom
`pdfjsLigatureFix` Vite plugin). `night` mode is a CSS `filter: grayscale(1) invert(0.92)` on the
canvas only (not the transparent text layer) — grayscale *before* invert so any non-black ink
(colored headings, stamps) collapses to a clean tone instead of a wrong hue. Search highlights and
the text layer are separate absolutely-positioned overlays kept in sync via `convertToViewportPoint`.

**Editor** (`src/editor/`): marks (highlight/underline/strike/pen/shapes/text boxes/notes/images/
signatures) live in PDF user space with undo/redo via a history reducer. `write.ts` turns marks into
either standard PDF annotations with appearance streams (so any reader shows them) or, when
flattening, draws them directly into page content; text boxes are shaped with `@pdf-lib/fontkit`
and written as real selectable text (bidi via `bidi.ts`/`visualRuns`), not images. `forms.ts` lists
and fills AcroForm fields with hand-built appearance streams (pdf-lib's own form-field appearances
break mixed Arabic/Latin text) and tolerates widgets with no existing `/AP` when flattening.

**Tools** (`src/tools/`): `pages.ts`'s `assemble()` builds a new PDF from a `PageSpec[]` and accepts
either raw bytes or an already-`loadPdf`'d `PDFDocument` per source, so multi-output jobs (e.g.
split) parse each source once. `compress.ts` re-encodes embedded JPEGs via a pluggable `Reencode`
function (kept out of the pure logic so it's Node-testable). Merge/split/organize drop AcroForm
fields and the outline (by design — the editor is where forms are meant to survive).

**i18n**: `src/i18n.ts` exports one `en` object and one `ar: typeof en` object, so a missing Arabic
string fails `tsc`, not just a runtime fallback.

**Tests**: `tests/` mirrors `src/convert|editor|tools`, plus top-level tests for the reader/text/
files layers; `tests/helpers.ts` has fixture loaders shared across suites. `fixtures/` is generated
by `npm run fixtures` (see `fixtures/README.md` for how each file was built — all content is
original, so the repo can stay public). Rust tests live next to the code in `src-tauri/src/*.rs`
under `#[cfg(test)]`.
