// Generates the test PDFs in fixtures/. All text is original, written for this project.
// Usage: npm run fixtures   (needs Chrome or Edge installed; Windows paths are auto-detected,
// or set BROWSER=<path to chrome/msedge>)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PDFDocument as CantooDoc } from "@cantoo/pdf-lib";

const root = resolve(import.meta.dirname, "..");
const fx = join(root, "fixtures");
const src = join(fx, "src");
mkdirSync(src, { recursive: true });

const browser =
  process.env.BROWSER ??
  [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  ].find((p) => existsSync(p));
if (!browser) throw new Error("No Chrome/Edge found. Set BROWSER=<path>.");

const profile = mkdtempSync(join(tmpdir(), "waraq-fx-"));
function chrome(args) {
  execFileSync(browser, ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, ...args], {
    stdio: "ignore",
    timeout: 60_000,
  });
}
const printPdf = (html, out) =>
  chrome(["--no-pdf-header-footer", "--generate-pdf-document-outline", `--print-to-pdf=${out}`, pathToFileURL(html).href]);
const screenshot = (html, out, w, h) => chrome([`--screenshot=${out}`, `--window-size=${w},${h}`, "--hide-scrollbars", pathToFileURL(html).href]);

// ---------- Arabic book: 12 A5 pages, 4 chapters ----------

const P1 = "الْكِتَابُ صَدِيقٌ لَا يَمَلُّ، يَفْتَحُ لَكَ أَبْوَابَهُ كُلَّمَا عُدْتَ إِلَيْهِ، وَيَحْفَظُ لَكَ مَا نَسِيتَ.";
const pool = [
  "كانت الورقة في أول أمرها شيئًا نادرًا، يكتب عليها الناس ما يخافون ضياعه من علم أو خبر أو وصية، ثم صارت مع الزمن في كل بيت.",
  "أصبح ملف PDF اليوم الصيغة الأكثر انتشارًا لتبادل المستندات، لأنه يحافظ على شكل الصفحة كما هي على كل جهاز.",
  "وفي هذا الفصل نتأمل كيف تغيّرت عادات القراءة حين انتقل النص من الورق إلى الشاشة، وما الذي بقي ثابتًا رغم كل هذا التغيّر.",
  "إن القارئ المتأني يقرأ الجملة مرتين: مرة ليفهمها، ومرة ليسأل نفسه لماذا كُتبت بهذه الطريقة دون غيرها.",
  "يحتاج المؤلف إلى صبر طويل، فالكتاب الجيد لا يُكتب في ليلة، بل يُبنى فصلًا بعد فصل، ويُراجع مرة بعد مرة حتى يستقيم.",
  "وقد قيل إن المكتبة ذاكرة الأمة، فإذا حفظت كتبها حفظت تاريخها، وإذا أهملتها ضاع منها شيء لا يعود.",
];
const chapters = { 1: "الفصل الأول", 4: "الفصل الثاني", 7: "الفصل الثالث", 10: "الفصل الرابع" };
const page1 = [P1, pool[0], pool[1]];
const pages = [];
for (let n = 1; n <= 12; n++) {
  const paras = n === 1 ? page1 : [pool[n % 6], pool[(n + 2) % 6], pool[(n + 4) % 6]];
  pages.push(
    `<section>${chapters[n] ? `<h1>${chapters[n]}</h1>` : ""}${paras.map((p) => `<p>${p}</p>`).join("")}<footer>${n}</footer></section>`,
  );
}
const arabicHtml = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
@font-face{font-family:Amiri;src:url(fonts/amiri-arabic-400-normal.woff2) format("woff2");font-weight:400}
@font-face{font-family:Amiri;src:url(fonts/amiri-arabic-700-normal.woff2) format("woff2");font-weight:700}
@page{size:A5;margin:18mm 16mm}
body{font-family:Arial,sans-serif;font-size:16px;line-height:1.9;margin:0}
section{break-after:page;position:relative;height:168mm;overflow:hidden}
section:last-child{break-after:auto}
h1{font-size:26px;margin:0 0 14px}
footer{position:absolute;bottom:0;inset-inline:0;text-align:center;font-size:13px;color:#555}
</style></head><body>${pages.join("")}</body></html>`;
writeFileSync(join(src, "arabic-book.html"), arabicHtml);
writeFileSync(join(fx, "arabic-book.source.txt"), page1.join("\n") + "\n");
printPdf(join(src, "arabic-book.html"), join(fx, "arabic-book.pdf"));

// ---------- English two-column: 3 pages, "lighthouse" once per page ----------

const filler = [
  "Harbour towns keep their own clocks. Boats leave before dawn and the market opens when they return, whatever the calendar says.",
  "The archive on the hill holds shipping records going back two hundred years, each ledger written in a slightly different hand.",
  "Fog arrives in the afternoon in late autumn, rolling in from the west and settling over the roofs until the evening wind clears it.",
  "Children learn the names of the rocks along the shore before they learn the names of the streets, because the rocks matter more.",
  "A ferry crosses the bay twice a day. In winter it carries more letters than passengers, and the captain knows most of the addresses.",
  "Old maps show a second pier that no longer exists; its stones were reused to build the school, which still stands by the square.",
];
const special = [
  "On the northern cape stands a lighthouse that has guided ships for a century, its lamp turning every eleven seconds.",
  "The keeper's diary describes the storm of the great winter, when the lighthouse was the only light for forty miles.",
  "Today the lighthouse is automatic, but the town still repaints its white tower every spring as a small celebration.",
];
const enPages = special.map((s, i) => {
  const ps = [];
  for (let k = 0; k < 16; k++) ps.push(filler[(k + i) % filler.length]);
  ps.splice(5, 0, s);
  return `<section>${ps.map((p) => `<p>${p}</p>`).join("")}</section>`;
});
const enCss = `@page{size:A4;margin:18mm}body{font-family:Georgia,serif;font-size:13px;line-height:1.55;margin:0}
section{column-count:2;column-gap:10mm;break-after:page;height:255mm;overflow:hidden}section:last-child{break-after:auto}p{margin:0 0 9px}`;
writeFileSync(
  join(src, "english-two-column.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${enCss}</style></head><body>${enPages.join("")}</body></html>`,
);
printPdf(join(src, "english-two-column.html"), join(fx, "english-two-column.pdf"));

