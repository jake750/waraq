import { describe, expect, it } from "vitest";
import { nightPixels, quadsBox } from "../../src/reader/night";

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

describe("nightPixels runs", () => {
  it("gives repeated pixels the same result as a single one", () => {
    const d = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 128, 255, 0, 0, 128, 255]);
    nightPixels(d);
    expect([...d.slice(0, 3)]).toEqual([18, 18, 18]);
    expect([...d.slice(4, 7)]).toEqual([18, 18, 18]);
    expect([...d.slice(12, 15)]).toEqual([...d.slice(8, 11)]);
  });
});

describe("quadsBox", () => {
  it("bounds the pictures and clamps to the canvas", () => {
    expect(quadsBox([[10.5, 20, 50, 20, 50, 60, 10.5, 60]], 100, 100)).toEqual({ x: 10, y: 20, w: 40, h: 40 });
    expect(quadsBox([[-5, -5, 200, -5, 200, 200, -5, 200]], 100, 80)).toEqual({ x: 0, y: 0, w: 100, h: 80 });
    expect(quadsBox([[150, 150, 160, 150, 160, 160, 150, 160]], 100, 100)).toBeNull();
    expect(quadsBox([], 100, 100)).toBeNull();
  });
});
