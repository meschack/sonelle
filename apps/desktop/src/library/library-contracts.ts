import type { LibraryBookSummary, ReaderDocumentDto } from "./library-models";

export type { LibraryBookSummary, ReaderDocumentDto } from "./library-models";

export type BookImportRequest = { kind: "choose" } | { kind: "provided"; source: string };

export type BookImportOutcome =
  | { status: "cancelled" }
  | { status: "source-selected"; source: string }
  | { status: "imported"; document: ReaderDocumentDto };

export interface BookImportProgress {
  phase: "reading" | "saving";
}

export interface BookImportGateway {
  importBook(
    request: BookImportRequest,
    options?: { onProgress(progress: BookImportProgress): void }
  ): Promise<BookImportOutcome>;
}

export interface BookImportSourceStore {
  prepare(
    source: string,
    options: {
      requestId: string;
      signal?: AbortSignal;
      onProgress(progress: BookImportPreparationProgress): void;
    }
  ): Promise<PreparedBookImportSource>;
}

export interface BookImportPreparationProgress {
  completedBytes: number;
  totalBytes: number | null;
}

export interface PreparedBookImportSource {
  source: string;
  reusedExisting: boolean;
}

export interface BookCatalog {
  list(): Promise<LibraryBookSummary[]>;
  open(bookId: string, chapterId?: string): Promise<ReaderDocumentDto>;
}

export interface BookMetadataEditor {
  chooseCover(): Promise<BookCoverSelection | null>;
  update(input: UpdateBookMetadataInput): Promise<BookMetadataDto>;
}

export interface BookCoverSelection {
  path: string;
  previewSrc: string;
}

export interface UpdateBookMetadataInput {
  bookId: string;
  title: string;
  author: string;
  coverPath: string | null;
  removeCover: boolean;
}

export interface BookMetadataDto {
  bookId: string;
  title: string;
  author: string;
  coverImageSrc: string | null;
}

export interface ReadingPositionStore {
  save(input: SaveReadingPositionInput): Promise<void>;
}

export interface BookmarkStore {
  list(bookId?: string): Promise<LibraryBookmarkDto[]>;
  save(input: SaveBookmarkInput): Promise<LibraryBookmarkDto>;
  delete(bookmarkId: string): Promise<void>;
}

export interface LibrarySearch {
  search(input: SearchLibraryInput): Promise<LibrarySearchResultDto[]>;
}

export interface BookExporter {
  exportData(bookId: string): Promise<BookExportDataDto>;
}

export interface BookDropAdapter {
  listen(onEvent: (event: BookDropEvent) => void): Promise<() => void>;
}

export interface BookOpenRequestAdapter {
  listen(onPath: (path: string) => Promise<void>): Promise<() => void>;
}

export interface SaveReadingPositionInput {
  bookId: string;
  chapterId: string;
  sentenceIndex: number;
}

export interface LibraryBookmarkDto {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  sentenceId: string;
  sentenceIndex: number;
  text: string;
  note: string | null;
  createdAt: string;
}

export interface SaveBookmarkInput {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  sentenceId: string;
  sentenceIndex: number;
  text: string;
  note: string | null;
}

export interface SearchLibraryInput {
  query: string;
  bookId?: string;
  limit?: number;
}

export interface LibrarySearchResultDto {
  id: string;
  kind: "book" | "sentence";
  bookId: string;
  bookTitle: string;
  author: string;
  chapterId: string | null;
  chapterTitle: string | null;
  sentenceId: string | null;
  sentenceIndex: number | null;
  excerpt: string;
}

export interface BookExportDataDto {
  exportedAt: string;
  book: ReaderDocumentDto["book"];
  chapters: ReaderDocumentDto["chapters"];
  position: ReaderDocumentDto["position"];
  bookmarks: LibraryBookmarkDto[];
}

export type BookDropEvent =
  | { type: "enter"; paths: string[] }
  | { type: "over" }
  | { type: "drop"; paths: string[] }
  | { type: "leave" };
