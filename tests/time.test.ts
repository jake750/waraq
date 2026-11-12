import { ago } from "../src/shell/time";

const M = 60_000;
test.each([
  [10_000, { unit: "now", n: 0 }],
  [5 * M, { unit: "min", n: 5 }],
  [3 * 60 * M, { unit: "h", n: 3 }],
  [50 * 60 * M, { unit: "d", n: 2 }],
])("ago(%i)", (diff, out) => expect(ago(1_000_000_000, 1_000_000_000 + diff)).toEqual(out));
