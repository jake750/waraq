import { open } from "@tauri-apps/plugin-dialog";
import { keepAccess, toDocRef, type DocRef } from "../files/docRef";

/** The system file dialog, PDFs only. Kept apart from ToolsScreen so the app shell can use it without loading the tools. */
export async function pickPdfs(multiple: boolean): Promise<DocRef[]> {
  // Browser preview only: ?pick=/fixtures/a.pdf,/fixtures/b.pdf stands in for the file dialog.
  const dev = import.meta.env.DEV ? new URLSearchParams(location.search).get("pick") : null;
  if (dev) return dev.split(",").map((p) => ({ kind: "path", path: `dev:${p}` }));
  const r = await open({ multiple, directory: false, filters: [{ name: "PDF", extensions: ["pdf"] }] }).catch(() => null);
  return keepAccess((Array.isArray(r) ? r : typeof r === "string" ? [r] : []).map(toDocRef));
}
