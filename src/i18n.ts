// UI strings: an English dictionary (default) and an Arabic one with the same keys.
// `ar` is typed as `typeof en`, so a missing translation fails `tsc`.

import { createContext, useContext } from "react";

export type Lang = "en" | "ar";

const en = {
  appName: "Waraq",
  navHome: "Home",
  navReader: "Reader",
  language: "Language",
  langEnglish: "English",
  langArabic: "العربية",
  theme: "Theme",
  themeLight: "Light",
  themeDark: "Dark",
  themeSystem: "System",
  settings: "Settings",

  // Home
  homeTitle: "Open a PDF",
  homeSub: "Drop a file here or pick one from your device. Everything stays on this device.",
  openPdf: "Open PDF",
  dropHere: "Drop to open",
  recentTitle: "Recent",
  recentEmpty: "No recent files yet",
  recentPage: (n: number) => `Page ${n}`,
  removeFromRecent: "Remove from recent",
  justNow: "Just now",
  minutesAgo: (n: number) => `${n} min ago`,
  hoursAgo: (n: number) => `${n} h ago`,
  daysAgo: (n: number) => `${n} d ago`,
  onlyPdf: "Only PDF files can be opened in the reader for now",

  // Reader toolbar
  close: "Close",
  pageOf: (total: number) => `of ${total}`,
  goToPage: "Go to page",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fitWidth: "Fit width",
  fitPage: "Fit page",
  viewMode: "View",
  viewContinuous: "Continuous",
  viewSingle: "Single page",
  viewSpread: "Two pages",
  direction: "Reading direction",
  dirLtr: "Left to right",
  dirRtl: "Right to left",
  night: "Night mode",
  panel: "Side panel",
  loading: "Loading…",

  // Side panel
  tabThumbs: "Pages",
  tabOutline: "Contents",
  tabSearch: "Search",
  outlineEmpty: "This document has no table of contents",
  searchPlaceholder: "Search in document",
  searchExact: "Match Arabic vowels & hamza exactly",
  searchMatchCase: "Match case",
  searchCount: (n: number) => (n === 1 ? "1 result" : `${n} results`),
  searchNone: "No results",
  searchScanning: (done: number, total: number) => `Searching page ${done} of ${total}…`,
  prevResult: "Previous result",
  nextResult: "Next result",

  // Password
  passwordTitle: "This PDF is protected",
  passwordSub: (name: string) => `Enter the password to open “${name}”.`,
  passwordLabel: "Password",
  passwordOpen: "Open",
  cancel: "Cancel",

  errors: {
    notAPdf: "This file isn't a readable PDF",
    passwordRequired: "This PDF needs a password",
    wrongPassword: "Wrong password, try again",
    fileMissing: "File not found. It may have been moved or deleted.",
    readFailed: "The file couldn't be read",
    noText: "This document has no searchable text",
  },
};

const ar: typeof en = {
  appName: "ورق",
  navHome: "الرئيسية",
  navReader: "القارئ",
  language: "اللغة",
  langEnglish: "English",
  langArabic: "العربية",
  theme: "المظهر",
  themeLight: "فاتح",
  themeDark: "داكن",
  themeSystem: "حسب النظام",
  settings: "الإعدادات",

  homeTitle: "افتح ملف PDF",
  homeSub: "اسحب ملفًا إلى هنا أو اختره من جهازك. كل شيء يبقى على هذا الجهاز.",
  openPdf: "فتح PDF",
  dropHere: "أفلِت الملف لفتحه",
  recentTitle: "الأخيرة",
  recentEmpty: "لا توجد ملفات حديثة بعد",
  recentPage: (n: number) => `صفحة ${n}`,
  removeFromRecent: "إزالة من القائمة",
  justNow: "الآن",
  minutesAgo: (n: number) => `قبل ${n} د`,
  hoursAgo: (n: number) => `قبل ${n} س`,
  daysAgo: (n: number) => `قبل ${n} يوم`,
  onlyPdf: "القارئ يفتح ملفات PDF فقط حاليًا",

  close: "إغلاق",
  pageOf: (total: number) => `من ${total}`,
  goToPage: "الذهاب إلى صفحة",
  zoomIn: "تكبير",
  zoomOut: "تصغير",
  fitWidth: "ملء العرض",
  fitPage: "الصفحة كاملة",
  viewMode: "العرض",
  viewContinuous: "متصل",
  viewSingle: "صفحة واحدة",
  viewSpread: "صفحتان",
  direction: "اتجاه القراءة",
  dirLtr: "من اليسار إلى اليمين",
  dirRtl: "من اليمين إلى اليسار",
  night: "الوضع الليلي",
  panel: "اللوحة الجانبية",
  loading: "جارٍ التحميل…",

  tabThumbs: "الصفحات",
  tabOutline: "الفهرس",
  tabSearch: "البحث",
  outlineEmpty: "لا يحتوي هذا المستند على فهرس",
  searchPlaceholder: "ابحث في المستند",
  searchExact: "طابِق الحركات والهمزات بدقة",
  searchMatchCase: "طابِق حالة الأحرف",
  searchCount: (n: number) => (n === 1 ? "نتيجة واحدة" : `${n} نتيجة`),
  searchNone: "لا توجد نتائج",
  searchScanning: (done: number, total: number) => `جارٍ البحث في الصفحة ${done} من ${total}…`,
  prevResult: "النتيجة السابقة",
  nextResult: "النتيجة التالية",

  passwordTitle: "هذا الملف محمي بكلمة مرور",
  passwordSub: (name: string) => `أدخل كلمة المرور لفتح «${name}».`,
  passwordLabel: "كلمة المرور",
  passwordOpen: "فتح",
  cancel: "إلغاء",

  errors: {
    notAPdf: "هذا الملف ليس PDF قابلًا للقراءة",
    passwordRequired: "هذا الملف يحتاج كلمة مرور",
    wrongPassword: "كلمة المرور خاطئة، حاول مرة أخرى",
    fileMissing: "الملف غير موجود. ربما نُقل أو حُذف.",
    readFailed: "تعذّرت قراءة الملف",
    noText: "لا يحتوي هذا المستند على نص قابل للبحث",
  },
};

export type Strings = typeof en;
export const dict: Record<Lang, Strings> = { en, ar };

export function dirFor(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

export type LangCtx = { lang: Lang; setLang(l: Lang): void };
export const LangContext = createContext<LangCtx>({ lang: "en", setLang: () => {} });

export function useLang(): LangCtx {
  return useContext(LangContext);
}

export function useT(): Strings {
  return dict[useLang().lang];
}
