export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isAndroidRuntime(): boolean {
  return typeof navigator !== "undefined" && /\bandroid\b/i.test(navigator.userAgent);
}
