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

    try {
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

      if (
        error instanceof Error &&
        (error.message.includes("Drive 連携が切れています") ||
          error.message.includes("invalid authentication credentials"))
      ) {
        onAuthExpired("Google Drive 連携が切れています。画像整理で Drive連携更新 を押してください。");
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
      if (
        error instanceof Error &&
        (error.message.includes("Drive 連携が切れています") ||
          error.message.includes("invalid authentication credentials"))
      ) {
        onAuthExpired("Google Drive 連携が切れています。画像整理で Drive連携更新 を押してください。");
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
      if (
        error instanceof Error &&
        (error.message.includes("Drive 連携が切れています") ||
          error.message.includes("invalid authentication credentials"))
      ) {
        onAuthExpired("Google Drive 連携が切れています。画像整理で Drive連携更新 を押してください。");
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
      await onPersistEntries(nextEntries);
    }

    if (!targetImage.driveFileId) {
      showMessage(`「${targetEntry.title}」から画像を削除しました。`);
      return;
    }

    if (!hasDriveSession) {
      showMessage("記録からは削除しましたが、Drive 側を消すには Drive 連携を更新してください。");
      return;
    }

    try {
      await deleteDriveImage(targetImage.driveFileId);
      showMessage(`「${targetEntry.title}」の画像を記録と Google Drive から削除しました。`);
    } catch (error) {
      showMessage(
        error instanceof Error
          ? `記録からは削除しましたが、Drive 側の削除に失敗しました: ${error.message}`
          : "記録からは削除しましたが、Drive 側の削除に失敗しました。",
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
