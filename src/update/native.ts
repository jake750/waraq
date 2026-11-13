// Platform side of updates. Desktop: the Tauri updater plugin downloads the signed installer,
// verifies it against the public key in tauri.conf.json, installs it and restarts. Android: the
// plugin doesn't run there, so Rust reads the release's latest.json (`latest_release`) and the
// user gets the new APK from the release page.
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { isAndroid } from "../platform";
import { isNewer } from "./updates";

export const RELEASES_URL = "https://github.com/jake750/waraq/releases/latest";

export type Found = {
  version: string;
  notes?: string;
  /** Desktop: download + install + restart. Android: open the release page. */
  install(onProgress: (done: number, total?: number) => void): Promise<void>;
};

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The installed version, or null outside the app (browser preview). */
export const currentVersion = (): Promise<string | null> => (inTauri() ? getVersion() : Promise.resolve(null));

/** A newer release, or null when this is the latest. Throws when the check itself fails. */
export async function checkForUpdate(): Promise<Found | null> {
  if (!inTauri()) throw new Error("unavailable");
  if (isAndroid()) {
    const [current, latest] = await Promise.all([
      getVersion(),
      invoke<{ version: string; notes?: string | null }>("latest_release"),
    ]);
    if (!isNewer(current, latest.version)) return null;
    return {
      version: latest.version,
      notes: latest.notes ?? undefined,
      install: async () => {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(RELEASES_URL);
      },
    };
  }
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body?.trim() || undefined,
    install: async (onProgress) => {
      let total: number | undefined;
      let done = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength;
        else if (e.event === "Progress") {
          done += e.data.chunkLength;
          onProgress(done, total);
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}
