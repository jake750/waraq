import { reportUrl, systemName } from "../../src/shell/report";

test("the report link carries only version and system", () => {
  const u = new URL(reportUrl("0.2.8", "Android 14", "Problem", "What happened:"));
  expect(u.origin + u.pathname).toBe("https://github.com/jake750/waraq/issues/new");
  expect(u.searchParams.get("body")).toBe("What happened:\n\n---\nWaraq 0.2.8 · Android 14");
});

test("system names", () => {
  expect(systemName("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit")).toBe("Android 14");
  expect(systemName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
  expect(systemName("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("macOS");
});
