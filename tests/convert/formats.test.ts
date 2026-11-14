import { engineFor, fmtOf, nameWithType, outputName, sniffFmt, targetsFor } from "../../src/convert/formats";

test("formats by extension, any case", () => {
  expect(fmtOf("تقرير.DOCX")).toBe("docx");
  expect(fmtOf("page.Htm")).toBe("html");
  expect(fmtOf("photo.jpeg")).toBe("jpg");
  expect(fmtOf("notes.markdown")).toBe("md");
  expect(fmtOf("archive.zip")).toBeNull();
  expect(fmtOf("noext")).toBeNull();
});

const sorted = (a: string[]) => [...a].sort();

test("conversion matrix on the PC", () => {
  const t = (f: Parameters<typeof targetsFor>[0]) => sorted(targetsFor(f, "desktop"));
  expect(t("docx")).toEqual(sorted(["pdf", "txt", "md", "html"]));
  expect(t("doc")).toEqual(sorted(["pdf", "docx", "txt", "md", "html"]));
  expect(t("odt")).toEqual(sorted(["pdf", "txt", "docx"]));
  expect(t("rtf")).toEqual(sorted(["pdf", "txt", "docx"]));
  expect(t("txt")).toEqual(sorted(["pdf", "docx", "md", "html"]));
  expect(t("md")).toEqual(sorted(["pdf", "docx", "txt", "html"]));
  expect(t("html")).toEqual(sorted(["pdf", "docx", "txt", "md"]));
  expect(t("epub")).toEqual(sorted(["pdf", "txt"]));
  expect(t("pdf")).toEqual(sorted(["docx", "txt", "md", "png", "jpg"]));
  expect(t("png")).toEqual(["pdf"]);
  expect(t("jpg")).toEqual(["pdf"]);
  expect(t("webp")).toEqual(["pdf"]);
});

test("the phone reads legacy .doc built-in, but has no DOC/ODT/RTF → DOCX", () => {
  expect(sorted(targetsFor("doc", "android"))).toEqual(sorted(["pdf", "txt", "md", "html"]));
  expect(sorted(targetsFor("odt", "android"))).toEqual(sorted(["pdf", "txt"]));
  expect(sorted(targetsFor("rtf", "android"))).toEqual(sorted(["pdf", "txt"]));
  expect(sorted(targetsFor("docx", "android"))).toEqual(sorted(["pdf", "txt", "md", "html"]));
});

test("output names never collide and keep the original", () => {
  const none = () => false;
  expect(outputName("تقرير سنوي.docx", "pdf", none)).toBe("تقرير سنوي (converted).pdf");
  const taken = new Set(["a (converted).pdf", "a (converted) (2).pdf"]);
  expect(outputName("a.docx", "pdf", (n) => taken.has(n))).toBe("a (converted) (3).pdf");
  expect(outputName("a.docx", "pdf", (n) => n === "a (converted).pdf")).toBe("a (converted) (2).pdf");
});

test("engines", () => {
  expect(engineFor("docx", "pdf", "desktop", true)).toBe("libreoffice");
  expect(engineFor("docx", "pdf", "desktop", false)).toBe("html");
  expect(engineFor("docx", "pdf", "android", false)).toBe("html");
  expect(engineFor("docx", "txt", "desktop", true)).toBe("html");
  expect(engineFor("doc", "txt", "desktop", true)).toBe("libreoffice");
  expect(engineFor("doc", "pdf", "desktop", false)).toBe("html");
  expect(engineFor("doc", "pdf", "android", false)).toBe("html");
  expect(engineFor("doc", "docx", "android", false)).toBe("libreoffice");
  expect(engineFor("odt", "docx", "desktop", true)).toBe("libreoffice");
  expect(engineFor("rtf", "pdf", "desktop", true)).toBe("libreoffice");
  expect(engineFor("rtf", "txt", "desktop", true)).toBe("html");
  expect(engineFor("md", "pdf", "desktop", true)).toBe("html");
  expect(engineFor("pdf", "docx", "desktop", true)).toBe("pdf");
  expect(engineFor("pdf", "png", "android", false)).toBe("pdf");
  expect(engineFor("jpg", "pdf", "desktop", true)).toBe("images");
});

test("names without an extension get one from the MIME type (Android providers)", () => {
  expect(nameWithType("تقرير", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("تقرير.docx");
  expect(nameWithType("1000", "application/pdf")).toBe("1000.pdf");
  expect(nameWithType("notes", "text/plain; charset=utf-8")).toBe("notes.txt");
  expect(nameWithType("report.docx", "application/octet-stream")).toBe("report.docx");
  expect(nameWithType("report", "application/octet-stream")).toBe("report");
  expect(nameWithType("report", null)).toBe("report");
});

test("formats from the file's own bytes", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (p: string) => new Uint8Array(readFileSync(`fixtures/${p}`));
  for (const [file, fmt] of [
    ["office/sample.docx", "docx"],
    ["office/sample.odt", "odt"],
    ["office/sample.epub", "epub"],
    ["office/sample.rtf", "rtf"],
    ["office/sample.png", "png"],
    ["office/sample.jpg", "jpg"],
    ["office/sample.webp", "webp"],
    ["arabic-book.pdf", "pdf"],
  ] as const)
    expect(sniffFmt(read(file)), file).toBe(fmt);
  expect(sniffFmt(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe("doc");
  expect(sniffFmt(read("office/sample.txt"))).toBeNull();
  expect(fmtOf("report.docx ")).toBe("docx");
});

test("docx is found from the zip's ends, not by scanning the whole file", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const big = new Uint8Array(300 * 1024);
  big.set([0x50, 0x4b, 0x03, 0x04]);
  big.set(enc("word/document.xml"), big.length - 200); // central directory
  expect(sniffFmt(big)).toBe("docx");
  const middle = new Uint8Array(300 * 1024);
  middle.set([0x50, 0x4b, 0x03, 0x04]);
  middle.set(enc("word/document.xml"), 150 * 1024);
  expect(sniffFmt(middle)).toBe(null);
});
