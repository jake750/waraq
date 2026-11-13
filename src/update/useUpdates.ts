import { useCallback, useEffect, useRef, useState } from "react";
import { loadAutoUpdate, loadLastUpdateCheck, saveAutoUpdate, saveLastUpdateCheck } from "../prefs";
import { checkForUpdate, currentVersion, type Found } from "./native";
import { shouldAutoCheck } from "./updates";

export type UpdateState =
  | { status: "idle" | "checking" | "latest" | "error" | "unavailable" }
  | { status: "available"; found: Found }
  | { status: "installing"; found: Found; progress: number | null };

export type Updates = {
  state: UpdateState;
  version: string | null;
  auto: boolean;
  setAuto(on: boolean): void;
  check(): void;
  install(): void;
};

/** Update state for the whole app: a daily automatic check at launch, and the Settings actions. */
export function useUpdates(): Updates {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [version, setVersion] = useState<string | null>(null);
  const [auto, setAutoState] = useState(loadAutoUpdate);
  const busy = useRef(false);

  const run = useCallback(async (quiet: boolean) => {
    if (busy.current) return;
    busy.current = true;
    if (!quiet) setState({ status: "checking" });
    try {
      const found = await checkForUpdate();
      saveLastUpdateCheck(Date.now());
      setState(found ? { status: "available", found } : { status: quiet ? "idle" : "latest" });
    } catch (e) {
      // An automatic check fails silently (offline is normal); a manual one says so.
      if (!quiet) setState({ status: e instanceof Error && e.message === "unavailable" ? "unavailable" : "error" });
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    currentVersion().then(setVersion, () => {});
    if (shouldAutoCheck(loadAutoUpdate(), loadLastUpdateCheck(), Date.now())) {
      // Give the window a moment to open before going to the network.
      const id = setTimeout(() => run(true), 4000);
      return () => clearTimeout(id);
    }
  }, [run]);

  const install = () => {
    if (state.status !== "available") return;
    const found = state.found;
    setState({ status: "installing", found, progress: null });
    found
      .install((done, total) =>
        setState({ status: "installing", found, progress: total ? Math.min(100, Math.round((done / total) * 100)) : null }),
      )
      // Android only opens the release page: back to "available" so the button stays.
      .then(() => setState({ status: "available", found }))
      .catch(() => setState({ status: "error" }));
  };

  return {
    state,
    version,
    auto,
    setAuto: (on) => {
      saveAutoUpdate(on);
      setAutoState(on);
    },
    check: () => run(false),
    install,
  };
}
