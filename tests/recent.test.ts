import { RecentStore } from "../src/files/recent";
import { memKV } from "./helpers";

test("most recent first, deduped, capped", async () => {
  let t = 0;
  const s = new RecentStore(memKV(), () => ++t, 3);
  for (const p of ["a", "b", "c", "a", "d"]) await s.touch({ kind: "path", path: p }, p);
  expect((await s.list()).map((i) => i.key)).toEqual(["d", "a", "c"]);
});

test("last page survives touch", async () => {
  const s = new RecentStore(memKV());
  const r = { kind: "path", path: "x" } as const;
  await s.touch(r, "x");
  await s.setLastPage("x", 7);
  await s.touch(r, "x");
  expect((await s.list())[0].lastPage).toBe(7);
});

test("remove", async () => {
  const s = new RecentStore(memKV());
  await s.touch({ kind: "path", path: "x" }, "x");
  await s.remove("x");
  expect(await s.list()).toEqual([]);
});

test("uri refs are keyed by uri", async () => {
  const s = new RecentStore(memKV());
  const item = await s.touch({ kind: "uri", uri: "content://docs/1" }, "a.pdf");
  expect(item).toMatchObject({ key: "content://docs/1", name: "a.pdf", lastPage: 1 });
});

test("setLastPage on unknown key is ignored", async () => {
  const s = new RecentStore(memKV());
  await s.setLastPage("nope", 3);
  expect(await s.list()).toEqual([]);
});

test("the same Android file under a new uri replaces its old entry and keeps the page", async () => {
  const s = new RecentStore(memKV());
  await s.touch({ kind: "uri", uri: "content://a/1" }, "report.pdf");
  await s.setLastPage("content://a/1", 4);
  await s.touch({ kind: "path", path: "report.pdf" }, "report.pdf");
  const item = await s.touch({ kind: "uri", uri: "content://b/9" }, "report.pdf");
  expect(item.lastPage).toBe(4);
  expect((await s.list()).map((i) => i.key)).toEqual(["content://b/9", "report.pdf"]);
});
