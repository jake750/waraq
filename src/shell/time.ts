export type Ago = { unit: "now" | "min" | "h" | "d"; n: number };

const dayNumber = (t: number) => {
  const d = new Date(t);
  return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
};

/**
 * How long ago `then` was: minutes, then hours (same day, or under 12 hours), then calendar days
 * (so last night is "yesterday", not "19 hours ago").
 */
export function ago(then: number, now: number): Ago {
  const min = Math.floor((now - then) / 60_000);
  if (min < 1) return { unit: "now", n: 0 };
  if (min < 60) return { unit: "min", n: min };
  const days = dayNumber(now) - dayNumber(then);
  if (days < 1 || min < 12 * 60) return { unit: "h", n: Math.floor(min / 60) };
  return { unit: "d", n: days };
}
