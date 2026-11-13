// @vitest-environment happy-dom
import { pageCanvas } from "../src/pdf/pageCanvas";

describe("pageCanvas", () => {
  it("is pinned left-to-right, so an Arabic UI doesn't reorder the PDF's glyphs", () => {
    document.documentElement.dir = "rtl";
    const host = document.createElement("div");
    document.body.append(host);
    const c = pageCanvas();
    host.append(c);
    expect(c).toBeInstanceOf(HTMLCanvasElement);
    expect(c.dir).toBe("ltr");
  });
});
