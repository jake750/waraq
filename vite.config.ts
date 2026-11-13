import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import { pdfjsLigatureFix } from "./scripts/pdfjs-ligature-plugin.mjs";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [react(), pdfjsLigatureFix()],
  // pdf.js loads its worker as a module; the worker bundle needs the same pdf.js patch.
  worker: { format: "es" as const, plugins: () => [pdfjsLigatureFix()] },
  // Legacy build carries polyfills (e.g. Promise.try) that older Android WebViews lack.
  resolve: { alias: [{ find: /^pdfjs-dist$/, replacement: "pdfjs-dist/legacy/build/pdf.mjs" }] },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
