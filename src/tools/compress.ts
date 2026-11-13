// Compress: re-encode/downscale JPEG (DCTDecode) images and save with object streams.
// An image is replaced only if its new stream is smaller; the caller keeps the original
// file when the whole result isn't smaller (`smaller: false`), so a file never grows.

import { PDFArray, PDFName, PDFNumber, PDFRawStream, type PDFDict } from "pdf-lib";
import { loadPdf } from "./pages";

/** JPEG → smaller JPEG (longest side ≤ maxDim), or null to leave it. Browser: a canvas. */
export type Reencode = (jpeg: Uint8Array, maxDim: number, quality: number) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>;
export type CompressOpts = { maxDim: number; quality: number };
export type CompressResult = { bytes: Uint8Array; before: number; after: number; smaller: boolean };

const name = (d: PDFDict, key: string) => d.get(PDFName.of(key))?.toString();

export async function compressPdf(input: Uint8Array, opts: CompressOpts, reencode: Reencode, onImage?: (n: number) => void): Promise<CompressResult> {
  const pdf = await loadPdf(input);
  const ctx = pdf.context;
  let n = 0;
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (name(d, "Subtype") !== "/Image" || name(d, "Filter") !== "/DCTDecode") continue;
    const cs = name(d, "ColorSpace");
    // Canvas output is 8-bit RGB: leave CMYK/indexed/decoded images alone.
    if (d.get(PDFName.of("Decode")) || (cs && !["/DeviceRGB", "/DeviceGray"].includes(cs) && !cs.startsWith("["))) continue;
    if (cs?.startsWith("[")) {
      // Only ICC profiles with 1 or 3 components (gray/RGB), never CMYK.
      const arr = d.lookup(PDFName.of("ColorSpace"), PDFArray);
      const icc = arr.size() === 2 && arr.get(0).toString() === "/ICCBased" ? arr.lookup(1) : undefined;
      const comps = icc instanceof PDFRawStream ? icc.dict.lookup(PDFName.of("N")) : undefined;
      if (!(comps instanceof PDFNumber) || ![1, 3].includes(comps.asNumber())) continue;
    }
    const out = await reencode(obj.contents, opts.maxDim, opts.quality).catch(() => null);
    onImage?.(++n);
    if (!out || out.bytes.length >= obj.contents.length) continue;
    const nd = d.clone(ctx);
    nd.set(PDFName.of("Width"), PDFNumber.of(out.width));
    nd.set(PDFName.of("Height"), PDFNumber.of(out.height));
    nd.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
    nd.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
    nd.set(PDFName.of("Length"), PDFNumber.of(out.bytes.length));
    ctx.assign(ref, PDFRawStream.of(nd, out.bytes));
  }
  const bytes = await pdf.save({ useObjectStreams: true });
  return { bytes, before: input.length, after: bytes.length, smaller: bytes.length < input.length };
}
