// "Report a problem": opens a new GitHub issue with the app version and system filled in.
// Nothing else is sent: no file names, no paths, no personal data. The user writes the rest.

export const ISSUES_URL = "https://github.com/jake750/waraq/issues/new";

export function reportUrl(version: string | null, system: string, title: string, body: string): string {
  const facts = `\n\n---\nWaraq ${version ?? "dev"} · ${system}`;
  const q = new URLSearchParams({ title, body: body + facts });
  return `${ISSUES_URL}?${q.toString()}`;
}

/** A short system name from the user agent ("Android 14", "Windows", "macOS"). */
export function systemName(ua: string): string {
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "unknown";
}
