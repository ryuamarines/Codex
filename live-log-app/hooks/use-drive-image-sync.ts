"use client";

import { useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import type { LiveEntry } from "@/lib/types";
import { deleteDriveImage, uploadLocalImageToDrive } from "@/lib/google-drive-image-service";
import { isCloudConflictError } from "@/lib/live-cloud-service";

type UseDriveImageSyncParams = {
  entries: LiveEntry[];
  setEntries: React.Dispatch<React.SetStateAction<LiveEntry[]>>;
  firebaseUser: User | null;
  localEntriesReady: boolean;
  hasDriveSession: boolean;
  driveFolderId: string;
  onAuthExpired(message: string): void;
  showMessage(message: string, durationMs?: number): void;
  onPersistEntries?(entries: LiveEntry[]): Promise<void>;
};

type PendingDriveDeletion = {
  fileId: string;
  entryTitle: string;
  queuedAt: string;
};

const PENDING_DRIVE_DELETIONS_KEY = "live-log.pending-drive-deletions";

function isDriveSessionExpiredError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("Drive 連携が切れています") ||
      error.message.includes("invalid authentication credentials"))
  );
}

function loadPendingDriveDeletions(storage: Storage): PendingDriveDeletion[] {
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_DRIVE_DELETIONS_KEY) ?? "[]") as PendingDriveDeletion[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => typeof item.fileId === "string" && item.fileId.trim());
  } catch {
    storage.removeItem(PENDING_DRIVE_DELETIONS_KEY);
    return [];
  }
}

function savePendingDriveDeletions(storage: Storage, items: PendingDriveDeletion[]) {
  const uniqueItems = Array.from(new Map(items.map((item) => [item.fileId, item])).values());
  storage.setItem(PENDING_DRIVE_DELETIONS_KEY, JSON.stringify(uniqueItems.slice(-50)));
}

function queueDriveDeletion(fileId: string, entryTitle: string) {
  if (typeof window === "undefined") {
    return;
  }

  const storage = window.localStorage;
  const items = loadPendingDriveDeletions(storage);

  if (items.some((item) => item.fileId === fileId)) {
    return;
  }

  savePendingDriveDeletions(storage, [
    ...items,
    {
      fileId,
      entryTitle,
      queuedAt: new Date().toISOString()
    }
  ]);
}

function updateImageInEntries(
  entries: LiveEntry[],
  entryId: string,
  imageId: string,
  updater: (image: LiveEntry["images"][number]) => LiveEntry["images"][number]
) {
  return entries.map((entry) =>
    entry.id !== entryId
      ? entry
      : {
          ...entry,
          images: entry.images.map((image) => (image.id === imageId ? updater(image) : image))
        }
  );
}

function replaceImageSyncState(
  entries: LiveEntry[],
  entryId: string,
  imageId: string,
  updater: (image: LiveEntry["images"][number]) => LiveEntry["images"][number]
) {
  const nextEntries = updateImageInEntries(entries, entryId, imageId, updater);
  return nextEntries;
}

