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
