import { docKey, type DocRef } from "./docRef";

/**
 * `thumb`: a small JPEG data URL of page 1 (never kept for password-protected files); `thumbOf`:
 * the PDF fingerprint it was drawn from, so it is redrawn only when the file changed.
 */
export type RecentItem = { key: string; name: string; ref: DocRef; openedAt: number; lastPage: number; thumb?: string; thumbOf?: string; locked?: boolean };

export interface KV {
  get<T>(k: string): Promise<T | undefined>;
  set(k: string, v: unknown): Promise<void>;
}

const KEY = "recent";

/** Recently opened documents, most recent first, with the page you were on. */
/** How many files Recent keeps; older ones drop off. */
export const RECENT_MAX = 20;

export class RecentStore {
  constructor(
    private kv: KV,
    private now: () => number = Date.now,
    private max = RECENT_MAX,
  ) {}

  /**
   * Every change is read → modify → write; they run one after another, so two changes made
   * at once (the page-1 picture and the last page, say) can't overwrite each other.
   */
  private queue: Promise<unknown> = Promise.resolve();
  private serial<T>(op: () => Promise<T>): Promise<T> {
    const run = this.queue.then(op, op);
    this.queue = run.catch(() => {});
    return run;
  }

  private async read(): Promise<RecentItem[]> {
    return (await this.kv.get<RecentItem[]>(KEY)) ?? [];
  }

  /** The list as it is once the changes already asked for are written. */
  list(): Promise<RecentItem[]> {
    return this.serial(() => this.read());
  }

  private save(items: RecentItem[]) {
    return this.kv.set(KEY, items);
  }

  touch(ref: DocRef, name: string): Promise<RecentItem> {
    return this.serial(() => this.doTouch(ref, name));
  }
  private async doTouch(ref: DocRef, name: string): Promise<RecentItem> {
    const key = docKey(ref);
    const items = await this.read();
    // Android gives the same file a new content:// URI each time another app shares it: one entry per name.
    const same = (i: RecentItem) => i.key === key || (ref.kind === "uri" && i.ref.kind === "uri" && i.name === name);
    const old = items.find((i) => i.key === key) ?? items.find(same);
    const item: RecentItem = { key, name, ref, openedAt: this.now(), lastPage: old?.lastPage ?? 1, ...(old?.thumb ? { thumb: old.thumb, ...(old.thumbOf ? { thumbOf: old.thumbOf } : {}) } : {}), ...(old?.locked ? { locked: true } : {}) };
    await this.save([item, ...items.filter((i) => !same(i))].slice(0, this.max));
    return item;
  }

  setLastPage(key: string, page: number): Promise<void> {
    return this.serial(() => this.doSetLastPage(key, page));
  }
  private async doSetLastPage(key: string, page: number): Promise<void> {
    const items = await this.read();
    const item = items.find((i) => i.key === key);
    if (!item || item.lastPage === page) return;
    item.lastPage = page;
    await this.save(items);
  }

  setThumb(key: string, thumb: string | undefined, of?: string): Promise<void> {
    return this.serial(() => this.doSetThumb(key, thumb, of));
  }
  private async doSetThumb(key: string, thumb: string | undefined, of?: string): Promise<void> {
    const items = await this.read();
    const item = items.find((i) => i.key === key);
    if (!item || (item.thumb === thumb && item.thumbOf === of)) return;
    if (thumb) item.thumb = thumb;
    else delete item.thumb;
    if (thumb && of) item.thumbOf = of;
    else delete item.thumbOf;
    await this.save(items);
  }

  /** A password-protected file: no picture of its content, and a lock in the list. */
  setLocked(key: string): Promise<void> {
    return this.serial(() => this.doSetLocked(key));
  }
  private async doSetLocked(key: string): Promise<void> {
    const items = await this.read();
    const item = items.find((i) => i.key === key);
    if (!item || (item.locked && !item.thumb)) return;
    item.locked = true;
    delete item.thumb;
    delete item.thumbOf;
    await this.save(items);
  }

  remove(key: string): Promise<void> {
    return this.serial(async () => this.save((await this.read()).filter((i) => i.key !== key)));
  }

  /** Put a removed item back where it was (undo). */
  restore(item: RecentItem): Promise<void> {
    return this.serial(async () => {
      const items = (await this.read()).filter((i) => i.key !== item.key);
      items.push(item);
      items.sort((a, b) => b.openedAt - a.openedAt);
      await this.save(items.slice(0, this.max));
    });
  }
}
