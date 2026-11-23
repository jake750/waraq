import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useT } from "../i18n";
import { ICON } from "./icons";

type Props = {
  title: string;
  /** One line under the title. */
  sub?: string;
  /** Shows a back arrow before the title. */
  onBack?: () => void;
  /** Buttons at the far end of the header. */
  actions?: ReactNode;
};

/** The top of a screen (Convert, Tools, a tool): one title style everywhere. */
export default function ScreenHeader({ title, sub, onBack, actions }: Props) {
  const t = useT();
  return (
    <header className="screen-head">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label={t.back} title={t.back}>
          <ArrowLeft size={ICON.md} className="flip-rtl" />
        </button>
      )}
      <div className="screen-head-text">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions}
    </header>
  );
}
