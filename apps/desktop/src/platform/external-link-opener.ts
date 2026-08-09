import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "./tauri-runtime";

export interface ExternalLinkOpener {
  open(href: string): Promise<void>;
}

export function createExternalLinkOpener(): ExternalLinkOpener {
  return {
    async open(href) {
      const url = allowedExternalUrl(href);
      if (url == null) throw new Error("This book link cannot be opened safely.");

      if (isTauriRuntime()) {
        await openUrl(url);
        return;
      }

      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (opened == null) throw new Error("The browser blocked this book link.");
    }
  };
}

export function allowedExternalUrl(href: string): string | null {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
