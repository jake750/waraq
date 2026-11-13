import { isNewer, shouldAutoCheck, AUTO_CHECK_EVERY } from "../src/update/updates";

describe("isNewer", () => {
  it("compares numerically, part by part", () => {
    expect(isNewer("0.1.0", "0.2.0")).toBe(true);
    expect(isNewer("0.9.0", "0.10.0")).toBe(true);
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
    expect(isNewer("1.3.0", "1.2.9")).toBe(false);
  });
  it("ignores a leading v and missing parts", () => {
    expect(isNewer("v1.0", "1.0.1")).toBe(true);
    expect(isNewer("1", "v1.0.0")).toBe(false);
  });
  it("treats a pre-release as older than its release", () => {
    expect(isNewer("1.0.0-beta.1", "1.0.0")).toBe(true);
    expect(isNewer("1.0.0", "1.0.0-beta.1")).toBe(false);
  });
  it("never offers an unreadable version", () => {
    expect(isNewer("1.0.0", "garbage")).toBe(false);
  });
});

describe("shouldAutoCheck", () => {
  const now = 1_800_000_000_000;
  it("checks when enabled and never checked", () => {
    expect(shouldAutoCheck(true, null, now)).toBe(true);
  });
  it("waits a day between automatic checks", () => {
    expect(shouldAutoCheck(true, now - AUTO_CHECK_EVERY + 1000, now)).toBe(false);
    expect(shouldAutoCheck(true, now - AUTO_CHECK_EVERY, now)).toBe(true);
  });
  it("never checks when turned off", () => {
    expect(shouldAutoCheck(false, null, now)).toBe(false);
  });
});
