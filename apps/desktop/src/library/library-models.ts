export interface LibraryBookSummary {
  id: string;
  title: string;
  author: string;
  coverImageSrc?: string | null;
  importedAt: string;
  chapterCount: number;
  sentenceCount: number;
  sourceStatus?: { status: "ready" } | { status: "needs-attention"; message: string };
  lastChapterId: string | null;
  lastReadAt?: string | null;
  completedSentenceCount: number;
}

export interface ReaderDocumentDto {
  book: {
    id: string;
    title: string;
    author: string;
    language?: string | null;
    coverImageSrc?: string | null;
  };
  activeChapterId: string | null;
  chapters: ReaderChapterDto[];
  position: ReadingPositionDto | null;
}

export interface ReaderChapterDto {
  id: string;
  title: string;
  index: number;
  sentenceCount: number;
  sentences: ReaderSentenceDto[];
  paragraphs?: ReaderParagraphDto[];
  references?: ReaderReferenceDto[];
  links?: ReaderLinkDto[];
  presentations?: ReaderParagraphPresentationDto[];
}

export interface ReaderReferenceDto {
  id: string;
  sentenceId: string;
  sentenceIndex: number;
  offset: number;
  marker: string;
  kind: "footnote" | "endnote" | "citation" | "note";
  content: string;
}

export interface ReaderLinkDto {
  id: string;
  sentenceId: string;
  sentenceIndex: number;
  offset: number;
  length: number;
  href: string | null;
  targetChapterId: string | null;
  targetSentenceIndex: number | null;
}

export interface ReaderParagraphDto {
  id: string;
  index: number;
  startSentenceIndex: number;
  sentenceCount: number;
}

export interface ReaderParagraphPresentationDto {
  index: number;
  kind: "body" | "heading" | "quote" | "navigation" | "ordered" | "unordered";
  indentLevel: number;
  marker: string | null;
  emphasized: boolean;
}

export interface ReaderSentenceDto {
  id: string;
  index: number;
  text: string;
}

export interface ReadingPositionDto {
  bookId: string;
  chapterId: string;
  sentenceIndex: number;
  updatedAt: string;
}
