// App-only pdf.js setup: run parsing in a real web worker bundled by Vite (not imported by tests).
import { GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;
