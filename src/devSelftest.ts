// Development-only end-to-end check of every conversion route on the real native engines
// (WebView2 / Android WebView printing, LibreOffice, file saving). Started when the debug app
// runs with WARAQ_SELFTEST=<folder holding the fixtures>; writes <folder>/out/report.json.

import { invoke } from "@tauri-apps/api/core";
import { appDeps, officeStatus, writeNew } from "./convert/native";
import { fmtOf, type Target } from "./convert/formats";
import { runJob } from "./convert/run";
import type { Job } from "./convert/queue";

type Case = { files: string[]; target: Target; office: boolean };

const CASES: Case[] = [
  { files: ["sample.docx"], target: "pdf", office: false },
  { files: ["sample.docx"], target: "pdf", office: true },
  { files: ["sample.docx"], target: "txt", office: false },
  { files: ["sample.odt"], target: "pdf", office: false },
  { files: ["sample.odt"], target: "docx", office: true },
  { files: ["sample.rtf"], target: "pdf", office: false },
  { files: ["sample.rtf"], target: "docx", office: true },
  { files: ["sample.md"], target: "pdf", office: false },
  { files: ["sample.md"], target: "docx", office: false },
  { files: ["sample.html"], target: "pdf", office: false },
  { files: ["sample.html"], target: "md", office: false },
  { files: ["sample.txt"], target: "pdf", office: false },
  { files: ["sample-1256.txt"], target: "docx", office: false },
  { files: ["sample.epub"], target: "pdf", office: false },
  { files: ["sample-lo.pdf"], target: "docx", office: false },
  { files: ["sample-lo.pdf"], target: "txt", office: false },
  { files: ["sample-lo.pdf"], target: "png", office: false },
  { files: ["sample.png", "sample.jpg", "sample.webp"], target: "pdf", office: false },
];

export async function maybeRunSelftest(): Promise<void> {
  const dir = await invoke<string | null>("selftest_dir").catch(() => null);
  if (!dir) return;
  const sep = dir.includes("\\") ? "\\" : "/";
  const out = `${dir}${sep}out`;
  const office = await officeStatus();
  const report: unknown[] = [];
  for (const c of CASES) {
    const started = performance.now();
    const fmt = fmtOf(c.files[0])!;
    const job: Job = {
      id: 0,
      inputs: c.files.map((f) => ({ name: f, ref: { kind: "path", path: `${dir}${sep}${f}` } })),
      name: c.files[0],
      fmt,
      target: c.target,
      state: "running",
      progress: 0,
    };
    try {
      const saved = await runJob(job, appDeps(() => c.office && office.installed), { dir: out }, new AbortController().signal, () => {});
      report.push({ case: `${c.files.join("+")} -> ${c.target}${c.office ? " (LibreOffice)" : ""}`, ok: true, saved, ms: Math.round(performance.now() - started) });
    } catch (e) {
      report.push({ case: `${c.files.join("+")} -> ${c.target}${c.office ? " (LibreOffice)" : ""}`, ok: false, error: String(e) });
    }
  }
  await writeNew(new TextEncoder().encode(JSON.stringify({ office, report }, null, 2)), out, "report.json");
}
