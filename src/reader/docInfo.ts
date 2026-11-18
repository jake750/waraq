/** PDF dates look like "D:20240131120000+03'00'"; returns null when unreadable. */
export function parsePdfDate(s: string | undefined | null): Date | null {
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/.exec(s?.trim() ?? "");
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", se = "00", tz] = m;
  let iso = `${y}-${mo}-${d}T${h}:${mi}:${se}`;
  if (!tz || tz === "Z") iso += "Z";
  else iso += `${tz.slice(0, 3)}:${tz.replace(/'/g, "").slice(3, 5) || "00"}`;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

/** 1536 → "1.5 KB"; digits stay Latin like the rest of the UI. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Page size in millimetres, named when it is a common paper size. */
export function paperLabel(wPt: number, hPt: number): string {
  const mm = (pt: number) => Math.round((pt * 25.4) / 72);
  const [w, h] = [mm(wPt), mm(hPt)];
  const [a, b] = [Math.min(w, h), Math.max(w, h)];
  const near = (x: number, y: number) => Math.abs(a - x) <= 2 && Math.abs(b - y) <= 2;
  const name = near(210, 297) ? "A4" : near(148, 210) ? "A5" : near(297, 420) ? "A3" : near(216, 279) ? "Letter" : near(216, 356) ? "Legal" : "";
  return `${name ? name + " · " : ""}${w} × ${h} mm`;
}
