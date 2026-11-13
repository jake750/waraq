// Copies pdf.js decoders (wasm), CMaps and standard fonts to public/pdfjs/ so the app ships them.
// Runs automatically before `npm run dev` and `npm run build` (predev / prebuild).
import { cpSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");
rmSync(dest, { recursive: true, force: true });
for (const dir of ["wasm", "cmaps", "standard_fonts"]) cpSync(join(src, dir), join(dest, dir), { recursive: true });
