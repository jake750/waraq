import { displayName } from "../src/files/docRef";

test("a path keeps its file name", () => {
  expect(displayName({ kind: "path", path: String.raw`C:\كتب\ملف.pdf` }, "Some Title")).toBe("ملف.pdf");
});

test("a content URI that names the file keeps that name", () => {
  const uri = "content://com.android.externalstorage.documents/document/primary%3ADownload%2Farabic-book.pdf";
  expect(displayName({ kind: "uri", uri }, "Title")).toBe("arabic-book.pdf");
});

test("an opaque content URI falls back to the PDF title", () => {
  const uri = "content://com.android.providers.media.documents/document/document%3A1000000070";
  expect(displayName({ kind: "uri", uri }, "  كتاب الورق  ")).toBe("كتاب الورق");
});

test("an opaque content URI without a title gets a generic name", () => {
  const uri = "content://com.android.providers.media.documents/document/document%3A1000000070";
  expect(displayName({ kind: "uri", uri }, "")).toBe("Document.pdf");
});
