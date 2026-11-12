import { hasText, openPdf } from "../src/pdf/openPdf";
import { fx } from "./helpers";

test("opens english", async () => expect((await openPdf(fx("english-two-column.pdf"))).numPages).toBe(3));
test("not a pdf", () => expect(openPdf(fx("not-a-pdf.pdf"))).rejects.toMatchObject({ code: "not-a-pdf" }));
test("truncated", () => expect(openPdf(fx("truncated.pdf"))).rejects.toMatchObject({ code: "not-a-pdf" }));
test("needs password", () => expect(openPdf(fx("password.pdf"))).rejects.toMatchObject({ code: "password-required" }));
test("wrong password", () =>
  expect(openPdf(fx("password.pdf"), "nope")).rejects.toMatchObject({ code: "wrong-password" }));
test("right password", async () => expect((await openPdf(fx("password.pdf"), "test123")).numPages).toBe(2));
test("scanned has no text", async () => expect(await hasText(await openPdf(fx("scanned.pdf")))).toBe(false));
test("arabic has text", async () => expect(await hasText(await openPdf(fx("arabic-book.pdf")))).toBe(true));
