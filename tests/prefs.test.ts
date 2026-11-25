import { loadLang, loadTheme } from "../src/prefs";

test("theme defaults to dark when nothing is saved", () => {
  expect(loadTheme()).toBe("dark");
});

test("first run follows the system language", () => {
  expect(loadLang("ar-SA")).toBe("ar");
  expect(loadLang("ar")).toBe("ar");
  expect(loadLang("en-US")).toBe("en");
  expect(loadLang("arn")).toBe("en");
});

test("a document's view mode is remembered, newest first, without storage it falls back", async () => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  const { loadDocView, saveDocView } = await import("../src/prefs");
  expect(loadDocView("a")).toEqual({});
  saveDocView("a", { view: "spread", rtl: true });
  saveDocView("b", { view: "single" });
  saveDocView("a", { view: "continuous", rtl: true });
  expect(loadDocView("a")).toEqual({ view: "continuous", rtl: true });
  expect(loadDocView("b")).toEqual({ view: "single" });
  expect(JSON.parse(store.get("waraq.docViews")!)[0][0]).toBe("a");
  delete (globalThis as any).localStorage;
});

test("paper choice maps to page size and orientation", async () => {
  const { paperPage } = await import("../src/prefs");
  expect(paperPage("A4")).toEqual({ size: "A4", landscape: false });
  expect(paperPage("Letter-landscape")).toEqual({ size: "Letter", landscape: true });
});

test("the page tone and night look are remembered, damaged values fall back", async () => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  const { loadNightPrefs, saveNightPrefs } = await import("../src/prefs");
  expect(loadNightPrefs()).toEqual({ tone: "day", level: 1, warm: false });
  saveNightPrefs({ tone: "auto", level: 2, warm: true });
  expect(loadNightPrefs()).toEqual({ tone: "auto", level: 2, warm: true });
  store.set("waraq.night", '{"tone":"purple","level":9}');
  expect(loadNightPrefs()).toEqual({ tone: "day", level: 1, warm: false });
  store.set("waraq.night", "{oops");
  expect(loadNightPrefs().tone).toBe("day");
  delete (globalThis as any).localStorage;
});
