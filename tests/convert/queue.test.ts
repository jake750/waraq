import { emptyQueue, nextJob, reduce, type Action, type Queue } from "../../src/convert/queue";

const ref = (name: string) => ({ name, ref: { kind: "path" as const, path: `C:/d/${name}` } });
const run = (q: Queue, ...actions: Action[]) => actions.reduce(reduce, q);
const add = (...names: string[]): Action => ({ type: "add", inputs: names.map(ref), platform: "desktop" });

test("adds convertible files with a default target, skips the rest", () => {
  const q = run(emptyQueue, add("a.docx", "b.exe", "c.pdf", "d.png"));
  expect(q.jobs.map((j) => [j.name, j.fmt, j.target, j.state])).toEqual([
    ["a.docx", "docx", "pdf", "queued"],
    ["c.pdf", "pdf", "docx", "queued"],
    ["d.png", "png", "pdf", "queued"],
  ]);
});

test("nothing runs until started, then in order", () => {
  let q = run(emptyQueue, add("a.docx", "b.md"));
  expect(nextJob(q)).toBeUndefined();
  q = run(q, { type: "run" });
  expect(nextJob(q)?.name).toBe("a.docx");
  q = run(q, { type: "start", id: q.jobs[0].id }, { type: "done", id: q.jobs[0].id, output: { path: "x", name: "x" } });
  expect(nextJob(q)?.name).toBe("b.md");
});

test("one job at a time", () => {
  let q = run(emptyQueue, add("a.docx", "b.md"), { type: "run" });
  q = run(q, { type: "start", id: q.jobs[0].id });
  expect(nextJob(q)).toBeUndefined();
});

test("cancel a queued job: it is skipped", () => {
  let q = run(emptyQueue, add("a.docx", "b.md", "c.txt"), { type: "run" });
  q = run(q, { type: "cancel", id: q.jobs[1].id }, { type: "start", id: q.jobs[0].id }, { type: "done", id: q.jobs[0].id, output: { path: "x", name: "x" } });
  expect(q.jobs[1].state).toBe("cancelled");
  expect(nextJob(q)?.name).toBe("c.txt");
});

test("cancel the running job: a late result is ignored and the batch goes on", () => {
  let q = run(emptyQueue, add("a.docx", "b.md"), { type: "run" });
  const id = q.jobs[0].id;
  q = run(q, { type: "start", id }, { type: "cancel", id }, { type: "done", id, output: { path: "x", name: "x" } });
  expect(q.jobs[0].state).toBe("cancelled");
  expect(q.jobs[0].output).toBeUndefined();
  expect(nextJob(q)?.name).toBe("b.md");
});

test("an error doesn't stop the batch", () => {
  let q = run(emptyQueue, add("a.docx", "b.md"), { type: "run" });
  q = run(q, { type: "start", id: q.jobs[0].id }, { type: "fail", id: q.jobs[0].id, error: "bad-input" });
  expect(q.jobs[0]).toMatchObject({ state: "error", error: "bad-input" });
  expect(nextJob(q)?.name).toBe("b.md");
});

test("the batch stops by itself when nothing is left", () => {
  let q = run(emptyQueue, add("a.docx"), { type: "run" });
  q = run(q, { type: "start", id: q.jobs[0].id }, { type: "done", id: q.jobs[0].id, output: { path: "x", name: "x" } });
  expect(q.running).toBe(false);
  q = run(q, add("b.md"));
  expect(nextJob(q)).toBeUndefined();
});

test("convert all to X only sets supported targets on waiting jobs", () => {
  let q = run(emptyQueue, add("a.pdf", "b.png", "c.md", "d.docx"));
  q = run(q, { type: "start", id: q.jobs[3].id });
  q = run(q, { type: "setAll", target: "txt", platform: "desktop" });
  expect(q.jobs.map((j) => j.target)).toEqual(["txt", "pdf", "txt", "pdf"]);
});

test("a single target can be changed only to a supported one", () => {
  let q = run(emptyQueue, add("a.png"));
  q = run(q, { type: "setTarget", id: q.jobs[0].id, target: "docx" });
  expect(q.jobs[0].target).toBe("pdf");
  q = run(emptyQueue, add("a.pdf"));
  q = run(q, { type: "setTarget", id: q.jobs[0].id, target: "png" });
  expect(q.jobs[0].target).toBe("png");
});

test("retry puts a failed job back in the queue", () => {
  let q = run(emptyQueue, add("a.docx"), { type: "run" });
  q = run(q, { type: "start", id: q.jobs[0].id }, { type: "fail", id: q.jobs[0].id, error: "timeout" }, { type: "retry", id: q.jobs[0].id });
  expect(q.jobs[0]).toMatchObject({ state: "queued", error: undefined, progress: 0 });
  expect(nextJob(q)?.name).toBe("a.docx");
});

test("combine images merges waiting image jobs into one PDF job", () => {
  const q = run(emptyQueue, add("1.jpg", "a.md", "2.png", "3.webp"), { type: "combineImages" });
  expect(q.jobs.map((j) => [j.name, j.inputs.length])).toEqual([
    ["1.jpg", 3],
    ["a.md", 1],
  ]);
  expect(q.jobs[0].target).toBe("pdf");
});

test("remove and clear finished", () => {
  let q = run(emptyQueue, add("a.docx", "b.md", "c.txt"), { type: "run" });
  q = run(q, { type: "start", id: q.jobs[0].id }, { type: "done", id: q.jobs[0].id, output: { path: "x", name: "x" } });
  q = run(q, { type: "remove", id: q.jobs[2].id });
  expect(q.jobs.map((j) => j.name)).toEqual(["a.docx", "b.md"]);
  q = run(q, { type: "clearFinished" });
  expect(q.jobs.map((j) => j.name)).toEqual(["b.md"]);
});

test("android gets only built-in targets", () => {
  const q = run(emptyQueue, { type: "add", inputs: [ref("a.doc"), ref("b.odt")], platform: "android" });
  expect(q.jobs.map((j) => [j.name, j.target])).toEqual([["b.odt", "pdf"]]);
});
