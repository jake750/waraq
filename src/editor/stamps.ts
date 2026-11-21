// Ready-made stamps (Approved, Draft…): drawn once into a PNG and placed like an image, so they move,
// resize and save the same way and look identical in every PDF reader.

export const STAMPS = ["approved", "rejected", "draft", "confidential", "received", "paid"] as const;
export type StampKind = (typeof STAMPS)[number];

export const STAMP_COLORS: Record<StampKind, string> = {
  approved: "#1d7a3e",
  rejected: "#b42323",
  draft: "#2c58b0",
  confidential: "#b42323",
  received: "#2c58b0",
  paid: "#1d7a3e",
};

/** Canvas size of a stamp, in CSS pixels before the ×`k` sharpness factor. */
export function stampSize(labelW: number, subW: number, size: number, subSize: number, pad: number) {
  return { w: Math.ceil(Math.max(labelW, subW) + pad * 2), h: Math.ceil(size * 1.25 + subSize * 1.5 + pad * 1.6) };
}

/** The stamp as a transparent PNG: a rounded frame, the label in bold and the date under it. */
export async function renderStamp(label: string, sub: string, color: string): Promise<{ bytes: Uint8Array; fmt: "png"; w: number; h: number }> {
  const family = `"IBM Plex Sans Arabic", system-ui, sans-serif`;
  await document.fonts?.load(`700 24px ${family}`).catch(() => {});
  const k = 3;
  const [size, subSize, pad, line] = [26 * k, 11 * k, 14 * k, 3 * k];
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const bold = `700 ${size}px ${family}`;
  const small = `600 ${subSize}px ${family}`;
  ctx.font = bold;
  const lw = ctx.measureText(label).width;
  ctx.font = small;
  const sw = ctx.measureText(sub).width;
  const { w, h } = stampSize(lw, sw, size, subSize, pad);
  c.width = w;
  c.height = h;
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.roundRect(line / 2, line / 2, w - line, h - line, 8 * k);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = bold;
  ctx.fillText(label, w / 2, pad * 0.7 + size);
  ctx.font = small;
  ctx.fillText(sub, w / 2, pad * 0.7 + size * 1.25 + subSize);
  const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("encode"))), "image/png"));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), fmt: "png", w: w / k, h: h / k };
}
