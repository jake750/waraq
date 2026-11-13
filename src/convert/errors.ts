export type ConvertErrorCode =
  | "bad-input" // the file is corrupt or isn't what its extension says
  | "unsupported" // no route for this pair on this platform
  | "engine-failed" // LibreOffice / the print engine reported a failure
  | "timeout"
  | "cancelled"
  | "office-missing" // LibreOffice needed but not installed
  | "write-failed";

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
  e instanceof ConvertError ? e : new ConvertError(fallback, String((e as Error)?.message ?? e));
