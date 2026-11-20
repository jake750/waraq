import { describe, expect, it } from "vitest";
import { nightPixels } from "../../src/reader/night";

const px = (...rgb: number[]) => {
  const d = new Uint8ClampedArray([...rgb, 255]);
  nightPixels(d);
  return [...d.slice(0, 3)];
};

describe("nightPixels", () => {
  it("turns black ink bright white and white paper near-black", () => {
    expect(px(0, 0, 0)).toEqual([255, 255, 255]);
    expect(px(255, 255, 255)).toEqual([18, 18, 18]);
  });
  it("keeps the hue of coloured ink and only flips its lightness", () => {
    const [r, g, b] = px(0, 0, 128); // dark blue → light blue
    expect(b).toBeGreaterThan(r);
    expect(r).toBe(g);
    expect(r).toBeGreaterThan(100);
  });
  it("leaves alpha alone", () => {
    const d = new Uint8ClampedArray([10, 20, 30, 77]);
    nightPixels(d);
    expect(d[3]).toBe(77);
  });
});
