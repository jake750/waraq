// JPG/PNG images → one PDF, one image per page. (WEBP is turned into PNG by the caller with a canvas.)
import { concatTransformationMatrix, drawObject, PDFDocument, popGraphicsState, pushGraphicsState, type PDFImage, type PDFPage } from "pdf-lib";
import { jpegOrientation, orientMatrix, swapsSides } from "./exif";
import type { PageOpts } from "./fromHtml";

export type ImageInput = { bytes: Uint8Array; fmt: "png" | "jpg" };
export type ImagesOpts = PageOpts & { fit: "page" | "image" };

const SIZES = { A4: [595.28, 841.89], Letter: [612, 792] } as const;
const MM = 72 / 25.4;
const PX = 0.75; // 96 dpi pixels → points

/** Draws the image into the box as it is meant to be seen, turned by its EXIF orientation. */
function draw(page: PDFPage, img: PDFImage, o: number, x: number, y: number, w: number, h: number) {
  const name = page.node.newXObject("Image", img.ref);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...orientMatrix(o, x, y, w, h)), drawObject(name), popGraphicsState());
}

export async function imagesToPdf(images: ImageInput[], opts: ImagesOpts, onImage?: (n: number) => void): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const [i, img] of images.entries()) {
    const embedded = img.fmt === "png" ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    const o = img.fmt === "jpg" ? jpegOrientation(img.bytes) : 1;
    const [sw, sh] = swapsSides(o) ? [embedded.height, embedded.width] : [embedded.width, embedded.height];
    const iw = sw * PX;
    const ih = sh * PX;
    const m = opts.marginMm * MM;
    if (opts.fit === "image") {
      const page = pdf.addPage([iw + 2 * m, ih + 2 * m]);
      draw(page, embedded, o, m, m, iw, ih);
    } else {
      const [a, b] = SIZES[opts.size];
      const [pw, ph] = opts.landscape ? [b, a] : [a, b];
      const page = pdf.addPage([pw, ph]);
      const k = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih, 1 / PX); // never upscale past 72 dpi of the source
      const w = iw * k;
      const h = ih * k;
      draw(page, embedded, o, (pw - w) / 2, (ph - h) / 2, w, h);
    }
    onImage?.(i + 1);
  }
  return pdf.save({ useObjectStreams: true });
}
