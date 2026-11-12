import { dict, dirFor } from "../src/i18n";

const keys = (o: object): string[] =>
  Object.entries(o)
    .flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((s) => `${k}.${s}`) : [k]))
    .sort();

test("ar has exactly the en keys", () => expect(keys(dict.ar)).toEqual(keys(dict.en)));

test("no empty strings", () => {
  for (const l of ["en", "ar"] as const)
    JSON.stringify(dict[l], (_k, v) => {
      if (v === "") throw new Error(l);
      return v;
    });
});

test("dir", () => {
  expect(dirFor("ar")).toBe("rtl");
  expect(dirFor("en")).toBe("ltr");
});
