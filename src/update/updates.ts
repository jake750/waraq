// Pure update logic (Node-testable): version comparison and the automatic-check schedule.

/** At most one automatic check a day; "Check now" in Settings is never throttled. */
export const AUTO_CHECK_EVERY = 24 * 60 * 60 * 1000;

type Parsed = { nums: number[]; pre: string | null };

function parse(v: string): Parsed | null {
  const m = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
  if (!m) return null;
  return { nums: m[1].split(".").map(Number), pre: m[2] ?? null };
}

/** True when `latest` is a strictly newer version than `current` (semver-style). */
export function isNewer(current: string, latest: string): boolean {
  const a = parse(current);
  const b = parse(latest);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
    const d = (b.nums[i] ?? 0) - (a.nums[i] ?? 0);
    if (d) return d > 0;
  }
  // Same numbers: a release beats its pre-release; two pre-releases compare as text.
  if (a.pre && !b.pre) return true;
  if (!a.pre || !b.pre) return false;
  return b.pre.localeCompare(a.pre, "en", { numeric: true }) > 0;
}

export function shouldAutoCheck(enabled: boolean, lastCheck: number | null, now: number): boolean {
  return enabled && (lastCheck === null || now - lastCheck >= AUTO_CHECK_EVERY);
}
