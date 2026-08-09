export type DesktopPlatform = "linux" | "macos" | "windows";

export function detectDesktopPlatform(userAgent: string, platformHint: string): DesktopPlatform {
  const signature = `${platformHint} ${userAgent}`.toLowerCase();

  if (signature.includes("mac")) return "macos";
  if (signature.includes("win")) return "windows";
  return "linux";
}
