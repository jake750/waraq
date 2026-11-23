// @vitest-environment happy-dom
import { vi } from "vitest";

const made: { cb: IntersectionObserverCallback; watched: Set<Element> }[] = [];
class FakeIO {
  watched = new Set<Element>();
  constructor(public cb: IntersectionObserverCallback) {
    made.push(this);
  }
  observe(el: Element) {
    this.watched.add(el);
  }
  unobserve(el: Element) {
    this.watched.delete(el);
  }
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", FakeIO);
const { watchNear } = await import("../../src/pdf/useNear");

test("many elements share one observer per margin, and each hears only about itself", () => {
  const a = document.createElement("div");
  const b = document.createElement("div");
  const seen: string[] = [];
  const stopA = watchNear(a, "400px 0px", (n) => seen.push(`a:${n}`));
  watchNear(b, "400px 0px", (n) => seen.push(`b:${n}`));
  watchNear(document.createElement("div"), "800px 0px", () => {});
  expect(made).toHaveLength(2);
  made[0].cb([{ target: b, isIntersecting: true } as never], made[0] as never);
  expect(seen).toEqual(["b:true"]);
  stopA();
  expect(made[0].watched.has(a)).toBe(false);
  made[0].cb([{ target: a, isIntersecting: true } as never], made[0] as never);
  expect(seen).toEqual(["b:true"]);
});
