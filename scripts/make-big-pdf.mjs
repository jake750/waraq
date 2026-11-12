// Writes a 500-page text PDF for the memory/virtualization check. Not a fixture: output goes to the OS temp dir
// (or the path given as the first argument) and is never committed.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = process.argv[2] ?? join(tmpdir(), "waraq-big-500.pdf");
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const line = "The quick brown fox jumps over the lazy dog while the lighthouse keeper counts the waves.";

for (let p = 1; p <= 500; p++) {
  const page = doc.addPage([595, 842]);
  page.drawText(`Page ${p}`, { x: 50, y: 790, size: 22, font });
  for (let l = 0; l < 40; l++) page.drawText(`${l + 1}. ${line}`, { x: 50, y: 750 - l * 17, size: 10, font });
}

writeFileSync(out, await doc.save());
console.log(out);
