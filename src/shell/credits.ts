/** Open-source work inside Waraq, shown in Settings → About. Keep in step with package.json. */
export const CREDITS: { name: string; license: string; pkg?: string }[] = [
  { name: "Tauri", license: "MIT / Apache-2.0", pkg: "@tauri-apps/api" },
  { name: "React", license: "MIT", pkg: "react" },
  { name: "PDF.js", license: "Apache-2.0", pkg: "pdfjs-dist" },
  { name: "pdf-lib", license: "MIT", pkg: "pdf-lib" },
  { name: "fontkit", license: "MIT", pkg: "@pdf-lib/fontkit" },
  { name: "mammoth.js", license: "BSD-2-Clause", pkg: "mammoth" },
  { name: "docx", license: "MIT", pkg: "docx" },
  { name: "Turndown", license: "MIT", pkg: "turndown" },
  { name: "marked", license: "MIT", pkg: "marked" },
  { name: "JSZip", license: "MIT", pkg: "jszip" },
  { name: "cfb", license: "Apache-2.0", pkg: "cfb" },
  { name: "Lucide", license: "ISC", pkg: "lucide-react" },
  { name: "IBM Plex Sans Arabic", license: "OFL-1.1", pkg: "@fontsource/ibm-plex-sans-arabic" },
  // Downloaded on request (desktop), not shipped in the installer.
  { name: "LibreOffice", license: "MPL-2.0" },
];
