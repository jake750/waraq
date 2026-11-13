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
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("android_immersive", { on });
    } else {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setFullscreen(on);
    }
  } catch {
    /* the in-app layout is enough */
  }
}
