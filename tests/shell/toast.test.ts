import { toastKind } from "../../src/shell/toast";
import { dict as strings } from "../../src/i18n";

test("error strings show as errors, the rest as information, and a stated kind wins", () => {
  for (const lang of ["en", "ar"] as const) {
    const t = strings[lang];
    expect(toastKind(t.convertErrors["bad-input"], t)).toBe("error");
    expect(toastKind(t.errors.fileMissing, t)).toBe("error");
    expect(toastKind(t.recentFailed, t)).toBe("error");
    expect(toastKind(t.scannedNotice, t)).toBe("info");
    expect(toastKind(t.savedParts(3), t, "success")).toBe("success");
  }
});
