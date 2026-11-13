// Converted documents are data, never code: strip everything that could run or reach the network.

const DROP = "script,style,iframe,frame,frameset,object,embed,link,meta,base,form,input,button,select,textarea,noscript,template,svg script";
const BLOCKS = "p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,dd,dt,figcaption,caption,pre";

/** Sanitizes an HTML fragment (or the children of `root`) and marks blocks dir="auto" so Arabic lays out RTL. */
export function sanitizeFragment(html: string): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
  return sanitizeElement(doc.body);
}

export function sanitizeElement(root: Element): string {
  root.querySelectorAll(DROP).forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    for (const { name, value } of [...el.attributes]) {
      const n = name.toLowerCase();
      if (n.startsWith("on")) el.removeAttribute(name);
      else if ((n === "href" || n === "xlink:href") && /^\s*(javascript|vbscript|data):/i.test(value)) el.removeAttribute(name);
      else if (n === "src" || n === "srcset") {
        if (n === "srcset" || !/^data:image\//i.test(value)) el.removeAttribute(name);
      } else if (n === "style" && /url\s*\(|expression\s*\(/i.test(value)) el.removeAttribute(name);
    }
    if (el.tagName === "IMG" && !el.getAttribute("src")) el.remove();
  });
  root.querySelectorAll(BLOCKS).forEach((el) => {
    if (!el.hasAttribute("dir")) el.setAttribute("dir", "auto");
  });
  // Column order and bullet side come from the container, and dir="auto" there would skip the
  // cells/items (they carry their own dir), so decide from the first strong letter.
  root.querySelectorAll("table,ul,ol").forEach((el) => {
    if (el.hasAttribute("dir")) return;
    const m = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]|[֐-ࣿיִ-﷿ﹰ-﻿]/.exec(el.textContent ?? "");
    el.setAttribute("dir", m && /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(m[0]) ? "rtl" : "ltr");
  });
  return root.innerHTML;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
