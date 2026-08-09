import type { ReaderSearchResult } from "@sonelle/reader";
import type { LibraryBookmarkDto, LibrarySearchResultDto } from "../library/library-contracts";
import type { ReaderLibraryApplication } from "./reader-library-application";
import type { ReaderOpeningWorkflow } from "./reader-opening-workflow";
import type { ReaderPlaybackApplication } from "./reader-playback-application";
import { buildFixtureReaderView, type ReaderSentenceView, type ReaderView } from "./reader-view";

interface ReaderNavigationDependencies {
  library: ReaderLibraryApplication;
  opening: ReaderOpeningWorkflow;
  playback: Omit<ReaderPlaybackApplication, "activate">;
}

interface ReaderNavigationOptions {
  currentReader(): ReaderView;
  bookmarks(): LibraryBookmarkDto[];
  activeBookmark(): LibraryBookmarkDto | null;
  activeSentence(): ReaderSentenceView | null;
  openBookmarkInspector(): void;
}

export interface ReaderNavigationApplication {
  openSample(): void;
  openChapter(chapterId: string): Promise<void>;
  openLocation(chapterId: string, sentenceIndex: number): Promise<void>;
  toggleActiveBookmark(): Promise<void>;
  deleteBookmark(bookmarkId: string): Promise<void>;
  openBookmark(bookmark: LibraryBookmarkDto): Promise<void>;
  openLibrarySearchResult(result: LibrarySearchResultDto): Promise<void>;
  openReaderSearchResult(result: ReaderSearchResult<ReaderSentenceView>): void;
}

export function createReaderNavigationApplication(
  dependencies: ReaderNavigationDependencies,
  options: ReaderNavigationOptions
): ReaderNavigationApplication {
  const openSample = () => {
    void dependencies.opening.open(buildFixtureReaderView());
  };

  const deleteBookmark = async (bookmarkId: string) => {
    const bookId =
      options.bookmarks().find((bookmark) => bookmark.id === bookmarkId)?.bookId ??
      options.currentReader().book.id;
    await dependencies.library.deleteBookmark(bookmarkId, bookId);
  };

  const openLocation = async (chapterId: string, sentenceIndex: number) => {
    const reader = options.currentReader();
    if (chapterId === reader.chapter.id) {
      await dependencies.opening.open(reader, sentenceIndex, dependencies.playback.jumpStatus());
      return;
    }
    if (reader.source === "sample") {
      const next = buildFixtureReaderView({ chapterId, sentenceIndex });
      await dependencies.opening.open(next, sentenceIndex, dependencies.playback.jumpStatus());
      return;
    }
    await dependencies.library.open(reader.book.id, {
      chapterId,
      sentenceIndex,
      playbackStatus: dependencies.playback.jumpStatus()
    });
  };

  return {
    openSample,
    async openChapter(chapterId) {
      const reader = options.currentReader();
      if (chapterId === reader.chapter.id) return;
      await openLocation(chapterId, 0);
    },
    openLocation,
    async toggleActiveBookmark() {
      const existing = options.activeBookmark();
      if (existing != null) {
        await deleteBookmark(existing.id);
        return;
      }
      const reader = options.currentReader();
      const sentence = options.activeSentence();
      if (sentence == null) return;
      await dependencies.library.saveBookmark({
        bookId: reader.book.id,
        bookTitle: reader.book.title,
        chapterId: reader.chapter.id,
        chapterTitle: reader.chapter.title,
        sentenceId: sentence.id,
        sentenceIndex: sentence.index,
        text: sentence.text,
        note: null
      });
    },
    deleteBookmark,
    async openBookmark(bookmark) {
      const reader = options.currentReader();
      if (bookmark.bookId === reader.book.id && bookmark.chapterId === reader.chapter.id) {
        dependencies.playback.select(bookmark.sentenceIndex);
        options.openBookmarkInspector();
        return;
      }
      const sample = buildFixtureReaderView();
      if (bookmark.bookId === sample.book.id) {
        await dependencies.opening.open(
          buildFixtureReaderView({
            chapterId: bookmark.chapterId,
            sentenceIndex: bookmark.sentenceIndex
          }),
          bookmark.sentenceIndex,
          dependencies.playback.jumpStatus()
        );
        options.openBookmarkInspector();
        return;
      }
      await dependencies.library.open(bookmark.bookId, {
        chapterId: bookmark.chapterId,
        sentenceIndex: bookmark.sentenceIndex,
        playbackStatus:
          bookmark.bookId === reader.book.id ? dependencies.playback.jumpStatus() : "idle"
      });
      options.openBookmarkInspector();
    },
    async openLibrarySearchResult(result) {
      const reader = options.currentReader();
      if (result.kind === "sentence" && result.chapterId != null && result.sentenceIndex != null) {
        if (result.bookId === reader.book.id && result.chapterId === reader.chapter.id) {
          await dependencies.opening.open(
            reader,
            result.sentenceIndex,
            dependencies.playback.jumpStatus()
          );
          return;
        }
        await dependencies.library.open(result.bookId, {
          chapterId: result.chapterId,
          sentenceIndex: result.sentenceIndex,
          playbackStatus:
            result.bookId === reader.book.id ? dependencies.playback.jumpStatus() : "idle"
        });
        return;
      }
      await dependencies.library.open(result.bookId);
    },
    openReaderSearchResult(result) {
      dependencies.playback.select(result.sentence.index);
    }
  };
}
