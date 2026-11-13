import { docKey, type DocRef } from "./docRef";

export type RecentItem = { key: string; name: string; ref: DocRef; openedAt: number; lastPage: number };

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
    const old = items.find((i) => i.key === key);
    const item: RecentItem = { key, name, ref, openedAt: this.now(), lastPage: old?.lastPage ?? 1 };
    await this.save([item, ...items.filter((i) => i.key !== key)].slice(0, this.max));
    return item;
  }

  async setLastPage(key: string, page: number): Promise<void> {
    const items = await this.list();
    const item = items.find((i) => i.key === key);
    if (!item || item.lastPage === page) return;
    item.lastPage = page;
    await this.save(items);
  }

  async remove(key: string): Promise<void> {
    await this.save((await this.list()).filter((i) => i.key !== key));
  }
}
