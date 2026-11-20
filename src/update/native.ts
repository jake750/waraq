// Platform side of updates. Desktop: the Tauri updater plugin downloads the signed installer,
// verifies it against the public key in tauri.conf.json, installs it and restarts. Android: the
// plugin doesn't run there, so Rust reads the release's latest.json (`latest_release`), downloads
// the APK into the app cache and the system installer takes it from there.
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { isAndroid } from "../platform";
import { isNewer } from "./updates";

export const RELEASES_URL = "https://github.com/jake750/waraq/releases/latest";

/** The APK the release workflow attaches to every release. */
export const apkUrl = (version: string) => `https://github.com/jake750/waraq/releases/download/v${version}/Waraq_${version}_android.apk`;

export type Found = {
  version: string;
  notes?: string;
  /** Desktop: download + install + restart. Android: download + open the system installer; throws
   * Error("permission") until the user allows Waraq to install apps (the setting opens by itself). */
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
    // Kept between taps, so allowing installs and tapping again doesn't download twice.
    let apk: string | null = null;
    return {
      version: latest.version,
      notes: latest.notes ?? undefined,
      install: async (onProgress) => {
        if (!apk) {
          try {
            const { Channel } = await import("@tauri-apps/api/core");
            const progress = new Channel<[number, number | null]>();
            progress.onmessage = ([done, total]) => onProgress(done, total ?? undefined);
            apk = await invoke<string>("android_download_update", { version: latest.version, progress });
          } catch {
            // The download failed in the app: the browser can still fetch the APK.
            const { openUrl } = await import("@tauri-apps/plugin-opener");
            await openUrl(apkUrl(latest.version)).catch(() => openUrl(RELEASES_URL));
            return;
          }
        }
        try {
          await invoke("android_install_apk", { path: apk });
        } catch (e) {
          throw new Error(String(e).includes("permission") ? "permission" : "install");
        }
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
