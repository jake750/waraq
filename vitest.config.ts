import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The node-compatible pdf.js build for tests; the app uses the regular build.
    alias: [{ find: /^pdfjs-dist$/, replacement: "pdfjs-dist/legacy/build/pdf.mjs" }],
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node", globals: true, testTimeout: 20000 },
});
