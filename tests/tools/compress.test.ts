import { PDFDocument } from "pdf-lib";
import { compressPdf, type Reencode } from "../../src/tools/compress";
import { fx } from "../helpers";

async function withJpeg(copies: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const img = await pdf.embedJpg(fx("office/sample.jpg"));
  for (let i = 0; i < copies; i++) pdf.addPage([400, 400]).drawImage(img, { x: 0, y: 0, width: 400, height: 400 });
  return pdf.save({ useObjectStreams: false });
}

const shrink: Reencode = async (_jpeg, _maxDim, _q) => ({ bytes: new Uint8Array(64), width: 10, height: 10 });
const noGain: Reencode = async () => null;

test("re-encodes JPEG images smaller and keeps pages", async () => {
  const input = await withJpeg(2);
  const r = await compressPdf(input, { maxDim: 1600, quality: 0.7 }, shrink);
  expect(r.smaller).toBe(true);
  expect(r.after).toBeLessThan(r.before);
  expect(r.before).toBe(input.length);
  expect((await PDFDocument.load(r.bytes)).getPageCount()).toBe(2);
});

test("never reports a larger file as smaller", async () => {
  const tight = await (await PDFDocument.create()).save({ useObjectStreams: true });
  const r = await compressPdf(tight, { maxDim: 1600, quality: 0.7 }, noGain);
  expect(r.after).toBeGreaterThanOrEqual(0);
  if (r.after >= r.before) expect(r.smaller).toBe(false);
});

test("a re-encoded image that comes out bigger is kept as it was", async () => {
  const input = await withJpeg(1);
  const bigger: Reencode = async () => ({ bytes: new Uint8Array(10_000_000), width: 10, height: 10 });
  const r = await compressPdf(input, { maxDim: 1600, quality: 0.7 }, bigger);
  expect(r.after).toBeLessThan(10_000_000);
});

test("protected PDFs are refused", async () => {
  await expect(compressPdf(fx("password.pdf"), { maxDim: 1600, quality: 0.7 }, shrink)).rejects.toMatchObject({ code: "protected" });
});
