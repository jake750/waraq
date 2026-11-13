// @vitest-environment happy-dom
import { runJob, type RunDeps } from "../../src/convert/run";
import type { Job } from "../../src/convert/queue";
import type { Fmt, Target } from "../../src/convert/formats";
import { openPdf } from "../../src/pdf/openPdf";
import { fx } from "../helpers";

type Saved = { name: string; mime: string; bytes: Uint8Array; dir: string };

function deps(over: Partial<RunDeps> = {}) {
  const saved: Saved[] = [];
  const calls: string[] = [];
  const d: RunDeps = {
    platform: "desktop",
    read: async (ref) => fx(ref.kind === "path" ? ref.path : ref.uri),
    officeReady: () => false,
    office: async (_input, target, name) => {
      calls.push(`office:${target}`);
      return { path: `out/${name}`, name };
    },
    printPdf: async (html) => {
      calls.push("print");
      return new TextEncoder().encode(html);
    },
    save: async (bytes, name, dir, mime) => {
      saved.push({ name, mime, bytes, dir });
      return { path: `${dir}/${name}`, name };
    },
    openPdf: (b) => openPdf(b),
    renderPage: async (_doc, i, fmt) => new TextEncoder().encode(`${fmt}${i}`),
    toPng: async (b) => b,
    ...over,
  };
  return { d, saved, calls };
}

const job = (file: string, fmt: Fmt, target: Target, files = [file]): Job => ({
  id: 1,
  inputs: files.map((f) => ({ name: f.split("/").pop()!, ref: { kind: "path", path: f } })),
  name: file.split("/").pop()!,
  fmt,
  target,
  state: "running",
  progress: 0,
});

const run = (j: Job, d: RunDeps, signal = new AbortController().signal) => runJob(j, d, { dir: "D:/out" }, signal, () => {});

test("markdown to text is saved next to the chosen folder with a converted name", async () => {
  const { d, saved } = deps();
  const out = await run(job("office/sample.md", "md", "txt"), d);
  expect(out.name).toBe("sample (converted).txt");
  expect(saved[0]).toMatchObject({ name: "sample (converted).txt", mime: "text/plain", dir: "D:/out" });
  expect(new TextDecoder().decode(saved[0].bytes)).toContain("تقرير الربع الأول");
});

test("docx to pdf uses LibreOffice when it is ready", async () => {
  const { d, calls } = deps({ officeReady: () => true });
  const out = await run(job("office/sample.docx", "docx", "pdf"), d);
  expect(calls).toEqual(["office:pdf"]);
  expect(out.name).toBe("sample (converted).pdf");
});

test("docx to pdf falls back to the built-in engine", async () => {
  const { d, calls, saved } = deps();
  await run(job("office/sample.docx", "docx", "pdf"), d);
  expect(calls).toEqual(["print"]);
  expect(saved[0].mime).toBe("application/pdf");
  expect(new TextDecoder().decode(saved[0].bytes)).toContain("تقرير الربع الأول");
});

test("a .doc file without LibreOffice reports office-missing", async () => {
  const { d } = deps();
  await expect(run(job("office/sample.docx", "doc", "pdf"), d)).rejects.toMatchObject({ code: "office-missing" });
});

test("pdf pages become one image each", async () => {
  const { d, saved } = deps();
  const out = await run(job("english-two-column.pdf", "pdf", "png"), d);
  const doc = await openPdf(fx("english-two-column.pdf"));
  expect(saved.map((s) => s.name)).toEqual(Array.from({ length: doc.numPages }, (_, i) => `english-two-column (page ${i + 1}).png`));
  expect(out.count).toBe(doc.numPages);
});

test("pdf to docx", async () => {
  const { d, saved } = deps();
  await run(job("office/sample-lo.pdf", "pdf", "docx"), d);
  expect(saved[0].name).toBe("sample-lo (converted).docx");
  expect([...saved[0].bytes.slice(0, 2)]).toEqual([0x50, 0x4b]); // zip
});

test("images become one pdf", async () => {
  const { d, saved } = deps();
  await run(job("office/sample.png", "png", "pdf", ["office/sample.png", "office/sample.jpg"]), d);
  const pdf = await openPdf(saved[0].bytes);
  expect(pdf.numPages).toBe(2);
});

test("a corrupt file is bad-input", async () => {
  const { d } = deps();
  await expect(run(job("not-a-pdf.pdf", "pdf", "txt"), d)).rejects.toMatchObject({ code: "bad-input" });
  await expect(run(job("not-a-pdf.pdf", "docx", "txt"), d)).rejects.toMatchObject({ code: "bad-input" });
});

test("a cancelled job stops with cancelled and saves nothing", async () => {
  const { d, saved } = deps();
  const ac = new AbortController();
  ac.abort();
  await expect(run(job("office/sample.md", "md", "txt"), d, ac.signal)).rejects.toMatchObject({ code: "cancelled" });
  expect(saved).toEqual([]);
});