// ---------- Scanned: two image-only pages ----------

const scanned = await PDFDocument.create();
for (let i = 0; i < 2; i++) {
  const html = join(profile, `scan-${i}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:48px;font-family:Georgia,serif;font-size:20px;line-height:1.6;background:#fbfaf6}</style></head><body>${filler
      .map((p) => `<p>${p}</p>`)
      .join("")}<p>Scanned page ${i + 1}</p></body></html>`,
  );
  const png = join(profile, `scan-${i}.png`);
  screenshot(html, png, 794, 1123);
  const img = await scanned.embedPng(readFileSync(png));
  const page = scanned.addPage([595.28, 841.89]);
  page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
}
writeFileSync(join(fx, "scanned.pdf"), await scanned.save());

// ---------- Password: two pages, user password test123 ----------

const locked = await CantooDoc.create();
const font = await locked.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 2; i++) locked.addPage([595.28, 841.89]).drawText(`Protected page ${i}`, { x: 72, y: 760, size: 24, font });
locked.encrypt({ userPassword: "test123", ownerPassword: "owner123" });
writeFileSync(join(fx, "password.pdf"), await locked.save());

// ---------- Broken files ----------

writeFileSync(join(fx, "not-a-pdf.pdf"), "hello, I am not a pdf");
const en = readFileSync(join(fx, "english-two-column.pdf"));
writeFileSync(join(fx, "truncated.pdf"), en.subarray(0, Math.floor(en.length * 0.4)));

rmSync(profile, { recursive: true, force: true });
console.log("fixtures written to", fx);
