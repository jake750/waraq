// Reading a non-PDF: convert it to a PDF in the app cache (never next to the original) and open that.

import { invoke } from "@tauri-apps/api/core";
import type { DocRef } from "../files/docRef";
import { isAndroid } from "../platform";
import { ConvertError } from "./errors";
import { fmtOf, targetsFor } from "./formats";
import { appDeps, writeNew } from "./native";
import type { Job, Saved } from "./queue";
import { runJob } from "./run";

export async function openAsPdf(ref: DocRef, name: string, officeInstalled: boolean): Promise<Saved> {
  const fmt = fmtOf(name);
  if (!fmt || !targetsFor(fmt, isAndroid() ? "android" : "desktop").includes("pdf")) throw new ConvertError("unsupported");
  const dir = await invoke<string>("temp_dir");
  const job: Job = { id: 0, inputs: [{ name, ref }], name, fmt, target: "pdf", state: "running", progress: 0 };
  const deps = {
    ...appDeps(() => officeInstalled),
    save: async (bytes: Uint8Array, n: string) => ({ path: await writeNew(bytes, dir, n), name: n }),
  };
  const out = await runJob(job, deps, { dir }, new AbortController().signal, () => {});
  return { ...out, name: name.replace(/\.[^./\\]+$/, ".pdf") };
}
