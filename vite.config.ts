import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [react()],
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
