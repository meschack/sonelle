import type { MediaSourceGateway } from "../platform/media-source-gateway";
import type { ReaderDocumentDto } from "./library-models";

export function resolveDocumentAssets(
  document: ReaderDocumentDto,
  mediaSources: MediaSourceGateway
): ReaderDocumentDto {
  return { ...document, book: resolveBookCover(document.book, mediaSources) };
}

export function resolveBookCover<TBook extends { coverImageSrc?: string | null }>(
  book: TBook,
  mediaSources: MediaSourceGateway
): TBook {
  const resolved = mediaSources.resolve({ kind: "book-cover", source: book.coverImageSrc });
  return { ...book, coverImageSrc: resolved.status === "available" ? resolved.url : null };
}
