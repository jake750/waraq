import { ago } from "../src/shell/time";

const M = 60_000;
const at = (h: number, m = 0, day = 14) => new Date(2026, 10, day, h, m).getTime();

test.each([
  [at(12), at(12, 0) + 10_000, { unit: "now", n: 0 }],
  [at(12), at(12, 5), { unit: "min", n: 5 }],
  [at(9), at(12), { unit: "h", n: 3 }],
  [at(22, 0, 13), at(17), { unit: "d", n: 1 }], // 19 hours, but it was last night: yesterday
  [at(23, 30, 13), at(0, 20), { unit: "min", n: 50 }],
  [at(10, 0, 12), at(12), { unit: "d", n: 2 }],
])("ago(%i, %i)", (then, now, out) => expect(ago(then, now)).toEqual(out));

test("an hour is still an hour across midnight", () => {
  expect(ago(at(23, 0, 13), at(0, 30))).toEqual({ unit: "h", n: 1 });
  expect(ago(at(12) - 90 * M, at(12))).toEqual({ unit: "h", n: 1 });
});
