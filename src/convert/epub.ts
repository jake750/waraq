// EPUB → one HTML body: chapters in spine order, images inlined as data: URLs.
import JSZip from "jszip";
import { byLocal } from "./xml";

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "");
function resolvePath(base: string, rel: string): string {
  const parts = (dirOf(base) + rel.split("#")[0]).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return decodeURIComponent(out.join("/"));
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

export async function epubToHtml(bytes: Uint8Array): Promise<{ title: string; body: string }> {
  const zip = await JSZip.loadAsync(bytes);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  if (!container) throw new Error("no container.xml");
  const cdoc = new DOMParser().parseFromString(container, "application/xml");
  const opfPath = byLocal(cdoc, "rootfile")[0]?.getAttribute("full-path");
  const opfXml = opfPath ? await zip.file(opfPath)?.async("string") : undefined;
  if (!opfPath || !opfXml) throw new Error("no package document");
  const opf = new DOMParser().parseFromString(opfXml, "application/xml");

  const title = byLocal(opf, "title")[0]?.textContent?.trim() ?? "";
  const manifest = new Map<string, string>();
  for (const it of byLocal(opf, "item")) {
    manifest.set(it.getAttribute("id") ?? "", it.getAttribute("href") ?? "");
  }
  const spine = byLocal(opf, "itemref").map((r) => manifest.get(r.getAttribute("idref") ?? ""));

  const parts: string[] = [];
  for (const href of spine) {
    if (!href) continue;
    const path = resolvePath(opfPath, href);
    const xhtml = await zip.file(path)?.async("string");
    if (!xhtml) continue;
    const doc = new DOMParser().parseFromString(xhtml, "text/html");
    for (const img of Array.from(doc.querySelectorAll("img[src], image"))) {
      const attr = img.hasAttribute("src") ? "src" : "xlink:href";
      const src = img.getAttribute(attr) ?? img.getAttribute("href") ?? "";
      const file = zip.file(resolvePath(path, src));
      const ext = src.split(".").pop()?.toLowerCase() ?? "";
      if (file && MIME[ext]) {
        const b64 = await file.async("base64");
        const el = doc.createElement("img");
        el.setAttribute("src", `data:${MIME[ext]};base64,${b64}`);
        el.setAttribute("alt", img.getAttribute("alt") ?? "");
        img.replaceWith(el);
      }
    }
    const dir = doc.documentElement.getAttribute("dir") ?? doc.body?.getAttribute("dir");
    parts.push(`<section${dir ? ` dir="${dir}"` : ""}>${doc.body?.innerHTML ?? ""}</section>`);
  }
  if (!parts.length) throw new Error("empty spine");
  return { title, body: parts.join("\n") };
}
