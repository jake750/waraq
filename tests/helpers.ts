import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "fixtures");

export const fx = (name: string): Uint8Array => new Uint8Array(readFileSync(join(dir, name)));
export const readFixtureText = (name: string): string => readFileSync(join(dir, name), "utf8");

import type { KV } from "../src/files/recent";

export function memKV(): KV {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => m.get(k) as T | undefined,
    set: async (k: string, v: unknown) => void m.set(k, structuredClone(v)),
  };
}

/** The sample JPEG with an EXIF APP1 segment carrying this orientation, in big- or little-endian TIFF. */
export function withOrientation(o: number, little = false): Uint8Array {
  const u16 = (n: number) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (little ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(o), 0, 0, ...u32(0)];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const seg = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  return new Uint8Array([0xff, 0xd8, ...seg, ...fx("office/sample.jpg").slice(2)]);
}

