import { toError } from "../../src/convert/native";

test("native errors map by their exact code, never by a word inside OS text", () => {
  expect(toError("timeout").code).toBe("timeout");
  expect(toError("write-failed: disk full").code).toBe("write-failed");
  expect(toError("file-missing").code).toBe("bad-input");
  expect(toError("The operation was cancelled by the system").code).toBe("engine-failed");
  expect(toError(new Error("protected")).code).toBe("engine-failed");
});
