import { loadTheme } from "../src/prefs";

test("theme defaults to dark when nothing is saved", () => {
  expect(loadTheme()).toBe("dark");
});
