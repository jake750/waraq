import React from "react";
import ReactDOM from "react-dom/client";
// Font bundled with the app (no network). Covers Arabic and Latin.
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./theme.css";
import "./pdf/pdfjs";
import App from "./App";

// Development only: WARAQ_SELFTEST=<folder> runs every conversion route on the real engines.
// The webview's own zoom is on so a touchpad pinch reaches the page (as Ctrl + wheel); the reader
// and editor zoom their pages themselves, so the whole interface never scales.
window.addEventListener("wheel", (e) => e.ctrlKey && e.preventDefault(), { passive: false });
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && ["+", "=", "-", "0"].includes(e.key)) e.preventDefault();
});

if (import.meta.env.DEV) import("./devSelftest").then((m) => m.maybeRunSelftest());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
