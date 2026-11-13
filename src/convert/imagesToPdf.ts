// JPG/PNG images → one PDF, one image per page. (WEBP is turned into PNG by the caller with a canvas.)
import { PDFDocument } from "pdf-lib";
import type { PageOpts } from "./fromHtml";

export type ImageInput = { bytes: Uint8Array; fmt: "png" | "jpg" };
export type ImagesOpts = PageOpts & { fit: "page" | "image" };

const SIZES = { A4: [595.28, 841.89], Letter: [612, 792] } as const;
const MM = 72 / 25.4;
const PX = 0.75; // 96 dpi pixels → points

export async function imagesToPdf(images: ImageInput[], opts: ImagesOpts, onImage?: (n: number) => void): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const [i, img] of images.entries()) {
    const embedded = img.fmt === "png" ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    const iw = embedded.width * PX;
    const ih = embedded.height * PX;
    const m = opts.marginMm * MM;
    if (opts.fit === "image") {
      const page = pdf.addPage([iw + 2 * m, ih + 2 * m]);
      page.drawImage(embedded, { x: m, y: m, width: iw, height: ih });
    } else {
      const [a, b] = SIZES[opts.size];
      const [pw, ph] = opts.landscape ? [b, a] : [a, b];
      const page = pdf.addPage([pw, ph]);
      const k = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih, 1 / PX); // never upscale past 72 dpi of the source
      const w = iw * k;
      const h = ih * k;
      page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    onImage?.(i + 1);
  }
  return pdf.save({ useObjectStreams: true });
}
