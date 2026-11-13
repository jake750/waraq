export function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export function isDesktop(): boolean {
  return !isAndroid();
}
