import { invoke } from "@tauri-apps/api/core";
import { open, type OpenDialogOptions } from "@tauri-apps/plugin-dialog";
import { isAndroidRuntime, isTauriRuntime } from "../platform/tauri-runtime";
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

  if (isAndroidRuntime()) {
    return createAndroidBookImportGateway({
      choose: (options) => open(options),
      probe: (source) => invoke("probe_book_import_source", { source }),
      async importDocument(source) {
        const document = await invoke<ReaderDocumentDto>("import_epub", { path: source });
        return resolveDocumentAssets(document, mediaSources);
      }
    });
  }

  return {
    async importBook(request) {
      const source = await resolveDesktopSource(request);
      if (source == null) return { status: "cancelled" };

      const document = await invoke<ReaderDocumentDto>("import_epub", { path: source });
      return imported(resolveDocumentAssets(document, mediaSources));
    }
  };
}

interface AndroidBookImportDependencies {
  choose(options: OpenDialogOptions): Promise<string | string[] | null>;
  probe(source: string): Promise<void>;
  importDocument(source: string): Promise<ReaderDocumentDto>;
}

const androidEpubPickerOptions: OpenDialogOptions = {
  multiple: false,
  pickerMode: "document",
  filters: [
    {
      name: "EPUB books",
      extensions: ["epub", "application/epub+zip", "application/zip", "application/octet-stream"]
    }
  ]
};

export function createAndroidBookImportGateway(
  dependencies: AndroidBookImportDependencies
): BookImportGateway {
  return {
    async importBook(request) {
      if (request.kind === "provided" && !isAndroidDocumentSource(request.source)) {
        return imported(await dependencies.importDocument(request.source));
      }

      let source: string | null;
      try {
        source =
          request.kind === "provided"
            ? request.source
            : singleSelection(await dependencies.choose(androidEpubPickerOptions));
      } catch (error) {
        if (isPickerCancellation(error)) return { status: "cancelled" };
        throw error;
      }

      if (source == null) return { status: "cancelled" };

      try {
        await dependencies.probe(source);
      } catch {
        throw new Error(
          "We couldn't read that book from your document provider. Please choose it again."
        );
      }
      return { status: "source-selected", source };
    }
  };
}

function isAndroidDocumentSource(source: string): boolean {
  return source.toLocaleLowerCase().startsWith("content://");
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

function singleSelection(selected: string | string[] | null): string | null {
  return selected == null || Array.isArray(selected) ? null : selected;
}

function isPickerCancellation(error: unknown): boolean {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return message.toLocaleLowerCase().includes("picker cancelled");
}

const unavailableBookImportGateway: BookImportGateway = {
  async importBook() {
    throw new Error("EPUB import is available in the desktop app.");
  }
};