export function useDriveImageSync({
  entries,
  setEntries,
  firebaseUser,
  localEntriesReady,
  hasDriveSession,
  driveFolderId,
  onAuthExpired,
  showMessage,
  onPersistEntries
}: UseDriveImageSyncParams) {
  const entriesRef = useRef(entries);
  const pendingImageUploadRef = useRef(false);
  const uploadingImageKeyRef = useRef("");

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    if (!hasDriveSession || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    async function flushPendingDriveDeletions() {
      const storage = window.localStorage;
      const queuedItems = loadPendingDriveDeletions(storage);

      if (queuedItems.length === 0) {
        return;
      }

      const remainingItems: PendingDriveDeletion[] = [];
      let deletedCount = 0;

      for (const item of queuedItems) {
        try {
          await deleteDriveImage(item.fileId);
          deletedCount += 1;
        } catch {
          remainingItems.push(item);
        }
      }

      if (cancelled) {
        return;
      }

      savePendingDriveDeletions(storage, remainingItems);

      if (deletedCount > 0) {
        showMessage(`保留中だった Drive 画像 ${deletedCount} 件を削除しました。`);
      }
    }

    void flushPendingDriveDeletions();

    return () => {
      cancelled = true;
    };
  }, [hasDriveSession, showMessage]);

  async function syncEntryImageToDrive(
    user: Pick<User, "uid">,
    entryId: string,
    imageId: string
  ) {
    const uploadKey = `${entryId}:${imageId}`;

    if (uploadingImageKeyRef.current === uploadKey) {
      return;
    }

    const currentEntries = entriesRef.current;
    const targetEntry = currentEntries.find((entry) => entry.id === entryId);
    const targetImage = targetEntry?.images.find((image) => image.id === imageId);

    if (!targetEntry || !targetImage) {
      throw new Error("同期対象の画像が見つかりませんでした。");
    }

    if (!hasDriveSession) {
      throw new Error("Google Drive 連携がありません。Drive連携を更新してください。");
    }

    if (!driveFolderId) {
      throw new Error("Google Drive の保存先フォルダが未設定です。Drive保存先を設定してください。");
    }

    if (!targetImage.src.startsWith("data:")) {
      throw new Error("この画像は再同期できません。元画像データが見つかりませんでした。");
    }

    try {
      pendingImageUploadRef.current = true;
      uploadingImageKeyRef.current = uploadKey;
      const syncingEntries = replaceImageSyncState(currentEntries, entryId, imageId, (image) => ({
        ...image,
        storageStatus: "syncing",
        uploadError: undefined
      }));
      entriesRef.current = syncingEntries;
      setEntries(syncingEntries);
      if (onPersistEntries) {
        await onPersistEntries(syncingEntries);
      }

      const uploadedImage = await uploadLocalImageToDrive({
        folderId: driveFolderId,
        image: {
          ...targetImage,
          storageStatus: "syncing",
          uploadError: undefined
        }
      });

      const nextEntries = replaceImageSyncState(entriesRef.current, entryId, imageId, () => uploadedImage);
      entriesRef.current = nextEntries;
      setEntries(nextEntries);

      if (onPersistEntries) {
        await onPersistEntries(nextEntries);
      }
    } catch (error) {
      if (isCloudConflictError(error)) {
        throw error;
      }

      if (isDriveSessionExpiredError(error)) {
        onAuthExpired("Google Drive 連携が切れています。ログインと同期で Drive連携更新 を押してください。");
        throw error;
      }

      const erroredEntries = replaceImageSyncState(entriesRef.current, entryId, imageId, (image) => ({
        ...image,
        storageStatus: "error",
        uploadError:
          error instanceof Error ? error.message : "Google Drive への画像保存に失敗しました。"
      }));
      entriesRef.current = erroredEntries;
      setEntries(erroredEntries);
      if (onPersistEntries) {
        await onPersistEntries(erroredEntries);
      }
      throw error;
    } finally {
      pendingImageUploadRef.current = false;
      uploadingImageKeyRef.current = "";
    }
  }

  useEffect(() => {
    if (!firebaseUser || !localEntriesReady || pendingImageUploadRef.current) {
      return;
    }

    const localTarget = entries.find((entry) =>
      entry.images.some((image) => image.storageStatus === "local_pending" && image.src.startsWith("data:"))
    );

    if (!localTarget || !hasDriveSession || !driveFolderId) {
      return;
    }

    const localImage = localTarget.images.find(
      (image) => image.storageStatus === "local_pending" && image.src.startsWith("data:")
    );

    if (!localImage) {
      return;
    }

    void syncEntryImageToDrive(firebaseUser, localTarget.id, localImage.id).catch((error) => {
      if (isDriveSessionExpiredError(error)) {
        onAuthExpired("Google Drive 連携が切れています。ログインと同期で Drive連携更新 を押してください。");
        return;
      }

      showMessage(
        error instanceof Error ? error.message : "Google Drive への画像保存に失敗しました。",
        7000
      );
    });
  }, [
    entries,
    firebaseUser,
    localEntriesReady,
    hasDriveSession,
    driveFolderId,
    onAuthExpired,
    showMessage
  ]);

  async function handleRetryImageSync(entryId: string, imageId: string) {
    if (!firebaseUser) {
      showMessage("画像の Drive 再同期には Google ログインが必要です。");
      return;
    }

    if (pendingImageUploadRef.current) {
      showMessage("別の画像を同期中です。少し待ってから再試行してください。");
      return;
    }

    try {
      await syncEntryImageToDrive(firebaseUser, entryId, imageId);
    } catch (error) {
      if (isDriveSessionExpiredError(error)) {
        onAuthExpired("Google Drive 連携が切れています。ログインと同期で Drive連携更新 を押してください。");
        return;
      }

      showMessage(error instanceof Error ? error.message : "画像の Drive 再同期に失敗しました。", 7000);
    }
  }

  async function handleRetryEntryImageSync(entryId: string) {
    const targetEntry = entries.find((entry) => entry.id === entryId);

    if (!targetEntry) {
      showMessage("同期対象の記録が見つかりませんでした。");
      return;
    }

    const retryTargets = targetEntry.images.filter(
      (image) => image.storageStatus === "local_pending" || image.storageStatus === "error"
    );

    if (retryTargets.length === 0) {
      showMessage("この記録に再同期が必要な画像はありません。");
      return;
    }

    for (const image of retryTargets) {
      await handleRetryImageSync(entryId, image.id);
    }

    showMessage(`「${targetEntry.title}」の未同期画像 ${retryTargets.length} 件を再同期しました。`);
  }

  async function handleDeleteImage(entryId: string, imageId: string) {
    const currentEntries = entriesRef.current;
    const targetEntry = currentEntries.find((entry) => entry.id === entryId);
    const targetImage = targetEntry?.images.find((image) => image.id === imageId);

    if (!targetEntry || !targetImage) {
      showMessage("削除対象の画像が見つかりませんでした。");
      return;
    }

    const nextEntries = currentEntries.map((entry) =>
      entry.id !== entryId
        ? entry
        : {
            ...entry,
            images: entry.images.filter((image) => image.id !== imageId)
          }
    );
    entriesRef.current = nextEntries;
    setEntries(nextEntries);

    if (onPersistEntries) {
      try {
        await onPersistEntries(nextEntries);
      } catch {
        showMessage("画像は記録から削除しました。クラウド保存は自動で再確認します。", 7000);
      }
    }

    if (!targetImage.driveFileId) {
      showMessage(`「${targetEntry.title}」から画像を削除しました。`);
      return;
    }

    if (!hasDriveSession) {
      queueDriveDeletion(targetImage.driveFileId, targetEntry.title);
      showMessage("記録からは削除しましたが、Drive 側を消すには Drive 連携を更新してください。");
      return;
    }

    try {
      await deleteDriveImage(targetImage.driveFileId);
      showMessage(`「${targetEntry.title}」の画像を記録と Google Drive から削除しました。`);
    } catch (error) {
      queueDriveDeletion(targetImage.driveFileId, targetEntry.title);
      showMessage(
        error instanceof Error
          ? `記録からは削除しました。Drive 側の削除は次回連携時に再試行します: ${error.message}`
          : "記録からは削除しました。Drive 側の削除は次回連携時に再試行します。",
        7000
      );
    }
  }

  return {
    pendingImageUploadRef,
    handleRetryImageSync,
    handleRetryEntryImageSync,
    handleDeleteImage
  };
}
