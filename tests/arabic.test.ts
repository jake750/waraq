import { detectRtl, normalizeArabic } from "../src/text/arabic";

test.each([
  ["الْكِتَابُ", "الكتاب"],
  ["أحمد", "احمد"],
  ["إسلام", "اسلام"],
  ["آمن", "امن"],
  ["مسؤول", "مسوول"],
  ["شاطئ", "شاطي"],
  ["عَلَى", "علي"],
  ["كتـــاب", "كتاب"],
  ["مدرسة", "مدرسة"],
  ["Hello", "Hello"],
])("normalize %s", (i, o) => expect(normalizeArabic(i)).toBe(o));

test("rtl", () => {
  expect(detectRtl("Hello world")).toBe(false);
  expect(detectRtl("مرحبا بالعالم hello")).toBe(true);
  expect(detectRtl("")).toBe(false);
});
