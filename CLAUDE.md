# CLAUDE.md

## What this is

**Waraq (ورق)**: document converter, PDF reader and PDF editor for Windows/macOS (Tauri desktop) and Android.
Arabic-first UI (RTL) with a full English translation (`src/i18n.ts`). Desktop conversions use a per-user
LibreOffice install; Android uses built-in engines only. Network use is limited to that optional LibreOffice
download (SHA-256 pinned) and update checks against this repo's GitHub releases (`latest.json`, at most once a
day, can be turned off in Settings). The app never overwrites an opened file: every operation writes a new one
(e.g. `"name (edited).pdf"`; Android writes to `Download/Waraq`).

Talk to the user in Arabic; code, comments and commit messages are English. The user merges PRs themself.

## Commands

```bash
npm run dev                 # Vite on :1420 (browser-only preview, see below)
npm test                    # vitest, whole suite;  npx vitest run <path> | -t "<name>"
npx tsc --noEmit -p .       # typecheck
npm run fixtures            # regenerate fixtures/ (scripts/make-fixtures.mjs)
npx tauri dev               # desktop app;  npx tauri build = installers
npx tauri android build --apk --target aarch64   # release APK (x86_64 for the emulator)
cd src-tauri && cargo test  # Rust unit tests
```

## Releases and signing

- **Always release (standing rule from the user):** every change that reaches `main` ships in a new release,
  without asking. Once a feature/fix PR is merged, open a `chore(release): vX.Y.Z` PR (patch bump unless told
  otherwise), push the `vX.Y.Z` tag on that release commit, wait for the workflow, then build the Android APK
  in the main checkout and attach it to the release. The CLAUDE.md change for a release rides in that PR.
- **Release:** bump `version` in `tauri.conf.json`, `package.json`, `package-lock.json` and `Cargo.toml`
  (plus the `waraq` entry in `Cargo.lock`), then push a `vX.Y.Z` tag. `.github/workflows/release.yml` builds
  Windows and universal macOS, signs the updater bundles and publishes `latest.json`.
- **macOS:** only `macos-15` runners work (14 rejected, 13 never starts); "not acquired by Runner" → `gh run
  rerun <id> --failed`. The app is unsigned: users need right-click → Open once.
- **Updater key:** `bundle.createUpdaterArtifacts` is on, so builds need `TAURI_SIGNING_PRIVATE_KEY`
  (`~/.tauri/waraq.key`) and `_PASSWORD`, which are also repo secrets. The public key lives in
  `plugins.updater.pubkey`. Desktop updates itself through `tauri-plugin-updater` (`src/update/`).
- **Android updates:** Android can't self-update a sideloaded APK, so `update.rs`'s `latest_release` reads the
  same `latest.json` and the app opens the release page. Build the APK locally and attach it by hand:
  `gh release upload vX.Y.Z Waraq_X.Y.Z_android.apk --clobber`.
- **Android signing:** the keystore is `~/.android/waraq-release.keystore` (alias `waraq`), outside the repo.
  `build.gradle.kts` signs release builds only when `src-tauri/gen/android/app/keystore.properties` exists.
  That file is gitignored and exists only in the main checkout, not in worktrees, so build release APKs
  there. Every release APK must use this key, or Android refuses to install it over the old one.
- **Public repo:** never commit or write down keys, keystores or passwords; ask before touching their `.gitignore`.
- **Line endings** mix LF/CRLF: keep each file's own (`sed -i`/Python text mode rewrite them → whole-file diffs).

**Browser preview without Tauri** (`npm run dev` in the Browser pane): there's no IPC, so `readDocument`
(`src/files/docRef.ts`) `fetch()`es `DocRef { kind: "path", path: "dev:/fixtures/x.pdf" }` from Vite. "Open a
file" and drag-drop don't work. Seed Recent via `localStorage["waraq.kv.recent"]`. If :1420 is taken (the
main checkout's server), run `vite --port <other> --strictPort` from a temporary launch.json entry.

## Architecture

- **Platform boundary:** platform work (reading, saving, print-to-PDF, LibreOffice, image picking) is
  injected as `deps` into pure, Node-testable code (`RunDeps` in `src/convert/run.ts`, `appDeps()` in
  `native.ts`). `src/platform.ts` is the only OS branch. A `DocRef` is `{kind:"path"}` (desktop) or
  `{kind:"uri"}` (Android `content://`), and the code branches on that union, not on the platform.
- **Rust** (`src-tauri/src/`), thin commands, one file per concern: `files.rs` (read/save/open/reveal),
  `office.rs` (LibreOffice behind a `Mutex`), `print.rs` (HTML → PDF via webview), `mobile.rs` (Kotlin plugin:
  intents, URIs, names, `android_immersive`), `launch.rs`, `update.rs` (Android release check). `lib.rs`
  registers all; desktop-only plugins (updater, process) sit under `#[cfg(desktop)]`.
- **Android plugin** (`gen/android/.../WaraqPlugin.kt`) owns the VIEW/SEND intent filter: `load()` and
  `onNewIntent` queue files and JS polls `android_incoming`. It also handles print, share and immersive mode.
- **Conversion** (`src/convert/`): `formats.ts` picks the engine and `run.ts` runs one `Job`. The engines are
  native JS (pdf.js, pdf-lib, mammoth/turndown), LibreOffice (desktop) or print-to-PDF. `sanitize.ts` strips
  anything that could run code or reach the network from converted HTML, and `htmlDocument()` adds a strict
  CSP. `exif.ts` fixes photo orientation.
- **Reader** (`src/reader/`): pdf.js is the **legacy** build (old Android WebViews) + `pdfjsLigatureFix`.
  Make page canvases with `pageCanvas()` (`src/pdf/pageCanvas.ts`, `dir="ltr"`): a canvas inherits RTL and
  garbles pdf.js Arabic. Night mode: `grayscale(1) invert(0.92)` on the canvas only. `fullscreen.ts` sets
  `:root[data-fullscreen]` (hides chrome), plus window full screen (desktop) or immersive bars (Android).
- **Editor** (`src/editor/`): marks live in PDF user space with history undo/redo. `write.ts` writes
  annotations with appearance streams, or flattens them. Text boxes are real shaped text (fontkit, `bidi.ts`).
  `forms.ts` hand-builds field appearances, because pdf-lib's own break mixed Arabic and Latin.
- **Tools** (`src/tools/`): `assemble()` takes bytes or a loaded `PDFDocument` per source. `compress.ts` gets
  its `Reencode` injected. Merge, split and organize drop forms and the outline by design.
- **UI shell:** tokens in `src/theme.css` (ink `--accent`, paper surfaces, `.fold` corner motif). `Layout.tsx`
  folds the sidebar to a rail while reading/editing; Settings (with updates) opens as a sheet.
- **i18n:** `ar: typeof en`, so a missing Arabic string fails `tsc`. `arCount()` handles Arabic plurals.
- **Tests:** `tests/` mirrors `src/`; fixtures are original content (`fixtures/README.md`). Env is node; add
  `// @vitest-environment happy-dom` for DOM tests. Rust tests sit next to the code.
