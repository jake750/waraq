import { defineConfig } from "vitest/config";
import { pdfjsLigatureFix } from "./scripts/pdfjs-ligature-plugin.mjs";

export default defineConfig({
  plugins: [pdfjsLigatureFix()],
  resolve: {
    // The node-compatible pdf.js build for tests; the app uses the same legacy build.
    alias: [{ find: /^pdfjs-dist$/, replacement: "pdfjs-dist/legacy/build/pdf.mjs" }],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: true,
    testTimeout: 20000,
    // Run pdf.js through Vite so the worker gets the ligature fix (scripts/pdfjs-ligature-plugin.mjs).
    server: { deps: { inline: [/pdfjs-dist/] } },
  },
});
