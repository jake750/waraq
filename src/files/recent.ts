import { docKey, type DocRef } from "./docRef";

/** `thumb`: a small JPEG data URL of page 1 (never kept for password-protected files). */
export type RecentItem = { key: string; name: string; ref: DocRef; openedAt: number; lastPage: number; thumb?: string };

export interface KV {
  get<T>(k: string): Promise<T | undefined>;
  set(k: string, v: unknown): Promise<void>;
}

const KEY = "recent";

/** Recently opened documents, most recent first, with the page you were on. */
export class RecentStore {
  constructor(
    private kv: KV,
    private now: () => number = Date.now,
    private max = 20,
  ) {}

  async list(): Promise<RecentItem[]> {
    return (await this.kv.get<RecentItem[]>(KEY)) ?? [];
  }

  private save(items: RecentItem[]) {
    return this.kv.set(KEY, items);
  }

  async touch(ref: DocRef, name: string): Promise<RecentItem> {
    const key = docKey(ref);
    const items = await this.list();
    // Android gives the same file a new content:// URI each time another app shares it: one entry per name.
    const same = (i: RecentItem) => i.key === key || (ref.kind === "uri" && i.ref.kind === "uri" && i.name === name);
    const old = items.find((i) => i.key === key) ?? items.find(same);
    const item: RecentItem = { key, name, ref, openedAt: this.now(), lastPage: old?.lastPage ?? 1, ...(old?.thumb ? { thumb: old.thumb } : {}) };
    await this.save([item, ...items.filter((i) => !same(i))].slice(0, this.max));
    return item;
  }

  async setLastPage(key: string, page: number): Promise<void> {
    const items = await this.list();
    const item = items.find((i) => i.key === key);
    if (!item || item.lastPage === page) return;
    item.lastPage = page;
    await this.save(items);
  }

  async setThumb(key: string, thumb: string | undefined): Promise<void> {
    const items = await this.list();
    const item = items.find((i) => i.key === key);
    if (!item || item.thumb === thumb) return;
    if (thumb) item.thumb = thumb;
    else delete item.thumb;
    await this.save(items);
  }

  async remove(key: string): Promise<void> {
    await this.save((await this.list()).filter((i) => i.key !== key));
  }

  /** Put a removed item back where it was (undo). */
  async restore(item: RecentItem): Promise<void> {
    const items = (await this.list()).filter((i) => i.key !== item.key);
    items.push(item);
    items.sort((a, b) => b.openedAt - a.openedAt);
    await this.save(items.slice(0, this.max));
  }
}
