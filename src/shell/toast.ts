import type { Strings } from "../i18n";

export type ToastKind = "info" | "success" | "error";

/**
 * What a toast means, for its icon and edge colour. Callers pass a kind when they know it; otherwise
 * a message that is one of the app's error strings is an error, and anything else is information.
 */
export function toastKind(msg: string, t: Strings, said?: ToastKind): ToastKind {
  if (said) return said;
  const errors = [...Object.values(t.convertErrors), ...Object.values(t.errors), t.recentFailed, t.actionFailed];
  return errors.includes(msg) ? "error" : "info";
}
