// The conversion queue as a pure state machine. The screen runs one job at a time:
// it asks `nextJob`, dispatches "start", runs it, then "done"/"fail". Results for a job
// cancelled meanwhile are ignored, and an error never stops the rest of the batch.

import type { DocRef } from "../files/docRef";
import type { ConvertErrorCode } from "./errors";
import { fmtOf, targetsFor, type Fmt, type Platform, type Target } from "./formats";

export type Input = { name: string; ref: DocRef };
export type JobState = "queued" | "running" | "done" | "error" | "cancelled";
/** Where the result went. `count` > 1 when one input made several files (PDF pages → images). */
export type Saved = { path: string; name: string; uri?: string; label?: string; count?: number };

export type Job = {
  id: number;
  /** Usually one file; several when images are combined into one PDF. */
  inputs: Input[];
  name: string;
  fmt: Fmt;
  target: Target;
  state: JobState;
  progress: number; // 0..1
  output?: Saved;
  error?: ConvertErrorCode;
};

export type Queue = { jobs: Job[]; nextId: number; running: boolean };

export type Action =
  | { type: "add"; inputs: Input[]; platform: Platform }
  | { type: "setTarget"; id: number; target: Target }
  | { type: "setAll"; target: Target; platform: Platform }
  | { type: "run" }
  | { type: "start"; id: number }
  | { type: "progress"; id: number; value: number }
  | { type: "done"; id: number; output: Saved }
  | { type: "fail"; id: number; error: ConvertErrorCode }
  | { type: "cancel"; id: number }
  | { type: "retry"; id: number }
  | { type: "remove"; id: number }
  | { type: "clearFinished" }
  | { type: "combineImages" };

export const emptyQueue: Queue = { jobs: [], nextId: 1, running: false };

const IMAGE: Fmt[] = ["png", "jpg", "webp"];
const finished = (j: Job) => j.state === "done" || j.state === "error" || j.state === "cancelled";

export function nextJob(q: Queue): Job | undefined {
  if (!q.running || q.jobs.some((j) => j.state === "running")) return undefined;
  return q.jobs.find((j) => j.state === "queued");
}

/** The batch ends by itself once nothing is waiting or running. */
const settle = (q: Queue): Queue =>
  q.running && !q.jobs.some((j) => j.state === "queued" || j.state === "running") ? { ...q, running: false } : q;

const update = (q: Queue, id: number, f: (j: Job) => Job | null): Queue => ({
  ...q,
  jobs: q.jobs.map((j) => (j.id === id ? (f(j) ?? j) : j)),
});

export function reduce(q: Queue, a: Action): Queue {
  switch (a.type) {
    case "add": {
      let nextId = q.nextId;
      const jobs = [...q.jobs];
      for (const input of a.inputs) {
        const fmt = fmtOf(input.name);
        const targets = fmt ? targetsFor(fmt, a.platform) : [];
        if (!fmt || !targets.length) continue;
        jobs.push({ id: nextId++, inputs: [input], name: input.name, fmt, target: targets[0], state: "queued", progress: 0 });
      }
      return { ...q, jobs, nextId };
    }
    case "setTarget":
      // Only waiting jobs; the target must be one this format supports on some platform.
      return update(q, a.id, (j) =>
        j.state === "queued" && (targetsFor(j.fmt, "desktop").includes(a.target) || targetsFor(j.fmt, "android").includes(a.target))
          ? { ...j, target: a.target }
          : null,
      );
    case "setAll":
      return {
        ...q,
        jobs: q.jobs.map((j) =>
          j.state === "queued" && j.inputs.length === 1 && targetsFor(j.fmt, a.platform).includes(a.target) ? { ...j, target: a.target } : j,
        ),
      };
    case "run":
      return q.jobs.some((j) => j.state === "queued") ? { ...q, running: true } : q;
    case "start":
      return update(q, a.id, (j) => (j.state === "queued" ? { ...j, state: "running", progress: 0 } : null));
    case "progress":
      return update(q, a.id, (j) => (j.state === "running" ? { ...j, progress: Math.max(0, Math.min(1, a.value)) } : null));
    case "done":
      return settle(update(q, a.id, (j) => (j.state === "running" ? { ...j, state: "done", progress: 1, output: a.output } : null)));
    case "fail":
      return settle(update(q, a.id, (j) => (j.state === "running" ? { ...j, state: "error", error: a.error } : null)));
    case "cancel":
      return settle(update(q, a.id, (j) => (j.state === "queued" || j.state === "running" ? { ...j, state: "cancelled" } : null)));
    case "retry": {
      // Retrying means "run it now", so the batch restarts if it had ended.
      const r = update(q, a.id, (j) =>
        j.state === "error" || j.state === "cancelled" ? { ...j, state: "queued", error: undefined, progress: 0, output: undefined } : null,
      );
      return r.jobs.some((j) => j.state === "queued") ? { ...r, running: true } : r;
    }
    case "remove":
      return settle({ ...q, jobs: q.jobs.filter((j) => j.id !== a.id || j.state === "running") });
    case "clearFinished":
      return { ...q, jobs: q.jobs.filter((j) => !finished(j)) };
    case "combineImages": {
      const imgs = q.jobs.filter((j) => j.state === "queued" && IMAGE.includes(j.fmt));
      if (imgs.length < 2) return q;
      const first = imgs[0];
      const merged: Job = { ...first, inputs: imgs.flatMap((j) => j.inputs), target: "pdf" };
      return { ...q, jobs: q.jobs.filter((j) => !imgs.includes(j) || j === first).map((j) => (j === first ? merged : j)) };
    }
  }
}
