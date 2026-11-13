import { FilePen, FileStack, FileUp, Minimize2, Repeat2 } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { isAndroid } from "../platform";

export type QuickAction = "convert" | "edit" | "merge" | "compress";

type Props = {
  onOpen(): void;
  onQuick(a: QuickAction): void;
  dragOver: boolean;
  recent: ReactNode;
};

export default function Home({ onOpen, onQuick, dragOver, recent }: Props) {
  const t = useT();
  const quick: [QuickAction, string, ReactNode][] = [
    ["convert", t.quickConvert, <Repeat2 size={20} />],
    ["edit", t.quickEdit, <FilePen size={20} />],
    ["merge", t.quickMerge, <FileStack size={20} />],
    ["compress", t.quickCompress, <Minimize2 size={20} />],
  ];
  return (
    <div className="home page-scroll">
      <div className="page-inner">
        <section className={`dropzone fold${dragOver ? " over" : ""}`}>
          <div className="dropzone-icon">
            <FileUp size={26} />
          </div>
          <h1>{dragOver ? t.dropHere : t.homeTitle}</h1>
          {/* Android has no drag and drop: don't invite it. */}
          <p>{isAndroid() ? t.homeSubPhone : t.homeSub}</p>
          <button className="btn btn-primary btn-lg" onClick={onOpen}>
            {t.openPdf}
          </button>
        </section>
        <nav className="quick" aria-label={t.quickTitle}>
          {quick.map(([a, label, icon]) => (
            <button key={a} className="quick-item" onClick={() => onQuick(a)}>
              <span className="quick-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <section>
          <h2 className="section-title">{t.recentTitle}</h2>
          {recent}
        </section>
      </div>
    </div>
  );
}
