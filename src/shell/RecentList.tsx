import { FileText, X } from "lucide-react";
import { useT } from "../i18n";
import type { RecentItem } from "../files/recent";
import { ago } from "./time";

type Props = { items: RecentItem[]; onOpen(item: RecentItem): void; onRemove(item: RecentItem): void };

function folderOf(item: RecentItem): string {
  if (item.ref.kind !== "path" || item.ref.path.startsWith("dev:")) return "";
  const parts = item.ref.path.split(/[\\/]/);
  parts.pop();
  return parts.slice(-2).join("/");
}

export default function RecentList({ items, onOpen, onRemove }: Props) {
  const t = useT();
  if (items.length === 0)
    return (
      <ul className="recent-list">
        <li className="recent-empty">{t.recentEmpty}</li>
      </ul>
    );
  const now = Date.now();
  const when = (time: number) => {
    const a = ago(time, now);
    return a.unit === "now"
      ? t.justNow
      : a.unit === "min"
        ? t.minutesAgo(a.n)
        : a.unit === "h"
          ? t.hoursAgo(a.n)
          : t.daysAgo(a.n);
  };
  return (
    <ul className="recent-list">
      {items.map((item, i) => {
        const folder = folderOf(item);
        return (
          <li key={item.key} className="recent-item" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
            <button className="recent-open" onClick={() => onOpen(item)} title={item.key}>
              <span className="recent-icon">
                <FileText size={18} />
              </span>
              <span className="recent-text">
                <span className="recent-name" dir="auto">
                  {item.name}
                </span>
                <span className="recent-meta">
                  {[folder, t.recentPage(item.lastPage), when(item.openedAt)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
            <button
              className="icon-btn"
              onClick={() => onRemove(item)}
              aria-label={t.removeFromRecent}
              title={t.removeFromRecent}
            >
              <X size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
