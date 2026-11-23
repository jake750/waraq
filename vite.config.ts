import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import { execSync } from "node:child_process";

// The commit a build came from, shown next to the version in Settings (for bug reports).
const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "";
  }
})();
import { pdfjsLigatureFix } from "./scripts/pdfjs-ligature-plugin.mjs";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [react(), pdfjsLigatureFix()],
  define: { __COMMIT__: JSON.stringify(commit) },
  // pdf.js loads its worker as a module; the worker bundle needs the same pdf.js patch.
  worker: { format: "es" as const, plugins: () => [pdfjsLigatureFix()] },
  // Legacy build carries polyfills (e.g. Promise.try) that older Android WebViews lack.
  resolve: { alias: [{ find: /^pdfjs-dist$/, replacement: "pdfjs-dist/legacy/build/pdf.mjs" }] },
  // The big chunks left are single libraries loaded on first use (fontkit when an edit is saved, the
  // converters when a conversion runs) and the pdf.js worker; none is on the startup path.
  build: { chunkSizeWarningLimit: 800 },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
