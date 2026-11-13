// A small RTF reader: text, paragraphs, line breaks, tabs, bold/italic, Unicode (\uN) and code-page bytes (\'hh).
// Enough for documents saved by Word/WordPad, including Arabic (\ansicpg1256). Layout (tables, frames) is not kept.
import { escapeHtml } from "./sanitize";

// Destinations whose content is not document text.
const SKIP = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "headerl", "headerr", "headerf", "footer", "footerl",
  "footerr", "footerf", "listtable", "listoverridetable", "themedata", "colorschememapping", "datastore", "latentstyles",
  "rsidtbl", "xmlnstbl", "mmathPr", "object", "generator", "filetbl", "revtbl", "pgdsctbl", "fldinst", "bkmkstart",
  "bkmkend", "operator", "author", "title", "company", "nonshppict", "shppict", "sp", "sn", "sv",
]);

type State = { skip: boolean; uc: number; bold: boolean; italic: boolean };

export function rtfToHtml(bytes: Uint8Array): string {
  const src = new TextDecoder("latin1").decode(bytes);
  if (!src.startsWith("{\\rtf")) throw new Error("not rtf");
  let codepage = "windows-1252";
  let st: State = { skip: false, uc: 1, bold: false, italic: false };
  const stack: State[] = [];
  const paras: string[] = [];
  let cur = "";
  let run = "";
  let runFmt = { bold: false, italic: false };
  let pending: number[] = []; // code-page bytes waiting to be decoded together
  let skipChars = 0;

  const flushBytes = () => {
    if (!pending.length) return;
    let s: string;
    try {
      s = new TextDecoder(codepage).decode(new Uint8Array(pending));
    } catch {
      s = new TextDecoder("windows-1252").decode(new Uint8Array(pending));
    }
    pending = [];
    addText(s);
  };
  const flushRun = () => {
    if (!run) return;
    let h = escapeHtml(run).replace(/\t/g, "&emsp;");
    if (runFmt.italic) h = `<i>${h}</i>`;
    if (runFmt.bold) h = `<b>${h}</b>`;
    cur += h;
    run = "";
  };
  const addText = (s: string) => {
    if (st.skip) return;
    if (runFmt.bold !== st.bold || runFmt.italic !== st.italic) {
      flushRun();
      runFmt = { bold: st.bold, italic: st.italic };
    }
    run += s;
  };
  const endPara = () => {
    flushBytes();
    flushRun();
    paras.push(cur);
    cur = "";
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "{") {
      flushBytes();
      stack.push({ ...st });
      i++;
      if (src.startsWith("\\*", i)) st.skip = true;
      continue;
    }
    if (c === "}") {
      flushBytes();
      flushRun();
      st = stack.pop() ?? st;
      runFmt = { bold: st.bold, italic: st.italic };
      i++;
      continue;
    }
    if (c === "\\") {
      const next = src[i + 1];
      if (next === "'") {
        const b = parseInt(src.substr(i + 2, 2), 16);
        i += 4;
        if (skipChars > 0) {
          skipChars--;
          continue;
        }
        if (!st.skip && !Number.isNaN(b)) pending.push(b);
        continue;
      }
      if (next === "\\" || next === "{" || next === "}") {
        flushBytes();
        if (skipChars > 0) skipChars--;
        else addText(next);
        i += 2;
        continue;
      }
      if (next === "~") (flushBytes(), addText(" "), (i += 2));
      else if (next === "-" || next === "*") i += 2;
      else if (next === "_") (flushBytes(), addText("‑"), (i += 2));
      else if (next === "\n" || next === "\r") (endPara(), (i += 2));
      else {
        const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i + 1, i + 40));
        if (!m) {
          i++;
          continue;
        }
        i += 1 + m[0].length;
        const word = m[1];
        const arg = m[2] === undefined ? undefined : parseInt(m[2], 10);
        if (word !== "u") flushBytes();
        if (SKIP.has(word)) st.skip = true;
        else if (word === "ansicpg" && arg) codepage = `windows-${arg}`;
        else if (word === "uc" && arg !== undefined) st.uc = arg;
        else if (word === "u" && arg !== undefined) {
          flushBytes();
          addText(String.fromCharCode(arg < 0 ? arg + 65536 : arg));
          skipChars = st.uc;
        } else if (word === "par" || word === "sect") endPara();
        else if (word === "line") (flushRun(), (cur += "<br>"));
        else if (word === "tab") addText("\t");
        else if (word === "b") st.bold = arg !== 0;
        else if (word === "i") st.italic = arg !== 0;
        else if (word === "plain") (st.bold = false), (st.italic = false);
        else if (word === "emdash") addText("—");
        else if (word === "endash") addText("–");
        else if (word === "lquote") addText("‘");
        else if (word === "rquote") addText("’");
        else if (word === "ldblquote") addText("“");
        else if (word === "rdblquote") addText("”");
        else if (word === "bullet") addText("•");
      }
      continue;
    }
    if (c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (skipChars > 0) {
      skipChars--;
      i++;
      continue;
    }
    flushBytes();
    addText(c);
    i++;
  }
  endPara();
  return paras
    .filter((p) => p.replace(/<[^>]+>/g, "").trim() !== "")
    .map((p) => `<p dir="auto">${p}</p>`)
    .join("\n");
}
