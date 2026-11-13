// Owns the conversion queue for the whole app (it survives switching screens), runs one job at a
// time, and asks about LibreOffice once per session before the first job that would use it.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { resolveName, type DocRef } from "../files/docRef";
import { isAndroid } from "../platform";
import { asConvertError } from "./errors";
import { engineFor, fmtOf, targetsFor, type Target } from "./formats";
import { appDeps, officeInstall, officeStatus, type OfficeStatus } from "./native";
import { emptyQueue, nextJob, reduce, type Input, type Job } from "./queue";
import { runJob } from "./run";

export type SaveMode = { kind: "beside" } | { kind: "folder"; dir: string };
export type OfficePrompt =
  | { stage: "ask" }
  | { stage: "downloading"; bytes: number; total: number }
  | { stage: "installing" }
  | { stage: "failed" };

const platform = () => (isAndroid() ? "android" : "desktop");

function folderOf(ref: DocRef): string {
  if (ref.kind !== "path") return "";
  const i = Math.max(ref.path.lastIndexOf("/"), ref.path.lastIndexOf("\\"));
  return i > 0 ? ref.path.slice(0, i) : "";
}

export function useConvert() {
  const [queue, dispatch] = useReducer(reduce, emptyQueue);
  const [saveMode, setSaveMode] = useState<SaveMode>({ kind: "beside" });
  const [office, setOffice] = useState<OfficeStatus | null>(null);
  const [declined, setDeclined] = useState(false);
  const [prompt, setPrompt] = useState<OfficePrompt | null>(null);
  const controllers = useRef(new Map<number, AbortController>());
  const started = useRef(new Set<number>());
  const officeReady = useRef(false);
  officeReady.current = !!office?.installed && !declined;
  const saveRef = useRef(saveMode);
  saveRef.current = saveMode;

  useEffect(() => {
    officeStatus().then(setOffice, () => setOffice({ installed: false, version: "", downloadBytes: 0 }));
  }, []);

  // The runner: whenever the queue changes and nothing is running, start the next job.
  useEffect(() => {
    const job = nextJob(queue);
    // StrictMode runs effects twice in development: never start the same job twice.
    if (!job || started.current.has(job.id)) return;
    started.current.add(job.id);
    dispatch({ type: "start", id: job.id });
    const ac = new AbortController();
    controllers.current.set(job.id, ac);
    const mode = saveRef.current;
    const dir = mode.kind === "folder" ? mode.dir : folderOf(job.inputs[0].ref);
    runJob(job, appDeps(() => officeReady.current), { dir }, ac.signal, (value) => dispatch({ type: "progress", id: job.id, value }))
      .then(
        (output) => dispatch({ type: "done", id: job.id, output }),
        (e) => dispatch({ type: "fail", id: job.id, error: asConvertError(e).code }),
      )
      .finally(() => {
        controllers.current.delete(job.id);
        started.current.delete(job.id); // a retry may start it again
      });
  }, [queue]);

  /** Adds files; returns how many were skipped as not convertible. */
  const add = useCallback(async (refs: DocRef[]): Promise<number> => {
    const inputs: Input[] = await Promise.all(refs.map(async (ref) => ({ ref, name: await resolveName(ref) })));
    dispatch({ type: "add", inputs, platform: platform() });
    return inputs.filter((i) => {
      const f = fmtOf(i.name);
      return !f || targetsFor(f, platform()).length === 0;
    }).length;
  }, []);

  const needsOffice = (jobs: Job[]) =>
    platform() === "desktop" && jobs.some((j) => j.state === "queued" && engineFor(j.fmt, j.target, "desktop", true) === "libreoffice");

  const start = useCallback(() => {
    if (office && !office.installed && !declined && needsOffice(queue.jobs)) {
      setPrompt({ stage: "ask" });
      return;
    }
    dispatch({ type: "run" });
  }, [office, declined, queue.jobs]);

  const downloadOffice = useCallback(async () => {
    const total = office?.downloadBytes ?? 0;
    setPrompt({ stage: "downloading", bytes: 0, total });
    try {
      await officeInstall((bytes) => setPrompt(bytes >= total && total > 0 ? { stage: "installing" } : { stage: "downloading", bytes, total }));
      setOffice(await officeStatus());
      officeReady.current = true;
      setPrompt(null);
      dispatch({ type: "run" });
    } catch {
      setPrompt({ stage: "failed" });
    }
  }, [office]);

  const chooseBuiltIn = useCallback(() => {
    setDeclined(true);
    officeReady.current = false;
    setPrompt(null);
    dispatch({ type: "run" });
  }, []);

  const cancel = useCallback((id: number) => {
    dispatch({ type: "cancel", id });
    controllers.current.get(id)?.abort();
  }, []);

  const stopAll = useCallback(() => {
    for (const j of queue.jobs) if (j.state === "queued" || j.state === "running") cancel(j.id);
  }, [queue.jobs, cancel]);

  return {
    queue,
    dispatch,
    add,
    start,
    cancel,
    stopAll,
    saveMode,
    setSaveMode,
    office,
    prompt,
    closePrompt: () => setPrompt(null),
    downloadOffice,
    chooseBuiltIn,
    setAll: (target: Target) => dispatch({ type: "setAll", target, platform: platform() }),
  };
}

export type ConvertApi = ReturnType<typeof useConvert>;
