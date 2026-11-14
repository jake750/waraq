import { useEffect, useRef } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import type { PluginListener } from "@tauri-apps/api/core";
import { isAndroid } from "../platform";

/**
 * The Android back button walks this stack: dialogs first, then a screen's own step back
 * (a tool, full screen, the editor), then the route back to Home. With nothing on it, the
 * system handles back as usual (the app goes to the background).
 */
export const BACK_ROUTE = 0;
export const BACK_SCREEN = 1;
export const BACK_DIALOG = 2;

type Entry = { level: number; seq: number; run: () => void };

export class BackStack {
  private entries: Entry[] = [];
  private seq = 0;
  constructor(private onActive: (active: boolean) => void = () => {}) {}

  /** Adds a step; the returned function removes it. */
  push(level: number, run: () => void): () => void {
    const e: Entry = { level, seq: ++this.seq, run };
    const was = this.active;
    this.entries.push(e);
    if (!was) this.onActive(true);
    return () => {
      const i = this.entries.indexOf(e);
      if (i < 0) return;
      this.entries.splice(i, 1);
      if (!this.active) this.onActive(false);
    };
  }

  get active(): boolean {
    return this.entries.length > 0;
  }

  /** Runs the top step (highest level, newest first). False when there is none. */
  handle(): boolean {
    let top: Entry | undefined;
    for (const e of this.entries) if (!top || e.level > top.level || (e.level === top.level && e.seq > top.seq)) top = e;
    top?.run();
    return !!top;
  }
}

// The listener is only registered while the stack has something on it, so at Home the
// system's own back behaviour applies. Registering is async, so changes run in order.
let listener: Promise<PluginListener | null> = Promise.resolve(null);
const stack = new BackStack((active) => {
  if (!isAndroid() || !("__TAURI_INTERNALS__" in window)) return;
  listener = listener.then(async (l) => {
    if (active) return l ?? (await onBackButtonPress(() => stack.handle()).catch(() => null));
    await l?.unregister().catch(() => {});
    return null;
  });
});

/** While `enabled`, the back button runs `run` (the latest one passed). */
export function useBack(enabled: boolean, run: () => void, level: number = BACK_SCREEN) {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!enabled) return;
    return stack.push(level, () => latest.current());
  }, [enabled, level]);
}
