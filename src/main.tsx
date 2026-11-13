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
if (import.meta.env.DEV) import("./devSelftest").then((m) => m.maybeRunSelftest());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
