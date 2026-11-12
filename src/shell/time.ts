export type Ago = { unit: "now" | "min" | "h" | "d"; n: number };

/** How long ago `then` was, rounded to the largest whole unit. */
export function ago(then: number, now: number): Ago {
  const min = Math.floor((now - then) / 60_000);
  if (min < 1) return { unit: "now", n: 0 };
  if (min < 60) return { unit: "min", n: min };
  const h = Math.floor(min / 60);
  if (h < 24) return { unit: "h", n: h };
  return { unit: "d", n: Math.floor(h / 24) };
}
