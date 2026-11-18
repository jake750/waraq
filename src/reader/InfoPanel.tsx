import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useT } from "../i18n";
import { formatBytes, paperLabel, parsePdfDate } from "./docInfo";

type Row = [label: string, value: string];

/** Title, author, dates, size and page format of the open document. */
export default function InfoPanel({ doc, name }: { doc: PDFDocumentProxy; name: string }) {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const [meta, dl, page] = await Promise.all([
        doc.getMetadata().catch(() => null),
        doc.getDownloadInfo().catch(() => null),
        doc.getPage(1),
      ]);
      const info = (meta?.info ?? {}) as Record<string, unknown>;
      const str = (k: string) => (typeof info[k] === "string" ? (info[k] as string).trim() : "");
      const fmt = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" });
      const date = (k: string) => {
        const d = parsePdfDate(str(k));
        return d ? fmt.format(d) : "";
      };
      const [, , w, h] = page.view;
      const rotated = page.rotate % 180 !== 0;
      const list: Row[] = [
        [t.infoFile, name],
        [t.infoTitle, str("Title")],
        [t.infoAuthor, str("Author")],
        [t.infoPages, String(doc.numPages)],
        [t.infoPaper, rotated ? paperLabel(h, w) : paperLabel(w, h)],
        [t.infoSize, dl?.length ? formatBytes(dl.length) : ""],
        [t.infoCreated, date("CreationDate")],
        [t.infoModified, date("ModDate")],
        [t.infoCreator, [str("Creator"), str("Producer")].filter(Boolean).join(" · ")],
        [t.infoVersion, str("PDFFormatVersion") ? `PDF ${str("PDFFormatVersion")}` : ""],
      ];
      if (live) setRows(list.filter(([, v]) => v));
    })().catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [doc, name, t]);
  if (!rows) return null;
  return (
    <dl className="doc-info">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd dir="auto">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
