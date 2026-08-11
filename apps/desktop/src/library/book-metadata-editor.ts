import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "../platform/tauri-runtime";
import {
  createDesktopMediaSourceGateway,
  type MediaSourceGateway
} from "../platform/media-source-gateway";
import { resolveBookCover } from "./book-assets";
import type { BookMetadataDto, BookMetadataEditor } from "./library-contracts";

export function createBookMetadataEditor(
  mediaSources: MediaSourceGateway = createDesktopMediaSourceGateway()
): BookMetadataEditor {
  if (!isTauriRuntime()) return unavailableBookMetadataEditor;
  return {
    async chooseCover() {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Book covers", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
      });
      if (selected == null || Array.isArray(selected)) return null;
      const resolved = mediaSources.resolve({ kind: "book-cover", source: selected });
      return resolved.status === "available" ? { path: selected, previewSrc: resolved.url } : null;
    },
    update(input) {
      return invoke<BookMetadataDto>("update_book_metadata", { request: input }).then((metadata) =>
        resolveBookCover(metadata, mediaSources)
      );
    }
  };
}

const unavailableBookMetadataEditor: BookMetadataEditor = {
  async chooseCover() {
    return null;
  },
  async update() {
    throw new Error("Book details can be edited in the desktop app.");
  }
};
