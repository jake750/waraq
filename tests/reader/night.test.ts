import { describe, expect, it, vi } from "vitest";
import { darkAreas, isDarkPage, nightOffThread, nightPixels, paperLike, quadsBox, type NightOptions } from "../../src/reader/night";

const px = (rgb: number[], o?: NightOptions) => {
  const d = new Uint8ClampedArray([...rgb, 255]);
  nightPixels(d, 0, 0, o);
  return [...d.slice(0, 3)];
};

describe("nightPixels", () => {
  it("turns black ink soft white and white paper near-black", () => {
    expect(px([0, 0, 0])).toEqual([226, 226, 226]);
    expect(px([255, 255, 255])).toEqual([18, 18, 18]);
  });
  it("keeps the hue of coloured ink and only flips its lightness", () => {
    const [r, g, b] = px([0, 0, 128]); // dark blue → light blue
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
    expect([...out]).toEqual([226, 226, 226, 255]);
  });

  it("fails the waiting pages when the worker breaks, then works on the main thread", async () => {
    vi.resetModules();
    class BrokenWorker {
      onmessage: unknown = null;
      onerror: (() => void) | null = null;
      onmessageerror: (() => void) | null = null;
      postMessage() {
        setTimeout(() => this.onerror?.());
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", BrokenWorker);
    try {
      const night = await import("../../src/reader/night");
      await expect(night.nightOffThread(new Uint8ClampedArray([0, 0, 0, 255]))).rejects.toThrow();
      const out = await night.nightOffThread(new Uint8ClampedArray([0, 0, 0, 255]));
      expect([...out]).toEqual([226, 226, 226, 255]);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});

describe("darkAreas", () => {
  // 60x60 white page with a 10px dark frame, a 1px dark "text" line and a white dot inside the frame.
  const W = 60;
  const at = (x: number, y: number) => y * W + x;
  const page = () => {
    const d = new Uint8ClampedArray(W * W * 4).fill(255);
    const set = (x: number, y: number, v: number) => d.set([v, v, v], at(x, y) * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (x < 10 || y < 10 || x >= 50 || y >= 50) set(x, y, 38);
    for (let x = 20; x < 40; x++) set(x, 30, 0); // thin ink
    set(5, 5, 255); // light text inside the frame
    return d;
  };
  it("keeps thick dark areas and the light text inside them, but not thin ink or the paper they frame", () => {
    const keep = darkAreas(page(), W, 2, true)!;
    expect(keep[at(0, 0)]).toBe(1);
    expect(keep[at(5, 5)]).toBe(1);
    expect(keep[at(30, 30)]).toBe(0);
    expect(keep[at(30, 25)]).toBe(0);
    expect(keep[at(10, 30)]).toBe(2); // just outside the frame: takes its colour
  });
  it("nightPixels leaves those areas as they were and flips the rest", () => {
    const d = page();
    nightPixels(d, W, 2);
    expect([...d.slice(0, 3)]).toEqual([38, 38, 38]);
    expect(d[at(5, 5) * 4]).toBe(255);
    expect(d[at(30, 30) * 4]).toBe(226); // ink turns light
    expect(d[at(30, 25) * 4]).toBe(18); // paper turns dark
    expect(d[at(10, 30) * 4]).toBe(38); // no bright outline along the frame
  });
});

describe("isDarkPage", () => {
  const fill = (n: number, dark: number) => {
    const d = new Uint8ClampedArray(n * 4).fill(255);
    for (let j = 0; j < dark; j++) d.set([20, 10, 10], j * 4);
    return d;
  };
  it("spots a page that is mostly dark already", () => {
    expect(isDarkPage(fill(10000, 8000))).toBe(true);
  });
  it("leaves a white page with dark ink to be recoloured", () => {
    expect(isDarkPage(fill(10000, 2000))).toBe(false);
    expect(isDarkPage(new Uint8ClampedArray(0))).toBe(false);
  });
});

describe("night options", () => {
  it("dims or brightens the text", () => {
    expect(px([0, 0, 0], { level: 0, warm: false })[0]).toBeLessThan(px([0, 0, 0])[0]);
    expect(px([0, 0, 0], { level: 2, warm: false })[0]).toBeGreaterThan(px([0, 0, 0])[0]);
  });
  it("warm tint holds back blue", () => {
    const [r, g, b] = px([0, 0, 0], { level: 1, warm: true });
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
  it("makes pure blue and red text as readable as black text", () => {
    const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(lum(px([0, 0, 255]))).toBeGreaterThan(180);
    expect(lum(px([255, 0, 0]))).toBeGreaterThan(150);
  });
});

describe("dense dark boxes", () => {
  // Left half: white paper with black lines. Right half: a dark box with white lines too close
  // together for its background to survive erosion on its own.
  const W = 200;
  const at = (x: number, y: number) => y * W + x;
  const page = () => {
    const d = new Uint8ClampedArray(W * W * 4).fill(255);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        if (x >= 100) d.set(y % 3 === 0 && x > 110 && x < 190 ? [250, 250, 250] : [30, 30, 30], at(x, y) * 4);
        else if (y % 4 === 0 && x > 10 && x < 90) d.set([0, 0, 0], at(x, y) * 4);
      }
    return d;
  };
  it("keeps the box and its text, and still flips the paper beside it", () => {
    const d = page();
    nightPixels(d, W, 4);
    expect(d[at(150, 99) * 4]).toBe(250); // light text in the box stays light
    expect(d[at(150, 100) * 4]).toBe(30); // the box between lines stays dark
    expect(d[at(50, 100) * 4]).toBe(226); // ink on paper turns light
    expect(d[at(50, 101) * 4]).toBe(18); // paper turns dark
  });
  it("skips the filters on a plain text page", () => {
    const d = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    for (let x = 0; x < 100; x++) d.set([0, 0, 0], (50 * 100 + x) * 4);
    expect(darkAreas(d, 100, 4, true)).toBeNull();
  });
});

describe("paperLike", () => {
  const img = (rgb: number[], n = 100, ink = 0) => {
    const d = new Uint8ClampedArray(n * 4);
    for (let j = 0; j < n; j++) d.set(j < ink ? [10, 10, 10, 255] : [...rgb, 255], j * 4);
    return d;
  };
  it("treats a scan (white with dark text) as paper", () => {
    expect(paperLike(img([245, 242, 235], 100, 20))).toBe(true);
  });
  it("keeps photos and colourful pictures as they are", () => {
    expect(paperLike(img([90, 140, 60]))).toBe(false);
    expect(paperLike(img([250, 200, 120]))).toBe(false);
    expect(paperLike(new Uint8ClampedArray(0))).toBe(false);
  });
});

describe("sepia", () => {
  const px = (...v: number[]) => new Uint8ClampedArray(v);
  it("turns white paper cream and black ink brown, without flipping", () => {
    const d = px(255, 255, 255, 255, 0, 0, 0, 255);
    nightPixels(d, 2, 4, { level: 1, warm: false, sepia: true });
    expect([...d]).toEqual([244, 232, 206, 255, 48, 37, 26, 255]);
  });
  it("keeps colours apart and gets warmer with the level", () => {
    const blue = px(30, 60, 200, 255);
    nightPixels(blue, 0, 0, { level: 1, warm: false, sepia: true });
    expect(blue[2]).toBeGreaterThan(blue[0]);
    const light = px(255, 255, 255, 255);
    const deep = px(255, 255, 255, 255);
    nightPixels(light, 0, 0, { level: 0, warm: false, sepia: true });
    nightPixels(deep, 0, 0, { level: 2, warm: false, sepia: true });
    expect(light[0] - light[2]).toBeLessThan(deep[0] - deep[2]);
  });
  it("leaves dense dark boxes dark (no flip, no keep mask needed)", () => {
    const d = new Uint8ClampedArray(40 * 40 * 4).fill(0);
    nightPixels(d, 40, 4, { level: 1, warm: false, sepia: true });
    expect(d[0]).toBe(48);
  });
});
