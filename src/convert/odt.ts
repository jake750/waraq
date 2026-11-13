// OpenDocument Text (content.xml) → HTML: headings, paragraphs, bold/italic spans, lists, tables, line breaks.
import JSZip from "jszip";
import { escapeHtml } from "./sanitize";
import { byLocal, childrenOf, localName } from "./xml";

export async function odtToHtml(bytes: Uint8Array): Promise<{ title: string; body: string }> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("content.xml")?.async("string");
  if (!xml) throw new Error("no content.xml");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("bad xml");

  // Automatic text styles that make text bold/italic.
  const styles = new Map<string, { bold: boolean; italic: boolean }>();
  for (const s of byLocal(doc, "style")) {
    const name = s.getAttribute("style:name");
    const props = byLocal(s, "text-properties")[0];
    if (!name || !props) continue;
    styles.set(name, {
      bold: props.getAttribute("fo:font-weight") === "bold",
      italic: props.getAttribute("fo:font-style") === "italic",
    });
  }

  const inline = (el: Element): string => {
    let out = "";
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += escapeHtml(n.textContent ?? "");
      else if (n.nodeType === 1) {
        const e = n as Element;
        switch (localName(e)) {
          case "s":
            out += " ".repeat(Number(e.getAttribute("text:c") ?? 1));
            break;
          case "tab":
            out += "&emsp;";
            break;
          case "line-break":
            out += "<br>";
            break;
          case "span": {
            let h = inline(e);
            const st = styles.get(e.getAttribute("text:style-name") ?? "");
            if (st?.italic) h = `<i>${h}</i>`;
            if (st?.bold) h = `<b>${h}</b>`;
            out += h;
            break;
          }
          default:
            out += inline(e);
        }
      }
    });
    return out;
  };

  const block = (el: Element): string => {
    switch (localName(el)) {
      case "h": {
        const lvl = Math.min(6, Math.max(1, Number(el.getAttribute("text:outline-level") ?? 1)));
        return `<h${lvl}>${inline(el)}</h${lvl}>`;
      }
      case "p":
        return `<p>${inline(el)}</p>`;
      case "list":
        return `<ul>${childrenOf(el, "list-item")
          .map((li) => `<li>${childrenOf(li).map(blockInner).join("")}</li>`)
          .join("")}</ul>`;
      case "table":
        return `<table>${byLocal(el, "table-row")
          .map((r) => `<tr>${childrenOf(r, "table-cell").map((c) => `<td>${childrenOf(c).map(blockInner).join("")}</td>`).join("")}</tr>`)
          .join("")}</table>`;
      case "section":
        return childrenOf(el).map(block).join("");
      default:
        return "";
    }
  };
  // Inside list items and cells a single paragraph is shown without its own <p>.
  const blockInner = (el: Element) => (localName(el) === "p" ? inline(el) : block(el));

  const body = byLocal(doc, "text").find((e) => e.parentElement && localName(e.parentElement) === "body");
  if (!body) throw new Error("no office:text");
  const title = childrenOf(body, "h")[0]?.textContent ?? "";
  return { title, body: childrenOf(body).map(block).join("") };
}
