import { FileUp } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../i18n";

type Props = {
  onOpen(): void;
  dragOver: boolean;
  recent: ReactNode;
};

export default function Home({ onOpen, dragOver, recent }: Props) {
  const t = useT();
  return (
    <div className="home">
      <div className="home-inner">
        <section className={`dropzone${dragOver ? " over" : ""}`}>
          <div className="dropzone-icon">
            <FileUp size={26} />
          </div>
          <h1>{dragOver ? t.dropHere : t.homeTitle}</h1>
          <p>{t.homeSub}</p>
          <button className="btn btn-primary" onClick={onOpen}>
            {t.openPdf}
          </button>
        </section>
        <section>
          <h2 className="section-title">{t.recentTitle}</h2>
          {recent}
        </section>
      </div>
    </div>
  );
}
