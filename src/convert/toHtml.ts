// Every text-like input becomes sanitized HTML; the writers (fromHtml, printPdf) take it from there.
import mammoth from "mammoth";
import { marked } from "marked";
import { ConvertError } from "./errors";
import type { Fmt } from "./formats";
import { epubToHtml } from "./epub";
import { odtToHtml } from "./odt";
import { rtfToHtml } from "./rtf";
import { escapeHtml, sanitizeElement, sanitizeFragment } from "./sanitize";

export type HtmlDoc = { title: string; body: string };

/** Text bytes: BOM-aware UTF-8/UTF-16, falling back to Windows-1256 (old Arabic text files). */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1256").decode(bytes);
  }
}

function textToHtml(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p dir="auto">${p.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("\n");
}

export async function toHtml(bytes: Uint8Array, f: Fmt): Promise<HtmlDoc> {
  try {
    switch (f) {
      case "txt":
        return { title: "", body: textToHtml(decodeText(bytes)) };
      case "md": {
        const html = marked.parse(decodeText(bytes), { async: false, gfm: true }) as string;
        const body = sanitizeFragment(html);
        const title = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(body)?.[1]?.replace(/<[^>]+>/g, "") ?? "";
        return { title, body };
      }
      case "html": {
        const doc = new DOMParser().parseFromString(decodeText(bytes), "text/html");
        const title = doc.title.trim();
        return { title, body: sanitizeElement(doc.body) };
      }
      case "docx": {
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        // arrayBuffer for the browser build, buffer for Node (tests).
        const res = await mammoth.convertToHtml({ arrayBuffer: ab, buffer: bytes } as never);
        const body = sanitizeFragment(res.value);
        const title = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(body)?.[1]?.replace(/<[^>]+>/g, "") ?? "";
        return { title, body };
      }
      case "odt": {
        const { title, body } = await odtToHtml(bytes);
        return { title, body: sanitizeFragment(body) };
      }
      case "rtf":
        return { title: "", body: sanitizeFragment(rtfToHtml(bytes)) };
      case "epub": {
        const { title, body } = await epubToHtml(bytes);
        return { title, body: sanitizeFragment(body) };
      }
      default:
        throw new ConvertError("unsupported", f);
    }
  } catch (e) {
    if (e instanceof ConvertError) throw e;
    throw new ConvertError("bad-input", String((e as Error)?.message ?? e));
  }
}
