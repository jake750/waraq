// Phone photos are often stored sideways with an EXIF tag saying how to turn them. PDF ignores
// EXIF, so we read the tag and draw the untouched JPEG with a matching transform (no re-encode).

/** EXIF orientation 1–8 of a JPEG; 1 when absent, unreadable, or not a JPEG. */
export function jpegOrientation(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let p = 2;
  while (p + 4 <= b.length && b[p] === 0xff) {
    const marker = b[p + 1];
    const len = (b[p + 2] << 8) | b[p + 3];
    if (marker === 0xda || marker === 0xd9) break; // image data starts: no more metadata
    if (marker === 0xe1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) {
      const t = p + 10; // TIFF header
      const little = b[t] === 0x49;
      const u16 = (i: number) => (little ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
      const u32 = (i: number) => (little ? u16(i) | (u16(i + 2) << 16) : (u16(i) << 16) | u16(i + 2)) >>> 0;
      const ifd = t + u32(t + 4);
      if (ifd + 2 > b.length) return 1;
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 12 > b.length) return 1;
        if (u16(e) === 0x0112) {
          const o = u16(e + 8);
          return o >= 1 && o <= 8 ? o : 1;
        }
      }
      return 1;
    }
    p += 2 + len;
  }
  return 1;
}

/** Orientations 5–8 swap width and height on screen. */
export const swapsSides = (o: number) => o >= 5 && o <= 8;

/**
 * The `cm` matrix [a b c d e f] that draws an image XObject (unit square) into the box
 * x, y, w, h (the box is the image as displayed, after turning it by its orientation).
 */
export function orientMatrix(o: number, x: number, y: number, w: number, h: number): [number, number, number, number, number, number] {
  switch (o) {
    case 2: return [-w, 0, 0, h, x + w, y];
    case 3: return [-w, 0, 0, -h, x + w, y + h];
    case 4: return [w, 0, 0, -h, x, y + h];
    case 5: return [0, -h, -w, 0, x + w, y + h];
    case 6: return [0, -h, w, 0, x, y + h];
    case 7: return [0, h, w, 0, x, y];
    case 8: return [0, h, -w, 0, x + w, y];
    default: return [w, 0, 0, h, x, y];
  }
}
