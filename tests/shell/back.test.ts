import { describe, expect, it } from "vitest";
import { BACK_DIALOG, BACK_ROUTE, BACK_SCREEN, BackStack } from "../../src/shell/back";

describe("BackStack", () => {
  it("runs nothing and reports false when empty", () => {
    expect(new BackStack().handle()).toBe(false);
  });

  it("prefers higher levels, then the newest step", () => {
    const s = new BackStack();
    const ran: string[] = [];
    s.push(BACK_DIALOG, () => ran.push("dialog"));
    s.push(BACK_ROUTE, () => ran.push("route")); // pushed later, still below the dialog
    s.push(BACK_SCREEN, () => ran.push("tool"));
    s.push(BACK_SCREEN, () => ran.push("fullscreen"));
    s.handle();
    expect(ran).toEqual(["dialog"]);
  });

  it("falls through as steps are removed", () => {
    const s = new BackStack();
    const ran: string[] = [];
    s.push(BACK_ROUTE, () => ran.push("home"));
    const off = s.push(BACK_SCREEN, () => ran.push("tool"));
    s.handle();
    off();
    off(); // removing twice is harmless
    s.handle();
    expect(ran).toEqual(["tool", "home"]);
  });

  it("reports only when it becomes active or empty", () => {
    const changes: boolean[] = [];
    const s = new BackStack((a) => changes.push(a));
    const a = s.push(BACK_ROUTE, () => {});
    const b = s.push(BACK_DIALOG, () => {});
    b();
    a();
    expect(changes).toEqual([true, false]);
    expect(s.active).toBe(false);
  });
});
