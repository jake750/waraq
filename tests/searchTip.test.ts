import { findMatches } from "../src/text/search";

// The search panel's tip promises this; keep the promise true.
test("plain search ignores vowel marks and hamza forms", () => {
  const m = findMatches(["دين الإِسْلَام"], "اسلام", { loose: true, caseSensitive: false });
  expect(m.length).toBe(1);
});
