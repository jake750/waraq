# CLAUDE.md

## What this is

**Waraq (ورق)**: document converter, PDF reader and PDF editor for Windows/macOS (Tauri desktop) and Android.
Arabic-first UI (RTL) with a full English translation (`src/i18n.ts`). Desktop conversions use a per-user
LibreOffice install; Android uses built-in engines only. Network use is limited to that optional LibreOffice
download (SHA-256 pinned) and update checks against this repo's GitHub releases (`latest.json`, at launch, at most once an
hour, can be turned off in Settings). The app never overwrites an opened file: every operation writes a new one
(e.g. `"name (edited).pdf"`; Android writes to `Download/Waraq`).

Talk to the user in Arabic; code, comments and commit messages are English. **No PRs (user's choice,
2026-11-14):** commit finished work and push it straight to `main` (`git push origin HEAD:main` from a
worktree, after rebasing on `origin/main`); never wait for the user to merge.

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

## Definition of done

A change is done when: `npx tsc --noEmit -p .` and `npm test` pass (the release workflow's `check` job runs
both and blocks the release otherwise); new logic has a test next to its mirror in `tests/`; every new string
exists in English and Arabic; UI changes were looked at in the browser preview at phone width (375px) and in
dark mode; Rust changes pass `cargo test`; and nothing writes over an opened file.

## Releases and signing

- **Always release (standing rule from the user):** every change to the app that reaches `main` ships in a
  new release, without asking: anything under `src/`, `src-tauri/` (code, config, icons) or `public/`, or a
  dependency change. Changes to only CI, scripts, tests, fixtures or docs (CLAUDE.md, README) do not get a
  release of their own; they ride in the next one. After pushing the change, run `npm run release` (patch; or `minor`/`major`/`X.Y.Z`): it
  bumps `tauri.conf.json`, `package.json`, `package-lock.json`, `Cargo.toml` and `Cargo.lock`, commits and
  pushes to `main`. `.github/workflows/release.yml` sees an untagged version on main, builds Windows and
  universal macOS, signs the updater bundles, publishes `latest.json`, creates the tag, and its `android` job
  builds the signed APK and attaches it (`Waraq_X.Y.Z_android.apk`). Watch runs with `gh run watch <id>` in the background,
  never by polling.
- **macOS:** only `macos-15` runners work (14 rejected, 13 never starts); "not acquired by Runner" → `gh run
  rerun <id> --failed`. The app is unsigned: users need right-click → Open once.
- **Updater key:** `bundle.createUpdaterArtifacts` is on, so builds need `TAURI_SIGNING_PRIVATE_KEY`
  (`~/.tauri/waraq.key`) and `_PASSWORD`, which are also repo secrets. The public key lives in
  `plugins.updater.pubkey`. Desktop updates itself through `tauri-plugin-updater` (`src/update/`).
- **Android updates:** `update.rs`'s `latest_release` reads the same `latest.json`; `android_download_update`
  downloads the release APK into the app cache and `installApk` (WaraqPlugin.kt) opens the system installer
  (it opens the "install unknown apps" setting once). `UpdatePrompt` (`Layout.tsx`) offers updates at launch. The `android` job in `release.yml` attaches the
  APK; by hand: `gh release upload vX.Y.Z Waraq_X.Y.Z_android.apk --clobber`.
- **Android signing:** the keystore is `~/.android/waraq-release.keystore` (alias `waraq`), outside the repo.
  `build.gradle.kts` signs release builds only when `src-tauri/gen/android/app/keystore.properties` exists.
  That file is gitignored and exists only in the main checkout (local builds) and in CI, written from the
  repo secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` (set by the
  user). Every release APK must use this key, or Android refuses to install it over the old one.
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
