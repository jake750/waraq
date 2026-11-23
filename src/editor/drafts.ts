// Unsaved editor work, kept so a crash, a closed window or Android killing the app doesn't lose it.
// One draft per document (keyed by where it lives and its size), the newest few only, in a store of
// their own (drafts.json): they are rewritten on every pause in editing and can hold images.

import type { KV } from "../files/recent";
import type { FieldValue } from "./forms";
import type { Mark } from "./marks";

export type Draft = { key: string; marks: Mark[]; values: Record<string, FieldValue>; savedAt: number };

const KEY = "drafts";
const MAX = 5;
/** All drafts together stay under this many characters of JSON; the current one is always kept. */
const BUDGET = 24 * 1024 * 1024;

const toB64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

type Stored = Omit<Draft, "marks"> & { marks: unknown[] };

// An image mark keeps the same bytes while it is moved or resized: encode each image once.
const encoded = new WeakMap<Uint8Array, string>();
const b64Of = (b: Uint8Array) => {
  let s = encoded.get(b);
  if (s === undefined) encoded.set(b, (s = toB64(b)));
  return s;
};

/** Image marks carry bytes, which JSON can't hold: store them as base64. */
const pack = (marks: Mark[]): unknown[] => marks.map((m) => (m.kind === "image" ? { ...m, bytes: b64Of(m.bytes) } : m));
const sizeOf = (d: Stored) => JSON.stringify(d).length;

/** The newest drafts that fit the budget (the first always does). */
function fit(list: Stored[]): Stored[] {
  let total = 0;
  return list.slice(0, MAX).filter((d, i) => {
    total += sizeOf(d);
    return i === 0 || total <= BUDGET;
  });
}
const unpack = (marks: unknown[]): Mark[] =>
  marks.map((m) => {
    const x = m as Mark & { bytes?: unknown };
    return x.kind === "image" && typeof x.bytes === "string" ? ({ ...x, bytes: fromB64(x.bytes) } as Mark) : (x as Mark);
  });

export class DraftStore {
  private moved?: Promise<void>;

  /** `legacy`: the settings store drafts used to live in; they are moved out on first use. */
  constructor(
    private kv: KV,
    private now: () => number = Date.now,
    private legacy?: KV,
  ) {}

  private async all(): Promise<Stored[]> {
    await (this.moved ??= this.moveLegacy());
    return (await this.kv.get<Stored[]>(KEY)) ?? [];
  }

  private async moveLegacy(): Promise<void> {
    const old = await this.legacy?.get<Stored[]>(KEY).catch(() => undefined);
    if (!old?.length) return;
    const now = (await this.kv.get<Stored[]>(KEY)) ?? [];
    await this.kv.set(KEY, fit([...now, ...old.filter((o) => !now.some((n) => n.key === o.key))]));
    await this.legacy!.set(KEY, []);
  }

  async get(key: string): Promise<Draft | null> {
    const d = (await this.all()).find((x) => x.key === key);
    return d ? { ...d, marks: unpack(d.marks) } : null;
  }

  /** Saves the draft; an empty one (no marks, no form values) is removed instead. */
  async put(key: string, marks: Mark[], values: Record<string, FieldValue>): Promise<void> {
    const rest = (await this.all()).filter((x) => x.key !== key);
    if (marks.length === 0 && Object.keys(values).length === 0) return this.kv.set(KEY, rest);
    const d: Stored = { key, marks: pack(marks), values, savedAt: this.now() };
    await this.kv.set(KEY, fit([d, ...rest]));
  }

  async remove(key: string): Promise<void> {
    await this.kv.set(KEY, (await this.all()).filter((x) => x.key !== key));
  }
}
