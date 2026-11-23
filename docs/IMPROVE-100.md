# Waraq: 100-improvement plan (working file for Claude sessions)

Created 2026-11-23 from a full audit (two parallel audits: code/perf/security and UI/identity/a11y) of v0.2.43.
The user-facing Arabic summary is `docs/IMPROVE-100-ar.md`; keep both in sync when an item's status changes.
`docs/REVIEW-TODO.md` is the older 500-point review; items here that came from it say "(TODO)".

## How to work from this file (read first in every session)

1. Read `CLAUDE.md` (rules: talk Arabic, push straight to `main`, always release app changes, line endings).
2. Pick the **next unchecked batch** in order. Batches are sorted so that foundations land first (tokens
   before visual work). Don't skip ahead unless the user asks.
3. **Locate by symbol, not line number.** Audit line numbers were unreliable; `grep -n` the named
   function/selector before editing. Re-confirm the problem still exists; if it doesn't, mark it
   `[~] already fine` with a one-line note.
4. Per batch: implement → `npx tsc --noEmit -p .` → `npm test` → (Rust items) `cd src-tauri && cargo test` →
   UI items checked in the browser preview at 375px and in dark mode (`npm run dev`; see CLAUDE.md
   "Browser preview without Tauri") → each new string in `src/i18n.ts` en + ar → new logic gets a test in
   `tests/` → one commit per batch (or per risky item) → rebase on `origin/main` → push to `main` →
   `npm run release` (patch) → watch the run in the background with `gh run watch <id>`.
5. Tick the items here (`[x]`, add commit hash) and in `docs/IMPROVE-100-ar.md` (✅), commit with the batch.
6. Items marked **NEEDS APPROVAL** are brand/product decisions: ask the user (in Arabic) before doing them.
   Never guess.
7. Baseline (v0.2.43): tsc clean · 48 test files / 267 tests passing · `vite build` OK with 1 chunk-size
   warning and 1 INEFFECTIVE_DYNAMIC_IMPORT warning (`@tauri-apps/api/window` in `reader/fullscreen.ts`) ·
   no linter configured. Largest chunks: EditorScreen 787.5 kB (356.7 gz), formats 502.3 kB, es 419.8 kB,
   run 400.5 kB, index 375 kB (119.4 gz), index.css 51 kB (16.2 gz), pdf.worker 1.25 MB. Record the
   after numbers in the final report.

Legend: impact H/M/L · risk H/M/L · `[ ]` todo · `[x]` done · `[~]` skipped/already fine · `[?]` needs approval.

## Visual identity direction: «ورق وحبر» (paper and ink)

Builds on what exists (ink-blue `--accent #223b7a`, warm paper surfaces, the `.fold` folded-corner motif,
IBM Plex Sans Arabic) instead of replacing it. The current identity is sound but thin: one colour, one
font weight doing everything, flat cards, a motif used for three meanings, and almost no motion.

- **Personality:** a calm, trustworthy stationery tool for Arabic readers and office users: scholarly,
  private and quiet rather than flashy. Should feel like good paper and fountain-pen ink.
