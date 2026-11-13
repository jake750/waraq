// App-only pdf.js setup: run parsing in a real web worker bundled by Vite (not imported by tests).
import { GlobalWorkerOptions } from "pdfjs-dist";
import { setPdfAssetBase } from "./openPdf";
// Bundled by Vite (not copied) so the worker gets the Arabic ligature fix: scripts/pdfjs-ligature-plugin.mjs.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?worker&url";

GlobalWorkerOptions.workerSrc = workerUrl;
// Decoders, CMaps and fonts copied to public/pdfjs/ by scripts/copy-pdfjs-assets.mjs.
setPdfAssetBase(new URL("pdfjs/", document.baseURI).href);
