import { vi } from "vitest";

const invoke = vi.fn();
const readFile = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: (...a: unknown[]) => readFile(...a) }));

const { readDocument, resolveName, forgetNames } = await import("../src/files/docRef");
const ref = { kind: "uri", uri: "content://com.android.providers.downloads.documents/document/msf%3A42" } as const;

beforeEach(() => {
  invoke.mockReset();
  readFile.mockReset();
  forgetNames();
});

test("a content URI whose grant expired is read from the private Recent copy", async () => {
  readFile.mockRejectedValue(new Error("Permission Denial"));
  invoke.mockImplementation(async (cmd: string) =>
    cmd === "android_recent_copy" ? "/data/user/0/app/files/recent/abc" : new Uint8Array([37, 80, 68, 70]).buffer,
  );
  expect([...(await readDocument(ref))]).toEqual([37, 80, 68, 70]);
  expect(invoke).toHaveBeenCalledWith("read_file", { path: "/data/user/0/app/files/recent/abc" });
});

test("without a copy the read still fails", async () => {
  readFile.mockRejectedValue(new Error("Permission Denial"));
  invoke.mockResolvedValue(null);
  await expect(readDocument(ref)).rejects.toMatchObject({ code: "read-failed" });
});

test("a readable URI never touches the copy", async () => {
  readFile.mockResolvedValue(new Uint8Array([1]));
  await readDocument(ref);
  expect(invoke).not.toHaveBeenCalled();
});

test("an untyped URI is sniffed once, then its name is remembered", async () => {
  invoke.mockResolvedValue({ name: "scan", mime: "application/octet-stream" });
  readFile.mockResolvedValue(new TextEncoder().encode("%PDF-1.7 ..."));
  expect(await resolveName(ref)).toBe("scan.pdf");
  expect(await resolveName(ref)).toBe("scan.pdf");
  expect(readFile).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledTimes(1);
});
