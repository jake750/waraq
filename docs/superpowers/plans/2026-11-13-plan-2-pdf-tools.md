# Plan 2 — PDF tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Merge, split, extract, delete, rotate, reorder, insert (blank / from another PDF) and compress PDFs on both platforms, always writing a new file.

**Architecture:** One pure model: a page list `PageSpec[]` (`{src, index, rotate}` or `{blank: [w, h]}`) over source PDFs. `assemble(sources, pages)` builds the output with pdf-lib `copyPages`. Every tool is a function from a page list to one or more page lists. A Tools screen with a thumbnail page organizer edits the list; compress re-encodes JPEG images with a canvas and keeps the original when the result is not smaller.

**Tech Stack:** pdf-lib (already a dependency), pdf.js for thumbnails, React.

**Spec:** docs/superpowers/specs/2026-11-12-document-converter-design.md §6.1 "PDF tools", §3 output safety.

## Global Constraints
- Never overwrite: outputs are new files named `<name> (edited).pdf`, split parts `<name> (part N).pdf`, merges `<first> (merged).pdf`.
- Offline, both platforms, same TS code.
- Compress never produces a larger file: if not smaller, report "already small" and save nothing.
- Password-protected PDFs: see Ruling in ledger (refused in v1 tools with a clear message).

## Review Focus
- Page ranges typed in Arabic-Indic digits (١-٣) and with spaces/commas/dashes in any order.
- Rotating a page that already has /Rotate keeps the sum modulo 360.
- Merging PDFs with different page sizes keeps each page's own size.
- Split "every N" with a remainder makes a shorter last part.
- A corrupt or encrypted input fails with a message, not a crash.

### Task 1: Page model and ranges (pure)
**Files:** Create `src/tools/pages.ts`, test `tests/tools/pages.test.ts`.
**Produces:** `parseRanges(text, pageCount): number[] | null` (0-based, keeps order, accepts `1-3, 5, 8-` and Arabic-Indic digits); `splitGroups(pageCount, mode): number[][]` with `mode = {kind:"each"} | {kind:"every", n} | {kind:"ranges", text}`; `assemble(sources: Uint8Array[], pages: PageSpec[]): Promise<Uint8Array>`.
Tests: ranges parsing incl. invalid → null; groups; assemble merge/reorder/rotate/blank/insert-from-other, page sizes kept, encrypted input → ConvertError("protected").

### Task 2: Compress
**Files:** `src/tools/compress.ts`, test `tests/tools/compress.test.ts`.
**Produces:** `compressPdf(bytes, opts: {maxDim: number; quality: number}, reencode: (jpeg: Uint8Array, maxDim, quality) => Promise<Uint8Array | null>) → {bytes, before, after, smaller}`. Re-encodes DCT images only when the new stream is smaller; saves with object streams; `smaller=false` when the result isn't smaller (caller keeps the original).
Tests: never larger (fixture already tight), a big JPEG gets smaller (fake reencoder), page count unchanged.

### Task 3: Tools screen
**Files:** `src/tools/ToolsScreen.tsx`, `src/tools/PageGrid.tsx`, `src/tools/tools.css`, nav item "Tools", i18n.
Tool list: Organize pages (grid: select, rotate, delete, move, insert blank, insert from PDF, extract selected, save), Merge (file list with up/down), Split (each / every N / ranges), Compress (before/after). Saves via `saveOutput` next to the original (desktop) / Downloads (Android).