- **Palette:**
  - The primary stays ink blue. Generate an ink scale (`--ink-50` … `--ink-900`) from #223b7a so
    the hues for hover, soft fills, borders and dark mode all come from one family.
  - Neutrals stay warm "paper" greys.
  - Add semantic colours, each with a `-soft` fill and AA text in both themes:
    - success: deep green ≈ #1f7a4d
    - warning: amber ink ≈ #a35c00
    - info: the ink itself
    - danger: already exists
  - A secondary "seal" accent (a muted stamp red) could mark signatures and stamps only. That
    choice is NEEDS APPROVAL (#47).
- **Typography:**
  - IBM Plex Sans Arabic stays the UI face (400/600/700).
  - Headings get real hierarchy: 700, line-height ≥ 1.4 for tashkeel, and a non-flat scale
    (12/13/14/16/18/22/28/34).
  - A display face for screen titles and the wordmark (Amiri is already a dependency) is NEEDS
    APPROVAL (#46).
- **Shape:** radius roles: xs 6 (chips), sm 8 (inputs, small buttons), md 12 (cards, tiles), lg 18
  (sheets, dialogs), pill.
- **Elevation:** "sheets of paper". Four levels, made of soft and slightly warm shadows plus a
  hairline border; dark mode uses lighter surfaces instead of shadows.
- **Material:** an optional 2–3 % paper grain on the app background, and the reader page as a lifted
  sheet.
- **Iconography:** lucide at 16/20/24 only, stroke 1.75, mirrored in RTL where they show direction.
- **Motion "paper" style:**
  - Short and soft, never bouncy on big surfaces.
  - Durations: instant 90, fast 140, med 220, slow 320 ms.
  - Easing: `--ease-out` cubic-bezier(.22,1,.36,1) for entering, `--ease-in` cubic-bezier(.55,0,1,.45)
    for leaving.
  - `--ease-spring` cubic-bezier(.34,1.56,.64,1), only for small presses and toggles.
  - Lists stagger 30 ms per item (max 8 items).
  - Only animate transform and opacity.
  - Everything collapses under `prefers-reduced-motion`.
- **Where it lives:**
  - Tokens: `src/styles/tokens.css` (to be split out of `theme.css`, #31).
  - Components: `src/styles/components/*.css`.
  - Motion helpers: `src/ui/motion.ts` (`usePresence`, stagger index).

## Batch 1: critical bugs (state, data loss, races)

- [x] **1** · bug · `App.tsx` (route/`setRoute`, `handleFiles`, Android incoming), `shell/Layout.tsx` nav, `editor/EditorScreen.tsx`
  - Problem: the sidebar rail, drag-drop and incoming files all unmount the editor without the
    leave prompt. Up to 800 ms of edits are lost (draft debounce), and `edit.src.bytes` stays in memory.
  - Fix: route every route change through a guard the editor registers (dirty → `setLeaveAsk`).
    Clear `edit` on leave.
  - H / risk M
- [x] **2** · bug · `App.tsx` `onPageChange`/`openRef`, `reader/Reader.tsx` unmount flush
  - Problem: on close the last page is dropped (`openRef` is nulled first). On switching documents,
    the old document's page is written to the new document's key.
  - Fix: `onPageChange(docKey, page)` and save by that key.
  - H / L
- [x] **3** · bug/perf · `reader/ReaderScreen.tsx` inline `onPageChange`, `Reader.tsx` debounce effect
  - Problem: the callback is new every render, so the 500 ms debounce restarts on each one. During a
    conversion, App re-renders every 250 ms and the page is never saved.
  - Fix: stable callback; read it from a ref.
  - H / L
- [x] **4** · perf · `ReaderScreen.tsx` `panel()`/`pick`, `reader/Thumbnails.tsx`
  - Problem: `pick` is recreated every render, which defeats `memo(Thumb)`, so every thumbnail
    re-renders on every page change, search batch or conversion tick.
  - Fix: stable `onPick` via `useCallback` and refs; render the panel as a component.
  - H / L
- [x] **5** · bug · `Reader.tsx` window keydown
  - Problem: Escape closes the document even when the Settings sheet or a dialog is on top.
  - Fix: ignore keys while an `[aria-modal="true"]` or sheet is open, or when `e.defaultPrevented`.
  - M / L
- [x] **6** · bug · `Reader.tsx` `detectRtl`
  - Problem: auto-detection overwrites the user's saved per-document reading direction on every open.
  - Fix: skip detection when `saved.rtl !== undefined`.
  - M / L
- [x] **7** · bug · `reader/night.ts` worker `onerror`
  - Problem: pending `waiting` promises never settle, so night-mode pages and thumbnails stay blank
    forever.
  - Fix: on `error`/`messageerror`, fall back to `nightPixels` for each pending entry and clear the map.
  - M / L
- [x] **8** · bug · `reader/PageView.tsx` `.hl.current` `scrollIntoView`, `ReaderScreen.tsx` highlights
  - Problem: the view jumps back to the current hit on every scan batch and every zoom.
  - Fix: scroll only when the current match identity changes; memoize per-page highlight arrays.
  - M / L
- [x] **9** · bug · `App.tsx` `toastUndo`, recent remove/restore
  - Problem: a new toast keeps the previous Undo button, which then restores an unrelated Recent
    item. `remove`/`restore` have no `.catch`.
  - Fix: a single `showToast(msg, undo?)`, and catch store failures with a toast.
  - M / L
- [x] **10** · race · `files/recent.ts` `setLastPage`/`setThumb`/`setLocked`/`touch`
  - Problem: each does read→mutate→save unserialised, so writes are lost (thumbnail or last page).
  - Fix: a promise-chain queue inside `RecentStore`, plus a test.
  - M / L

## Batch 2: reliability and security

- [ ] **11** · bug · `App.tsx` open-as-PDF
  - Problem: the `AbortController` is created after `await import("./convert/openAsPdf")`, so a
    cancel during chunk load is ignored.
  - Fix: create it first and check `signal.aborted` after the import.
  - L / L
- [ ] **12** · bug · `EditorScreen.tsx` window keydown
  - Problem: Delete or Ctrl+Z act while the Save/Leave dialog, signing or busy state is active.
  - Fix: early return via the `keys` ref.
  - M / L
- [ ] **13** · security · `convert/odt.ts` `text:c`
  - Problem: `" ".repeat(Number(c))` with an untrusted count; `1e9` crashes the renderer.
  - Fix: clamp to 0..100, plus a test.
  - M / L
- [ ] **14** · security · `convert/epub.ts`, `convert/odt.ts`, docx path (TODO)
  - Problem: no zip-bomb protection.
  - Fix: check each entry's and the total uncompressed size (cap ≈ 200 MB) before `async()`; give a
    clear error code.
  - M / L
- [ ] **15** · reliability · `src-tauri/src/office.rs` `CANCEL`
  - Problem: one flag serves both install and convert. Cancelling a conversion kills a running
    LibreOffice download, and a reset at start drops a cancel issued while a job waited for `BUSY`.
  - Fix: separate flags or per-operation tokens, plus a cargo test.
  - M / M
- [ ] **16** · reliability · `office.rs` install
  - Problem: the ≈373 MB download has no connect or read timeout and no concurrency guard.
  - Fix: a ureq agent with timeouts (as in `update.rs`) and an `INSTALLING` AtomicBool.
  - M / L
- [ ] **17** · reliability · `files.rs` work dirs, `convert/native.ts`, `convert/openAsPdf.ts`
  - Problem: `work/<pid>-N` and `outputs/` are never deleted, so the cache grows forever.
  - Fix: delete the temp dir after `printPdf` reads the result; at startup, wipe `work/` dirs of
    other PIDs.
  - M / L
- [ ] **18** · security · `files.rs` `read_file`/`save_output`, `print.rs` `html_to_pdf`
  - Problem: they read and write arbitrary paths, bypassing the fs-plugin scope.
  - Fix: a Rust-side allowlist filled from the dialog, drag-drop, argv/single-instance and the
    chosen save folder, plus the app cache. Verify open/save/convert/print on Windows still work.
  - M / **H** (can break flows; do it alone, in its own release)
- [ ] **19** · security · `convert/sanitize.ts`
  - Problem: the style filter misses CSS escapes (`u\72l(`) and `image-set(`, and SVG
    `animate`/`set`/`animateMotion` can set `href` to `javascript:`.
  - Fix: drop those, plus tests in `tests/convert/`.
  - L / L
- [ ] **20** · reliability · `files.rs` `read_file`
  - Problem: whole-file read with no size cap, so a multi-GB file crashes the webview.
  - Fix: a `metadata().len()` check returning a `too-large` code; add the i18n message.
  - L / L

## Batch 3: design system foundation (do before any visual batch)

- [ ] **21** · tokens · `theme.css` → `src/styles/tokens.css`
  - Problem: there is no spacing scale; every gap and padding is a raw px value.
  - Fix: `--sp-1..--sp-10` on a 4 px grid, and replace the raw values across all CSS files.
  - H / M
- [ ] **22** · tokens · all CSS
  - Problem: the type scale is flat (xl 19 vs 2xl 20), with one-offs 13.5/18/24/28 px.
  - Fix: a new scale 12/13/14/16/18/22/28/34 in **rem**, plus `--lh-tight/normal/loose` (≥1.4 for
    Arabic headings). Replace the one-offs.
  - M / M
- [ ] **23** · tokens
  - Problem: radii drift (6/8/10/12/14/16/18) and icon tiles come in 36/40/44/56.
  - Fix: radius roles xs/sm/md/lg/pill and tile tokens `--tile-sm/md/lg`; map every use.
  - M / L
- [ ] **24** · tokens
  - Problem: only `--shadow`/`--page-shadow` exist; there are 13 raw shadows and cards look flat (TODO).
  - Fix: `--elev-1..4` for light and dark; replace the raw shadows.
  - M / L
- [ ] **25** · tokens
  - Problem: z-index values are scattered (5…60).
  - Fix: `--z-base/raised/sticky/panel/scrim/sheet/dialog/toast`.
  - L / L
- [ ] **26** · tokens
  - Problem: motion has two durations, an unused `--ease-in-out` and one-off springs in editor.css.
  - Fix: the motion tokens from the identity section; replace raw durations and easings.
  - H / L
- [ ] **27** · tokens
  - Problem: there are no success/warning/info colours. Paper (#fff ×9), night paper (#121212), the
    selection blue, the search outline and `#6b7489` are all hard-coded, and highlights are
    light-only.
  - Fix: semantic plus `-soft` tokens; `--paper`, `--paper-night`, `--selection`, `--hl`,
    `--hl-current` for both themes.
  - H / L
- [ ] **28** · bug/system · `tools/tools.css` `.flip-rtl`, `convert/convert.css` `.btn-sm`/`.dialog-status`, `.icon-btn.danger` ×2
  - Problem: shared rules live in lazily loaded feature CSS. The editor's Undo/Redo arrows aren't
    mirrored in RTL until the Tools screen has been opened once.
  - Fix: move them into shared component CSS.
  - H / L
- [ ] **29** · tokens · Home quick actions, toast action `#8fb0ff`
  - Problem: four raw category hues.
  - Fix: `--cat-convert/edit/compress/merge` (+ soft) for light and dark.
  - L / L
- [ ] **30** · tooling · new `stylelint` config + `npm run lint` (CSS) + ESLint (TS/React hooks)
  - Problem: there is no linter (TODO P1).
  - Fix: a lightweight config, `react-hooks/exhaustive-deps` and a no-raw-hex rule outside the token
    files; add it to the release `check` job.
  - M / L (dev deps only)
- [ ] **31** · quality · `theme.css` (1393 lines)
  - Problem: one file for tokens, base styles, every component and the shell.
  - Fix: split into `styles/tokens.css`, `base.css`, `components/*.css` and `shell.css`, imported
    from `main.tsx`. No visual change; take before/after screenshots.
  - M / M
- [ ] **32** · cleanup
  - Problem: `--fold-bg` is set three times and never read; `--ease-in-out` is unused.
  - Fix: remove them; run `npx knip` once for dead exports/files and remove the confirmed ones.
  - L / L

## Batch 4: performance

- [ ] **33** · perf · `files/docRef.ts` `resolveName`/`sniffFmt`, `App.tsx`, `convert/useConvert.ts` (TODO)
  - Problem: sniffing an Android opaque URI reads the whole file, and the same file is resolved and
    read 2–3×.
  - Fix: sniff the first 64 KB only, memoize per URI and pass resolved names to `conv.add`.
  - H / M
- [ ] **34** · perf · bundle
  - Problem: EditorScreen is 787 kB (357 kB gzipped).
  - Fix: lazy-load fontkit and the Arabic font only on the first text/form/signature write. Check
    whether `formats`/`es` pull editor-only code. Add `chunkSizeWarningLimit` only after splitting.
    Record the sizes.
  - H / M
- [ ] **35** · perf · `App.tsx` → `EditorScreen.tsx` (`loadPdf`, `importAnnots`, `listFields`)
  - Problem: opening the editor re-reads the file and parses it with pdf-lib three times, plus pdf.js.
  - Fix: parse once and pass the `PDFDocument`; from the reader use `doc.getData()`.
  - M / M
- [ ] **36** · perf · `EditorScreen.tsx` sizes, `EditorPage.tsx` `getPage`
  - Problem: `getPage` runs for every page at open and every page stays alive.
  - Fix: Reader-style sizes (page 1 plus lazy correction); `getPage` only when visible.
  - M / M
- [ ] **37** · perf · `EditorScreen.tsx` ctrl+wheel/zoom, `EditorPage.tsx`
  - Problem: `setZoom` runs per wheel tick and re-renders every unmemoized page. `highlights={[]}`
    is a new array every render, which defeats `memo(PageView)`.
  - Fix: live CSS zoom with one commit (as in the reader); `memo(EditorPage)` with stable
    callbacks; a module-level empty array.
  - M / M
- [ ] **38** · perf · `editor/drafts.ts`
  - Problem: every 800 ms change re-encodes every image to base64 and rewrites all drafts into
    `waraq.json`, which also holds Recent and loads at startup.
  - Fix: a separate drafts store, images stored once by hash, and a size cap.
  - M / M
- [ ] **39** · perf · `tools/ToolsScreen.tsx` `loadSource`, merge/organize
  - Problem: pdf-lib parses only to validate, then the bytes are parsed again for assemble.
  - Fix: keep the `PDFDocument` and pass it to `assemble()`.
  - M / L
- [ ] **40** · perf · `reader/OutlinePanel.tsx`, `reader/outline.ts`
  - Problem: every switch to the Contents tab re-extracts up to 400 pages and keeps running after
    unmount.
  - Fix: cache per doc in ReaderScreen, pass a cancel check, reuse `layouts.current`.
  - M / L
- [ ] **41** · perf · `reader/Thumbnails.tsx` + `tools/PdfThumb.tsx`
  - Problem: two near-duplicate components, with one IntersectionObserver per thumbnail.
  - Fix: one `PdfThumb` (`night`/`rotate` props) and a shared observer per list.
  - L / L
- [ ] **42** · perf · `reader/layout.ts` `visiblePages`, `Reader.tsx` `onScroll`; `PageView.tsx` links/textContent; `App.tsx` `firstPageThumb`
  - Problem: there are three separate costs:
    - `pageOffsets` rebuilds an O(n) array on every scroll.
    - Links and text content are refetched on every zoom.
    - The first-page thumbnail is re-rendered even when one already exists.
  - Fix: pass the memoized `tops` and binary-search them; cache links and text content in refs;
    skip the thumbnail when `item.thumb` exists.
  - L / L

## Batch 5: visual identity

- [ ] **43** · identity · `styles/tokens.css`
  - Problem: the accent has no scale, and soft fills and hover colours are improvised.
  - Fix: an ink scale 50–900 from #223b7a; derive accent/soft/hover/borders from it.
  - M / L
- [?] **44** · identity — NEEDS APPROVAL
  - Problem: in dark mode the accent changes character (periwinkle #8ea6e6) (TODO).
  - Fix: use ink-300/200 from the same hue family. This visibly changes the brand colour in dark
    mode, so show the user a before/after first.
  - M / M
- [ ] **45** · identity · `theme.css` background, `reader.css` pages
  - Problem: "Waraq" (paper) is not in the material; the identity rests on the fold alone (TODO).
  - Fix: a subtle SVG paper grain (data URI, ≤2 KB, opacity 2–3 %, off in high-contrast/forced-colors)
    and lifted-sheet page shadows.
  - M / L
- [?] **46** · identity — NEEDS APPROVAL
  - Problem: headings have no character; there is no wordmark (TODO).
  - Fix: Amiri Bold (already bundled for PDF writing) for the «ورق» wordmark and screen titles, or a
    heavier Plex weight. Show both options.
  - M / M
- [?] **47** · identity — NEEDS APPROVAL
  - Problem: signatures and stamps have no distinct colour.
  - Fix: a secondary "seal red" accent used only for signature, stamp and destructive confirms.
  - L / M
- [?] **48** · identity · `public/logo.svg`, `.fold` — NEEDS APPROVAL
  - Problem: the logo's fold is always top-right, but `.fold` mirrors to top-left in RTL, and there
    is no dark logo variant.
  - Fix: either keep the fold top-right everywhere or mirror the logo, and add a dark tile variant.
  - L / M
- [ ] **49** · identity · `Home.tsx`, `ConvertScreen.tsx`, `ToolsScreen.tsx`
  - Problem: headings are inconsistent (Home has no h1, the others do) (TODO).
  - Fix: a shared `<ScreenHeader title actions>` component using the new heading tokens.
  - M / L
- [ ] **50** · identity · icons in every `.tsx`
  - Problem: lucide sizes vary (16/17/18/20/22/26) (TODO); `PanelLeft` (Reader) and `Undo2`
    (Tools) aren't mirrored.
  - Fix: `--icon-sm/md/lg` (16/20/24), an `<Icon>` wrapper or a size constant, stroke 1.75, and
    mirror the direction icons.
  - M / L
- [ ] **51** · identity · `RecentList.tsx`, `SearchPanel.tsx`, `OutlinePanel.tsx`, the Convert empty state
  - Problem: empty states are plain text or a generic icon.
  - Fix: 3–4 small inline-SVG paper illustrations (stacked sheets, folded corner, magnifier over
    paper) drawn from tokens, so they theme automatically.
  - M / L
- [ ] **52** · identity · `theme.css` `.toast`
  - Problem: the toast is plain, with no semantic meaning.
  - Fix: a frosted surface (`backdrop-filter` with a solid fallback), a semantic icon and an accent
    edge; `success`/`error`/`info` variants.
  - M / L
- [ ] **53** · identity · Settings appearance
  - Problem: the theme options are text only (TODO).
  - Fix: mini preview swatches (light/dark/system) built from tokens.
  - L / L
- [ ] **54** · identity · cards (`.card`, tool rows, recent rows, quick items)
  - Problem: three visual languages (iOS list, cards, tiles) (TODO).
  - Fix: one card recipe (surface + elev-1 + hairline + radius md, with hover elev-2) and one list-row
    recipe, used everywhere.
  - M / M

## Batch 6: motion and effects

- [ ] **55** · motion · new `src/ui/motion.ts` `usePresence`; dialog, sheet, toast, update prompt, selection bar
  - Problem: nothing has an exit animation; everything vanishes in one frame.
  - Fix: a `data-state="closing"` + `animationend` unmount helper with a timeout fallback.
  - H / M
- [ ] **56** · motion · `App.tsx` route switch
  - Problem: screens swap with a jump (TODO).
  - Fix: `document.startViewTransition` where supported (feature-detected), with a 180 ms
    fade/slide fallback that is direction-aware in RTL. Not inside the reader/editor (too heavy).
  - H / M
- [ ] **57** · motion · Recent, tools list, convert rows
  - Problem: all rows rise at once.
  - Fix: a stagger via a `--i` custom property (30 ms, capped at 8), only on first mount.
  - M / L
- [ ] **58** · motion · bottom nav, `.segmented`
  - Problem: the active pill only fades.
  - Fix: a sliding indicator (transform-only).
  - M / L
- [ ] **59** · motion · thumbnails, recent thumbs, editor "preparing", Suspense fallback
  - Problem: no skeletons; content pops in (TODO).
  - Fix: a `.skeleton` shimmer component (transform gradient sweep, paused under reduced motion),
    sized to avoid layout shift.
  - H / L
- [ ] **60** · motion · buttons and inputs
  - Problem: the micro-interactions are inconsistent.
  - Fix:
    - A unified press scale (spring, small).
    - Hover elevation on cards.
    - An input focus glow.
    - A `button[aria-busy]` inline spinner with a fixed width, so it doesn't shift the layout.
  - M / L
- [ ] **61** · motion · conversion done, save success, invalid page range
  - Problem: no success or error feedback motion.
  - Fix: an SVG check-draw on success and a small shake on invalid input (reduced motion falls back
    to colour only).
  - M / L
- [ ] **62** · motion · `.dropzone`
  - Problem: no feedback while dragging files over.
  - Fix: a drag-over state with an animated dashed border, the fold lifting and an ink tint.
  - M / L
- [ ] **63** · motion · convert/update progress bars
  - Problem: no indeterminate state.
  - Fix: an indeterminate sweep plus a smooth width easing; a check pulse when a row finishes.
  - L / L
- [ ] **64** · motion · Settings sheet (TODO)
  - Problem: the drag handle doesn't dismiss the sheet.
  - Fix: pointer drag-to-dismiss with a velocity threshold and rubber-banding.
  - M / M
- [ ] **65** · motion · reduced-motion audit
  - Problem: `hint-out`, the second `ed-selbar-in` and every new animation need reduced-motion
    coverage.
  - Fix: one global reduced-motion block in `tokens.css`, plus a happy-dom test that the class
    disables animations.
  - M / L

## Batch 7: accessibility

- [ ] **66** · a11y · `editor.css` `.ed-selbar .icon-btn` 36, `.ed-swatch` 26, `.sig-forget` 22; `.segmented` 36; `.btn-sm` 36; `.toast-action` 36; reader page input 34; search 38
  - Problem: touch targets are under 44 px on phones.
  - Fix: 44 px on `(pointer: coarse)`, with a larger hit area via padding or a pseudo-element where
    the visual size must stay.
  - H / L
- [ ] **67** · a11y · reader page input, `.search-box`, `.recent-filter`, wrapped inputs
  - Problem: focus is shown only by a border-colour change.
  - Fix: a `--focus-ring` token (2 px ink + 2 px offset) via `:focus-visible`/`:focus-within`.
  - H / L
- [ ] **68** · a11y · `--stroke-strong`
  - Problem: control borders are 1.69:1 (light) and 1.75:1 (dark), below the 3:1 non-text rule.
  - Fix: darken the input/control border token only, keeping the dividers soft.
  - M / L
- [ ] **69** · a11y · dialogs/sheets
  - Problem: no focus trap and no focus restore are confirmed.
  - Fix: verify; add a small `useFocusTrap` that returns focus to the opener.
  - M / L
- [ ] **70** · a11y · toast, conversion progress, update status
  - Problem: no live regions.
  - Fix: `role="status"`/`aria-live="polite"` (alert for errors).
  - M / L
- [ ] **71** · a11y · i18n strings with U+200E (TODO)
  - Problem: hand-inserted direction marks are fragile.
  - Fix: `<bdi>`/a `dir="auto"` isolate for Latin terms and file names; remove the marks.
  - M / M
- [ ] **72** · a11y · `.icon-btn:disabled` opacity .45
  - Problem: disabled controls are faint (TODO).
  - Fix: a `--text-disabled` colour instead of opacity, keeping ≥3:1 for the icon.
  - L / L
- [ ] **73** · a11y · font tokens
  - Problem: the UI may break at Android 130 % system font (TODO).
  - Fix: rem-based type (from #22); test at 130 % in the preview (`html{font-size:130%}`) and fix
    overflow.
  - M / M

## Batch 8: UX and ease of use

- [ ] **74** · ux · Home quick actions (TODO)
  - Problem: "Edit & sign" opens the picker directly while "Merge"/"Compress" open Tools first, and
    the shortcuts duplicate the bottom tabs.
  - Fix: make every shortcut behave the same (pick a file, then go to the tool) and add a "Continue
    reading" card (last document thumbnail + progress) at the top of Home.
  - M / M
- [ ] **75** · ux · `ToolsScreen.tsx` (TODO)
  - Problem: the screen mixes one big card with grouped lists.
  - Fix: one pattern: grouped tiles using the #54 recipe.
  - M / L
- [ ] **76** · ux · organize/merge (TODO)
  - Problem: reordering is only possible with earlier/later buttons.
  - Fix: pointer drag-and-drop reorder (touch + mouse, auto-scroll), keeping the buttons for
    keyboard users.
  - M / M
- [ ] **77** · ux · reader (TODO)
  - Problem: no fast navigation for long books.
  - Fix: a page scrubber on the scrollbar edge with a page-number bubble while dragging.
  - M / M
- [~] **78** · ux · editor pen (TODO) — already present: the editor toolbar has an Eraser tool (seen 2026-11-23)
  - Problem: no eraser.
  - Fix: an eraser tool that removes the ink strokes it touches (via history, so it can be undone).
  - M / M
- [ ] **79** · ux · merge/split/organize results (TODO)
  - Problem: forms and the outline are dropped silently.
  - Fix: show a one-line notice in the result when the source had forms or an outline.
  - M / L
- [ ] **80** · ux · conversion running
  - Problem: closing the window or leaving loses the queue without warning (TODO).
  - Fix: desktop: a `onCloseRequested` confirm while jobs run; Android back: confirm.
  - M / M
- [ ] **81** · ux · `convert/ConvertScreen.tsx` per-job select (TODO)
  - Problem: the native `<select>` opens a foreign-looking system menu on Android.
  - Fix: a lightweight in-app listbox popover/sheet (keyboard and screen-reader accessible).
  - M / M
- [ ] **82** · ux · numbers everywhere (TODO)
  - Problem: mixed Latin digits and the Arabic «٪»; no thousands separators.
  - Fix: a `fmtNum()` helper via `Intl.NumberFormat(lang)` (Latin digits default); use it everywhere.
  - M / L
- [ ] **83** · ux · Recent on desktop (TODO)
  - Problem: no context menu.
  - Fix: right-click/long-press menu: open, edit, convert, show in folder, remove.
  - L / L
- [ ] **84** · ux · global shortcuts
  - Problem: there are no app-level keys.
  - Fix: Ctrl+O open, Ctrl+, Settings, `?` shortcut sheet from anywhere; list them in the existing
    shortcut list.
  - L / L
- [?] **85** · ux — NEEDS APPROVAL
  - Problem: output suffixes «(edited)»/«(converted)» are English in the Arabic UI (TODO).
  - Fix: localized suffixes. This changes file names users may rely on.
  - M / M

## Batch 9: code quality and maintainability

- [ ] **86** · quality · `Reader.tsx` vs `EditorScreen.tsx`
  - Problem: zoom/scroll/pinch is implemented twice, and the editor has no pinch.
  - Fix: a shared `useZoomScroller` hook (focal-point CSS zoom + commit) used by both. Builds on #37.
  - M / M
- [ ] **87** · quality · `App.tsx`
  - Problem: many unrelated `useState`s (open, notPdf, locked, edit, toast, route) (TODO).
  - Fix: a typed reducer for the modal/route state; the logic becomes testable in `tests/app.test.ts`.
  - M / M
- [ ] **88** · quality · `SignaturePad.tsx` `useRef(appKV())`, App, EditorScreen
  - Problem: the KV store is created on every render, with three separate instances.
  - Fix: one shared `appKV()` singleton.
  - L / L
- [ ] **89** · quality · `PageView.tsx`, `Thumbnails.tsx`, `text/search.ts`, `convert/toHtml.ts`, `editor/write.ts`
  - Problem: `as never`/`as unknown as` casts.
  - Fix: typed helpers (`textItems()`, `imageCoords()`, mammoth `{arrayBuffer}`, a fontkit input type).
  - L / L
- [ ] **90** · quality · Rust↔TS error codes (TODO)
  - Problem: free-form strings on both sides.
  - Fix: one `ErrorCode` union in TS mirroring a Rust enum serialized as a string, plus a test that
    every code has an i18n message.
  - M / L
- [ ] **91** · tests · `ConvertScreen`, `ToolsScreen`, `RecentList` (happy-dom)
  - Problem: no UI tests for the main screens (TODO).
  - Fix: smoke tests that render, show the empty state and run the main action with mocked deps.
  - M / L
- [ ] **92** · CI · `.github/workflows/release.yml` `check` job
  - Problem: no audit and no bundle budget (TODO).
  - Fix: `npm audit --omit=dev --audit-level=high`, `cargo audit` (non-blocking first), lint (#30) and
    a bundle-size budget script that fails on >10 % growth of the main chunk.
  - M / L
- [ ] **93** · docs · `README.md`
  - Problem: no install steps for Android (unknown sources) or macOS (right-click → Open), and no
    supported-formats table for desktop vs phone (TODO).
  - Fix: add them.
  - L / L
- [ ] **94** · ux/docs · `CHANGELOG.md` + "What's new" sheet after update (TODO)
  - Problem: users don't know what changed.
  - Fix: `scripts/release.mjs` asks for or derives notes from commit subjects into the CHANGELOG and
    `latest.json` notes; the app shows them once after a version change.
  - M / M

## Batch 10: remaining fixes

- [ ] **95** · bug · `src-tauri/src/lib.rs` single-instance callback
  - Problem: the `cwd` argument is ignored, so a relative path from a second launch resolves wrong.
  - Fix: join a relative path with `cwd`, plus a cargo test.
  - L / L
- [ ] **96** · reliability · `print.rs`
  - Problem: a `PrintToPdf` error leaves a partial `.pdf`, and there is no cancel.
  - Fix: remove `out_path` on any `Err`; a cancel command that closes the print window.
  - L / M
- [ ] **97** · security · `update.rs` Android APK download
  - Problem: no hash check and no size cap.
  - Fix: publish the SHA-256 in `latest.json` (release workflow) and verify it before `rename`; cap
    at 200 MB.
  - L / M
- [ ] **98** · bug · `EditorScreen.tsx` `draftKey`, `App.tsx` editor key
  - Problem: the key is path + length, so a same-size external change restores an old draft onto
    different pages.
  - Fix: add a cheap hash (first/last 64 KB + length).
  - L / L
- [ ] **99** · security · `src-tauri/capabilities/default.json` opener
  - Problem: the `http(s)://*` wildcard makes the specific entries pointless.
  - Fix: route PDF web links through a Rust command that re-checks the scheme, then narrow the
    allowlist.
  - L / M
- [ ] **100** · build · `reader/fullscreen.ts`
  - Problem: the INEFFECTIVE_DYNAMIC_IMPORT warning (`@tauri-apps/api/window` imported both ways).
  - Fix: a static import (it's already in the main chunk via webview.js), which clears the warning.
  - L / L

## Needs approval (ask the user before touching)

#44 dark-mode accent hue · #46 display font / wordmark · #47 seal-red secondary accent · #48 logo fold
direction + dark logo · #85 Arabic file-name suffixes. When asking, show a before/after (screenshot or a
small artifact) and give a recommendation.

## Backlog found in the audit but not in the 100

- Search panel covering the page on phones (TODO 147).
- Bookmarks (TODO 451).
- Highlight in the reader (TODO 449).
- Reflow reading mode (TODO 447).
- OCR (TODO 428).
- Web Worker for mammoth/turndown (TODO 240).
- Android full-file `readFile` memory (TODO 225).

These are bigger features; propose them as separate sessions.

## Progress log

| Batch | Date | Commit | Release | Notes |
|---|---|---|---|---|
| 1 | 2026-11-23 | (this commit) | v0.2.44 | Verified in preview: page saved on close, reopen keeps page and chosen direction, Escape under a dialog keeps the reader, editor leave guard from the sidebar. Item 78 found already done. |
