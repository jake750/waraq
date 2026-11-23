import { DraftStore } from "../../src/editor/drafts";
import type { Mark } from "../../src/editor/marks";
import { memKV } from "../helpers";

const note: Mark = { id: "n1", page: 0, kind: "note", at: [1, 2], text: "مرحبا", color: [1, 0, 0] };
const image: Mark = { id: "i1", page: 0, kind: "image", box: { x: 0, y: 0, w: 10, h: 10 }, bytes: new Uint8Array([1, 2, 250]), fmt: "png" };

test("a draft comes back with its marks, image bytes and form values", async () => {
  const s = new DraftStore(memKV());
  await s.put("doc", [note, image], { name: "Ali" });
  const d = await s.get("doc");
  expect(d?.marks[0]).toEqual(note);
  expect((d?.marks[1] as Extract<Mark, { kind: "image" }>).bytes).toEqual(new Uint8Array([1, 2, 250]));
  expect(d?.values).toEqual({ name: "Ali" });
});

test("an empty draft is removed, and only the newest five are kept", async () => {
  const s = new DraftStore(memKV());
  await s.put("doc", [note], {});
  await s.put("doc", [], {});
  expect(await s.get("doc")).toBe(null);
  for (let i = 0; i < 7; i++) await s.put(`d${i}`, [note], {});
  expect(await s.get("d0")).toBe(null);
  expect(await s.get("d6")).not.toBe(null);
});

test("drafts move out of the settings store once, and an old one survives the move", async () => {
  const settings = memKV();
  await new DraftStore(settings).put("old", [note], {});
  const own = memKV();
  const s = new DraftStore(own, Date.now, settings);
  expect((await s.get("old"))?.marks).toEqual([note]);
  expect(await settings.get("drafts")).toEqual([]);
  expect(await own.get("drafts")).toHaveLength(1);
});

test("drafts that would grow too big keep only the newest", async () => {
  const s = new DraftStore(memKV());
  const big = (id: string): Mark => ({ ...image, id, bytes: new Uint8Array(10 * 1024 * 1024) });
  await s.put("a", [big("a")], {});
  await s.put("b", [big("b")], {});
  await s.put("c", [big("c")], {});
  expect(await s.get("c")).not.toBe(null);
  expect(await s.get("a")).toBe(null); // three 13 MB drafts don't fit; the newest always does
});
