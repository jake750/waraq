import { expect, test } from "vitest";
import { formatBytes, paperLabel, parsePdfDate } from "../../src/reader/docInfo";

test("reads PDF dates with and without a time zone", () => {
  expect(parsePdfDate("D:20240131120000+03'00'")?.toISOString()).toBe("2024-01-31T09:00:00.000Z");
  expect(parsePdfDate("D:20240131120000Z")?.toISOString()).toBe("2024-01-31T12:00:00.000Z");
  expect(parsePdfDate("D:2024")?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  expect(parsePdfDate("yesterday")).toBeNull();
  expect(parsePdfDate(undefined)).toBeNull();
});

test("formats sizes", () => {
  expect(formatBytes(900)).toBe("900 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
});

test("names common paper sizes", () => {
  expect(paperLabel(595.28, 841.89)).toBe("A4 · 210 × 297 mm");
  expect(paperLabel(792, 612)).toBe("Letter · 279 × 216 mm");
  expect(paperLabel(500, 500)).toBe("176 × 176 mm");
});
