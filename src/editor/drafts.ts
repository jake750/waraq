// Unsaved editor work, kept so a crash, a closed window or Android killing the app doesn't lose it.
// One draft per document (keyed by where it lives and its size), the newest few only.

import type { KV } from "../files/recent";
import type { FieldValue } from "./forms";
import type { Mark } from "./marks";

export type Draft = { key: string; marks: Mark[]; values: Record<string, FieldValue>; savedAt: number };

const KEY = "drafts";
const MAX = 5;

const toB64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

type Stored = Omit<Draft, "marks"> & { marks: unknown[] };

/** Image marks carry bytes, which JSON can't hold: store them as base64. */
const pack = (marks: Mark[]): unknown[] => marks.map((m) => (m.kind === "image" ? { ...m, bytes: toB64(m.bytes) } : m));
const unpack = (marks: unknown[]): Mark[] =>
  marks.map((m) => {
    const x = m as Mark & { bytes?: unknown };
    return x.kind === "image" && typeof x.bytes === "string" ? ({ ...x, bytes: fromB64(x.bytes) } as Mark) : (x as Mark);
  });

export class DraftStore {
  constructor(
    private kv: KV,
    private now: () => number = Date.now,
  ) {}

  private async all(): Promise<Stored[]> {
    return (await this.kv.get<Stored[]>(KEY)) ?? [];
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
    await this.kv.set(KEY, [d, ...rest].slice(0, MAX));
  }

  async remove(key: string): Promise<void> {
    await this.kv.set(KEY, (await this.all()).filter((x) => x.key !== key));
  }
}
