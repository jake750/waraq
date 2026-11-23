import { FilePen, FileStack, FileUp, Minimize2, FileOutput } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { isAndroid } from "../platform";
import { ICON } from "./icons";

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
    ["convert", t.quickConvert, <FileOutput size={ICON.md} />],
    ["edit", t.quickEdit, <FilePen size={ICON.md} />],
    ["merge", t.quickMerge, <FileStack size={ICON.md} />],
    ["compress", t.quickCompress, <Minimize2 size={ICON.md} />],
  ];
  return (
    <div className="home page-scroll">
      <div className="page-inner">
        {/* Phones have no sidebar, so the app's name and mark sit at the top of Home. */}
        <header className="home-brand">
          <img src="/logo.svg" alt="" />
          <span>{t.appName}</span>
        </header>
        <section className={`dropzone fold${dragOver ? " over" : ""}`}>
          <div className="dropzone-icon">
            <FileUp size={ICON.xl} />
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
              <span className="quick-icon" data-kind={a}>{icon}</span>
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
