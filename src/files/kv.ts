import type { KV } from "./recent";

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * App settings file (plugin-store) in the app; localStorage in the browser preview.
 * `file`: a store of its own for bulky data (editor drafts), so the settings file that loads at
 * startup stays small.
 */
export function appKV(file: "waraq" | "drafts" = "waraq"): KV {
  const prefix = file === "waraq" ? "waraq.kv." : `waraq.${file}.`;
  if (!inTauri()) {
    return {
      get: async <T>(k: string) => {
        try {
          const v = localStorage.getItem(`${prefix}${k}`);
          return v ? (JSON.parse(v) as T) : undefined;
        } catch {
          return undefined;
        }
      },
      set: async (k, v) => {
        try {
          localStorage.setItem(`${prefix}${k}`, JSON.stringify(v));
        } catch {
          /* not remembered */
        }
      },
    };
  }
  const store = import("@tauri-apps/plugin-store").then((m) => m.load(`${file}.json`, { autoSave: 300, defaults: {} }));
  return {
    get: async <T>(k: string) => (await store).get<T>(k),
    set: async (k, v) => (await store).set(k, v),
  };
}
