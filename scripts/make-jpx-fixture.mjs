// fixtures/scanned-jpx.pdf: one page whose only content is a JPEG 2000 image, like archive.org book scans.
// pdf.js decodes JPX (and JBIG2/CCITT) with wasm modules, so this fixture proves those are wired up.
// Usage: node scripts/make-jpx-fixture.mjs   (needs ffmpeg on PATH)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PDFDocument, PDFName, PDFNumber, PDFOperator, PDFOperatorNames as Ops } from "pdf-lib";

const W = 240;
const H = 320;
const tmp = mkdtempSync(join(tmpdir(), "waraq-jpx-"));
try {
  const jp2 = join(tmp, "page.jp2");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=${W}x${H}`,
    "-frames:v", "1", "-c:v", "jpeg2000", "-format", "jp2", "-pix_fmt", "rgb24", "-f", "image2", jp2]);

  const doc = await PDFDocument.create();
  const page = doc.addPage([W, H]);
  // Raw stream: the JPX bytes are embedded as-is, never re-encoded.
  const xobj = doc.context.stream(readFileSync(jp2), {
    Type: "XObject",
    Subtype: "Image",
    Width: W,
    Height: H,
    Filter: "JPXDecode",
  });
  const ref = doc.context.register(xobj);
  page.node.setXObject(PDFName.of("Scan"), ref);
  page.pushOperators(
    PDFOperator.of(Ops.PushGraphicsState),
    PDFOperator.of(Ops.ConcatTransformationMatrix, [W, 0, 0, H, 0, 0].map((n) => PDFNumber.of(n))),
    PDFOperator.of(Ops.DrawObject, [PDFName.of("Scan")]),
    PDFOperator.of(Ops.PopGraphicsState),
  );
  const out = resolve(import.meta.dirname, "..", "fixtures", "scanned-jpx.pdf");
  writeFileSync(out, await doc.save());
  console.log(out);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
