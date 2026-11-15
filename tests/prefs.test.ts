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
