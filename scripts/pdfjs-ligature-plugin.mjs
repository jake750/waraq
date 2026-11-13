// pdf.js joins a text run's glyph strings and then reverses Arabic runs character by character.
// A ligature glyph that maps to several letters (lam-alef "لأ") comes out flipped ("أل"), so
// "الأول" is read as "األول". We patch the worker so such a glyph is pushed pre-reversed; the
// later reversal puts it back. The build fails loudly if pdf.js changes and the line is gone.

const TARGET = "textChunk.str.push(glyphUnicode);";
const RTL = "[\\u0590-\\u08ff\\ufb1d-\\ufdff\\ufe70-\\ufeff]";
const REPLACEMENT =
  `textChunk.str.push(glyphUnicode.length > 1 && /^${RTL}+$/.test(glyphUnicode) ? [...glyphUnicode].reverse().join("") : glyphUnicode);`;

export function pdfjsLigatureFix() {
  return {
    name: "waraq-pdfjs-ligature-fix",
    enforce: "pre",
    transform(code, id) {
      const [path, query = ""] = id.split("?");
      if (!/pdfjs-dist[\\/]legacy[\\/]build[\\/]pdf\.worker\.mjs$/.test(path)) return null;
      // The build's "?worker&url" stub only points at the file; the dev server serves the file
      // itself as "?worker_file&type=module".
      if (!code.includes(TARGET)) {
        if (query) return null;
        throw new Error(`pdfjs-ligature-fix: "${TARGET}" not found in ${id}`);
      }
      return { code: code.replace(TARGET, REPLACEMENT), map: null };
    },
  };
}
