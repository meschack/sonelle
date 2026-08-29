import {
  planNarrationStorageRemoval,
  preflightVoicePackInstallation,
  type NarrationStorageActivity,
  type NarrationStorageRemovalRequest,
  type NarrationStorageRemovalTarget,
  type NarrationStorageSnapshot
} from "@sonelle/audio/narration";
import { createDomainEvent, type DomainEventDispatcher } from "@sonelle/domain";
import type { NarrationStorageMaintenanceRepository } from "../audio/narration-storage-maintenance-repository";

const INSTALLATION_FREE_SPACE_RESERVE_BYTES = 32 * 1024 * 1024;

export interface NarrationVoicePackInstallationDescriptor {
  packId: string;
  downloadSizeBytes: number;
  stagedBytes?: number;
}

export interface NarrationStorageRemovalPrompt {
  target: NarrationStorageRemovalTarget;
  title: string;
  body: string;
  confirmAction: string;
  cancelAction: string;
}

export interface RemovableNarrationVoicePack {
  packId: string;
  revision: string;
  sizeBytes: number;
}

interface ReaderNarrationStorageDependencies {
  repository: NarrationStorageMaintenanceRepository;
  eventDispatcher: DomainEventDispatcher;
  friendlyError(error: unknown): string;
}

interface ReaderNarrationStorageOptions {
  currentActivity(): NarrationStorageActivity;
  projectPrompt(prompt: NarrationStorageRemovalPrompt | null): void;
  projectNotice(notice: string | null): void;
  projectBusy(busy: boolean): void;
  projectSnapshot(snapshot: NarrationStorageSnapshot): void;
}

export interface ReaderNarrationStorageApplication {
  start(): () => void;
  refresh(): Promise<void>;
  requestVoicePackInstallation(
    descriptor: NarrationVoicePackInstallationDescriptor,
    startInstallation: () => void
  ): Promise<boolean>;
  requestPreparedAudioRemoval(): Promise<void>;
  requestVoicePackRemoval(packId: string, revision: string): Promise<void>;
  confirmRemoval(): Promise<void>;
  cancelRemoval(): void;
}

