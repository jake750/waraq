import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { Strings } from "../i18n";
import { ICON } from "./icons";

type Props = { t: Strings; resetKey: unknown; onHome(): void; children: ReactNode };
type State = { failed: boolean; key: unknown };

/**
 * Catches a crash inside one screen, so the rest of the app (sidebar, settings, the queue) keeps working.
 * Changing `resetKey` (the route) clears the error.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  componentDidCatch(error: unknown) {
    console.error("[waraq] screen crashed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { t, onHome } = this.props;
    return (
      <div className="crash" role="alert">
        <AlertTriangle size={ICON.xl} aria-hidden />
        <h2>{t.crashTitle}</h2>
        <p>{t.crashBody}</p>
        <div className="crash-actions">
          <button className="btn btn-ghost" onClick={() => location.reload()}>
            {t.crashReload}
          </button>
          <button className="btn btn-primary" autoFocus onClick={onHome}>
            {t.crashHome}
          </button>
        </div>
      </div>
    );
  }
}
