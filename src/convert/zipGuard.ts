// Opening the zip-based formats (DOCX, ODT, EPUB) safely: a few kilobytes can unpack to gigabytes
// (a "zip bomb") and take the whole app down. The sizes come from the zip's own directory, read
// before anything is unpacked.
import JSZip from "jszip";
import { ConvertError } from "./errors";

/** More than any real document unpacks to; the webview runs out of memory well before 1 GB. */
export const ZIP_MAX_BYTES = 400 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 20_000;

type Entry = { _data?: { uncompressedSize?: number } };

/** Loads the zip and refuses it ("too-large") if it would unpack to more than `max` bytes. */
export async function loadZip(bytes: Uint8Array, max = ZIP_MAX_BYTES): Promise<JSZip> {
  const zip = await JSZip.loadAsync(bytes);
  checkZip(zip, max);
  return zip;
}

export function checkZip(zip: JSZip, max = ZIP_MAX_BYTES): void {
  let total = 0;
  let count = 0;
  zip.forEach((_, file) => {
    count++;
    total += (file as unknown as Entry)._data?.uncompressedSize ?? 0;
  });
  if (count > ZIP_MAX_ENTRIES || total > max) throw new ConvertError("too-large", `${count} entries, ${total} bytes unpacked`);
}
