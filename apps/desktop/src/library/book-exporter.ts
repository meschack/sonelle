import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../platform/tauri-runtime";
import {
  createDesktopMediaSourceGateway,
  type MediaSourceGateway
} from "../platform/media-source-gateway";
import { resolveBookCover } from "./book-assets";
import type { BookExportDataDto, BookExporter } from "./library-contracts";

export function createBookExporter(
  mediaSources: MediaSourceGateway = createDesktopMediaSourceGateway()
): BookExporter {
  if (!isTauriRuntime()) {
    return {
      async exportData() {
        throw new Error("Export is available after opening a saved library book.");
      }
    };
  }
  return {
    exportData(bookId) {
      return invoke<BookExportDataDto>("export_book_data", { bookId }).then((data) => ({
        ...data,
        book: resolveBookCover(data.book, mediaSources)
      }));
    }
  };
}
