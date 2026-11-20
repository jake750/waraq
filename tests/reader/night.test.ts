import { describe, expect, it } from "vitest";
import { darkAreas, nightOffThread, nightPixels, quadsBox } from "../../src/reader/night";

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

describe("nightOffThread", () => {
  it("falls back to the main thread where there are no workers", async () => {
    const out = await nightOffThread(new Uint8ClampedArray([0, 0, 0, 255]));
    expect([...out]).toEqual([255, 255, 255, 255]);
  });
});

describe("darkAreas", () => {
  // 30x30 white page with a 10px dark frame, a 1px dark "text" line and a white dot inside the frame.
  const W = 30;
  const at = (x: number, y: number) => y * W + x;
  const page = () => {
    const d = new Uint8ClampedArray(W * W * 4).fill(255);
    const set = (x: number, y: number, v: number) => d.set([v, v, v], at(x, y) * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (x < 10 || y < 10 || x >= 20 || y >= 20) set(x, y, 38);
    for (let x = 11; x < 19; x++) set(x, 15, 0); // thin ink
    set(5, 5, 255); // light text inside the frame
    return d;
  };
  it("keeps thick dark areas and the light text inside them, but not thin ink", () => {
    const keep = darkAreas(page(), W, 2);
    expect(keep[at(0, 0)]).toBe(1);
    expect(keep[at(5, 5)]).toBe(1);
    expect(keep[at(15, 15)]).toBe(0);
    expect(keep[at(15, 12)]).toBe(0);
  });
  it("nightPixels leaves those areas as they were and flips the rest", () => {
    const d = page();
    nightPixels(d, W, 2);
    expect([...d.slice(0, 3)]).toEqual([38, 38, 38]);
    expect(d[at(5, 5) * 4]).toBe(255);
    expect(d[at(15, 15) * 4]).toBe(255); // ink turns white
    expect(d[at(15, 12) * 4]).toBe(18); // paper turns dark
  });
});
