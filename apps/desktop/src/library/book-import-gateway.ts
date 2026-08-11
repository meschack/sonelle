import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "../platform/tauri-runtime";
import {
  createDesktopMediaSourceGateway,
  type MediaSourceGateway
} from "../platform/media-source-gateway";
import { resolveDocumentAssets } from "./book-assets";
import type { BookImportGateway, BookImportOutcome, BookImportRequest } from "./library-contracts";
import type { ReaderDocumentDto } from "./library-models";

export function createBookImportGateway(
  mediaSources: MediaSourceGateway = createDesktopMediaSourceGateway()
): BookImportGateway {
  if (!isTauriRuntime()) return unavailableBookImportGateway;

  return {
    async importBook(request) {
      const source = await resolveDesktopSource(request);
      if (source == null) return { status: "cancelled" };

      const document = await invoke<ReaderDocumentDto>("import_epub", { path: source });
      return imported(resolveDocumentAssets(document, mediaSources));
    }
  };
}

async function resolveDesktopSource(request: BookImportRequest): Promise<string | null> {
  if (request.kind === "provided") return request.source;

  const selected = await open({
    multiple: false,
    filters: [{ name: "EPUB books", extensions: ["epub"] }]
  });
  return selected == null || Array.isArray(selected) ? null : selected;
}

function imported(document: ReaderDocumentDto): BookImportOutcome {
  return { status: "imported", document };
}

const unavailableBookImportGateway: BookImportGateway = {
  async importBook() {
    throw new Error("EPUB import is available in the desktop app.");
  }
};
