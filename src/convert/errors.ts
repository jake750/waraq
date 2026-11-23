export type ConvertErrorCode =
  | "bad-input" // the file is corrupt or isn't what its extension says
  | "unsupported" // no route for this pair on this platform
  | "engine-failed" // LibreOffice / the print engine reported a failure
  | "timeout"
  | "cancelled"
  | "office-missing" // LibreOffice needed but not installed
  | "write-failed"
  | "protected" // a password-protected PDF
  | "too-large"; // bigger than the app can safely load (a huge file, or a zip that unpacks to gigabytes)

export class ConvertError extends Error {
  constructor(
    public code: ConvertErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ConvertError";
  }
}

export const asConvertError = (e: unknown, fallback: ConvertErrorCode = "engine-failed"): ConvertError =>
  e instanceof ConvertError
    ? e
    : (e as { code?: unknown })?.code === "too-large" // a PdfError from reading the file
      ? new ConvertError("too-large")
      : new ConvertError(fallback, String((e as Error)?.message ?? e));
