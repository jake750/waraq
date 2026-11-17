import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { CREDITS } from "../../src/shell/credits";

test("every shipped dependency is credited in About", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const credited = new Set(CREDITS.map((c) => c.pkg).filter(Boolean));
  const shipped = Object.keys(pkg.dependencies).filter((d) => !d.startsWith("@tauri-apps/plugin-"));
  expect(shipped.filter((d) => !credited.has(d) && d !== "react-dom")).toEqual([]);
});