export function createReaderNarrationStorageApplication(
  dependencies: ReaderNarrationStorageDependencies,
  options: ReaderNarrationStorageOptions
): ReaderNarrationStorageApplication {
  let prompt: NarrationStorageRemovalPrompt | null = null;
  let busy = false;

  const setBusy = (next: boolean) => {
    busy = next;
    options.projectBusy(next);
  };
  const setPrompt = (next: NarrationStorageRemovalPrompt | null) => {
    prompt = next;
    options.projectPrompt(next);
  };

  const inspect = async (): Promise<NarrationStorageSnapshot> => {
    const snapshot = await dependencies.repository.inspect();
    options.projectSnapshot(snapshot);
    return snapshot;
  };

  const plan = async (
    request: NarrationStorageRemovalRequest
  ): Promise<ReturnType<typeof planNarrationStorageRemoval>> =>
    planNarrationStorageRemoval(await inspect(), options.currentActivity(), request);

  const refresh = () => inspect().then(() => undefined);

  const requestPreparedAudioRemoval = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const bookId = options.currentActivity().activeBookId;
      if (bookId == null) return;
      const planResult = await plan({
        kind: "prepared-audio",
        bookId,
        confirmed: false
      });
      if (planResult.status === "needs-confirmation") {
        setPrompt({
          target: { kind: "prepared-audio", bookId },
          title: "Remove prepared audio?",
          body: "This removes listening files for this book. The book, bookmarks, and reading position stay safe.",
          confirmAction: "Remove audio",
          cancelAction: "Keep audio"
        });
        return;
      }
      if (planResult.status === "needs-attention") {
        options.projectNotice(planResult.message);
      }
    } catch (error) {
      options.projectNotice(dependencies.friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const requestVoicePackRemoval = async (packId: string, revision: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const planResult = await plan({ kind: "voice-pack", packId, revision, confirmed: false });
      if (planResult.status === "needs-confirmation") {
        setPrompt({
          target: { kind: "voice-pack", packId, revision },
          title: "Remove offline voice?",
          body: "You can download this voice again later. Your books and reading progress stay safe.",
          confirmAction: "Remove voice",
          cancelAction: "Keep voice"
        });
        return;
      }
      if (planResult.status === "needs-attention") {
        options.projectNotice(planResult.message);
      }
    } catch (error) {
      options.projectNotice(dependencies.friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmPreparedAudioRemoval = async (bookId: string) => {
    try {
      await dependencies.eventDispatcher.dispatch(
        createDomainEvent("PreparedNarrationClearingRequested", { bookId })
      );
    } catch (error) {
      options.projectNotice(dependencies.friendlyError(error));
    }
    await refresh();
    setBusy(false);
  };

  const confirmVoicePackRemoval = async (packId: string, revision: string) => {
    try {
      const snapshot = await dependencies.repository.remove({
        kind: "voice-pack",
        packId,
        revision
      });
      options.projectSnapshot(snapshot);
      options.projectNotice("Offline voice removed.");
    } catch (error) {
      options.projectNotice(dependencies.friendlyError(error));
    }
    setBusy(false);
  };

  const confirmRemoval = async () => {
    if (busy || prompt == null) return;
    const pending = prompt;
    setBusy(true);
    setPrompt(null);

    const request: NarrationStorageRemovalRequest =
      pending.target.kind === "prepared-audio"
        ? { kind: "prepared-audio", bookId: pending.target.bookId, confirmed: true }
        : { ...pending.target, confirmed: true };

    let planResult: Awaited<ReturnType<typeof plan>>;
    try {
      planResult = await plan(request);
    } catch (error) {
      options.projectNotice(dependencies.friendlyError(error));
      setBusy(false);
      return;
    }

    if (planResult.status !== "approved") {
      if (planResult.status === "needs-attention") {
        options.projectNotice(planResult.message);
      }
      setBusy(false);
      return;
    }

    if (planResult.target.kind === "prepared-audio") {
      await confirmPreparedAudioRemoval(planResult.target.bookId);
      return;
    }
    await confirmVoicePackRemoval(planResult.target.packId, planResult.target.revision);
  };

  return {
    start() {
      const subscriptions = [
        dependencies.eventDispatcher.subscribe("ReaderOpened", () => {
          if (prompt?.target.kind === "prepared-audio") setPrompt(null);
        })
      ];
      return () => subscriptions.forEach((unsubscribe) => unsubscribe());
    },
    refresh,
    async requestVoicePackInstallation(descriptor, startInstallation) {
      const snapshot = await inspect();
      const preflight = preflightVoicePackInstallation(snapshot, {
        packId: descriptor.packId,
        downloadSizeBytes: descriptor.downloadSizeBytes,
        stagedBytes: descriptor.stagedBytes,
        minimumFreeBytesAfterInstall: INSTALLATION_FREE_SPACE_RESERVE_BYTES
      });
      if (preflight.status === "needs-attention") {
        options.projectNotice(preflight.message);
        return false;
      }
      startInstallation();
      return true;
    },
    requestPreparedAudioRemoval,
    requestVoicePackRemoval,
    confirmRemoval,
    cancelRemoval() {
      setPrompt(null);
    }
  };
}

export function removableNarrationVoicePacks(
  snapshot: NarrationStorageSnapshot | null,
  activity: NarrationStorageActivity
): readonly RemovableNarrationVoicePack[] {
  if (snapshot == null) return [];
  return snapshot.voicePacks
    .filter((pack) => pack.verified && pack.packId !== activity.activeVoicePackId)
    .map((pack) => ({ packId: pack.packId, revision: pack.revision, sizeBytes: pack.sizeBytes }));
}
