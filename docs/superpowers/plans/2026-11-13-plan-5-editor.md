# Plan 5 — Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Mark up and fill PDFs on both platforms: highlight/underline/strike on text, text boxes (Arabic shaped), freehand, rectangle/ellipse/line/arrow, images and signatures, sticky notes, AcroForm fill, undo/redo; save as a new file with standard annotations, or flattened.

**Architecture:** Marks live in PDF user space per page (`Mark[]`). The editor screen renders pages with pdf.js and an SVG overlay in viewport pixels (pdf.js viewport converts points, so rotated pages work). A pure history reducer gives undo/redo. `writeMarks` (pdf-lib) turns marks into annotations with appearance streams (so every reader shows them) or, when flattening, draws them into the page. Text boxes are drawn into the page with an embedded subset of IBM Plex Sans Arabic via fontkit, which shapes Arabic and returns glyphs in visual order; runs are ordered with a small bidi (`visualRuns`).

**Tech Stack:** pdf-lib, @pdf-lib/fontkit (MIT), pdf.js, React. Font: IBM Plex Sans Arabic (OFL, already bundled for the UI).

**Spec:** docs/superpowers/specs/2026-11-12-document-converter-design.md §6.3, §3 (text boxes, output safety).

## Global Constraints
- Save always writes a new file `<name> (edited).pdf`; never overwrite.
- Arabic text in text boxes must be connected, RTL, with correct mixed-direction order.
- Highlights, drawings, shapes and notes are standard annotations (Highlight/Underline/StrikeOut/Ink/Square/Circle/Line/Text) with appearance streams.
- Protected PDFs: refused for saving (see Plan 2 ruling).

## Review Focus
- Rotated pages: marks land where the user drew them.
- Mixed Arabic/English/number text box reads back in logical order.
- Undo after save / redo after a new edit (redo stack cleared).
- Flatten leaves no annotations but keeps everything visible.
- Form fields with Arabic values.

### Task 1: Model, history, bidi runs (pure) — `src/editor/marks.ts`, `history.ts`, `bidi.ts`; tests.
### Task 2: Writer — `src/editor/write.ts` `writeMarks(bytes, marks, fonts, {flatten})`; tests read back with pdf-lib and pdf.js.
### Task 3: Forms — `src/editor/forms.ts` `listFields`, `fillFields`; tests on a generated form.
### Task 4: Editor screen — page view + overlay, tools, colours, signature pad (saved signatures in the app store), notes, forms panel, save/flatten; "Edit" button in the reader; nav.
