import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window"; // already in the main bundle (App uses the webview API)
import { isAndroid } from "../platform";

/**
 * Full-screen reading. The app chrome is hidden by CSS (`:root[data-fullscreen]`); this also takes
 * the window full screen on desktop and hides the system bars on Android. Failures are ignored:
 * the in-app full-screen layout still works without them (e.g. the browser preview).
 */
export async function setFullscreen(on: boolean): Promise<void> {
  document.documentElement.toggleAttribute("data-fullscreen", on);
  try {
    if (!("__TAURI_INTERNALS__" in window)) {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else if (!on && document.fullscreenElement) await document.exitFullscreen?.();
      return;
    }
    if (isAndroid()) {
      await invoke("android_immersive", { on });
    } else {
      await getCurrentWindow().setFullscreen(on);
    }
  } catch {
    /* the in-app layout is enough */
  }
}
