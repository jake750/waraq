import { engineFor, fmtOf, outputName, targetsFor } from "../../src/convert/formats";

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
  expect(t("doc")).toEqual(sorted(["pdf", "docx", "txt"]));
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

test("the phone has no legacy .doc and no ODT/RTF → DOCX", () => {
  expect(targetsFor("doc", "android")).toEqual([]);
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
  expect(engineFor("odt", "docx", "desktop", true)).toBe("libreoffice");
  expect(engineFor("rtf", "pdf", "desktop", true)).toBe("libreoffice");
  expect(engineFor("rtf", "txt", "desktop", true)).toBe("html");
  expect(engineFor("md", "pdf", "desktop", true)).toBe("html");
  expect(engineFor("pdf", "docx", "desktop", true)).toBe("pdf");
  expect(engineFor("pdf", "png", "android", false)).toBe("pdf");
  expect(engineFor("jpg", "pdf", "desktop", true)).toBe("images");
});
