"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { LocalArchiveImageService, type ArchiveImageService } from "@/lib/archive-image-service";
import {
  createCloudEntryChanges,
  hasCloudEntryChanges,
  rebaseCloudEntryChanges
} from "@/lib/live-cloud-changes";
import {
  hashEntries,
  hasUnsyncedLocalChanges,
  readCloudSyncState,
  writeCloudSyncState
} from "@/lib/cloud-sync";
import { countUnsyncedImages } from "@/lib/live-image-state";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  observeFirebaseUser,
  signInWithGoogle,
  signOutFromFirebase
} from "@/lib/firebase/auth";
import {
  CloudConflictError,
  isCloudConflictError,
  loadCloudEntries,
  saveCloudEntryChanges,
  saveCloudSettings
} from "@/lib/live-cloud-service";
import type { LiveEntry } from "@/lib/types";
import { useDriveImageSync } from "@/hooks/use-drive-image-sync";
import { useDriveSession } from "@/hooks/use-drive-session";

type UseLiveCloudSyncParams = {
  entries: LiveEntry[];
  setEntries: React.Dispatch<React.SetStateAction<LiveEntry[]>>;
  localEntriesReady: boolean;
  localEntriesUserId: string | null;
};

const EMPTY_ENTRIES: LiveEntry[] = [];

export function useLiveCloudSync({
  entries,
  setEntries,
  localEntriesReady,
  localEntriesUserId
}: UseLiveCloudSyncParams) {
  const [driveFolderSaveRetryNonce, setDriveFolderSaveRetryNonce] = useState(0);
  const [cloudHydrateRetryNonce, setCloudHydrateRetryNonce] = useState(0);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(!isFirebaseConfigured());
  const [authMessage, setAuthMessage] = useState(
    isFirebaseConfigured() ? "" : "Firebase の環境変数を入れるとクラウド同期を有効にできます。"
  );
  const [imageService] = useState<ArchiveImageService>(new LocalArchiveImageService());
  const [syncStatus, setSyncStatus] = useState("ローカル保存");
  const [lastSyncedAtLabel, setLastSyncedAtLabel] = useState("");
  const [cloudDriveFolderId, setCloudDriveFolderId] = useState("");
  const cloudRevisionRef = useRef(0);
  const suppressCloudSyncEffectRef = useRef(false);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const lastSyncedHashRef = useRef<string>("");
  const autoHydratedUserIdRef = useRef<string>("");
  const cloudHydrateRetryTimeoutRef = useRef<number | null>(null);
  const cloudHydrateRetryCountRef = useRef(0);
  const driveFolderSaveRetryTimeoutRef = useRef<number | null>(null);
  const driveFolderSaveRetryCountRef = useRef(0);
  const authMessageTimeoutRef = useRef<number | null>(null);
  const imageSyncWarningKeyRef = useRef("");
  const lastSavedDriveFolderIdRef = useRef("");
  const lastSyncedEntriesRef = useRef<LiveEntry[]>([]);
  const currentEntriesRef = useRef(entries);
  const cloudSnapshotReadyRef = useRef(false);
  const autoSaveBlockedRef = useRef(false);
  const cloudWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const localEntriesMatchCurrentUser =
    localEntriesUserId !== null && localEntriesUserId === (firebaseUser?.uid ?? "");

  currentEntriesRef.current = entries;

  const confirmCloudSync = useCallback(
    (cloudEntries: LiveEntry[]) => {
      if (typeof window === "undefined") {
        return true;
      }

      const currentHash = hashEntries(entries);
      const cloudHash = hashEntries(cloudEntries);

      if (currentHash === cloudHash) {
        return true;
      }

      const title = "クラウドの内容を同期します。";
      const warning =
        "この端末の表示中データとクラウドの内容が違います。\n\n" +
        "続けると画面の内容をクラウド側の内容に合わせます。\n" +
        "最新のデータか確認してから進めてください。";

      return window.confirm(`${title}\n\n${warning}`);
    },
    [entries]
  );

  const showAuthMessage = useCallback((message: string, durationMs = 5000) => {
    setAuthMessage(message);

    if (typeof window === "undefined") {
      return;
    }

    if (authMessageTimeoutRef.current) {
      window.clearTimeout(authMessageTimeoutRef.current);
    }

    authMessageTimeoutRef.current = window.setTimeout(() => {
      setAuthMessage("");
      authMessageTimeoutRef.current = null;
    }, durationMs);
  }, []);

  function updateLastSyncedAtLabel(rawValue: string) {
    if (!rawValue) {
      setLastSyncedAtLabel("");
      return;
    }

    const parsed = new Date(rawValue);

    if (Number.isNaN(parsed.getTime())) {
      setLastSyncedAtLabel("");
      return;
    }

    setLastSyncedAtLabel(
      new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(parsed)
    );
  }

  const persistEntriesImmediately = useCallback(
    async (nextEntries: LiveEntry[]) => {
      if (!firebaseUser || !localEntriesMatchCurrentUser || typeof window === "undefined") {
        return;
      }

      if (!cloudSnapshotReadyRef.current) {
        const cloudArchive = await loadCloudEntries(firebaseUser);
        cloudRevisionRef.current = cloudArchive.revision;
        lastSyncedEntriesRef.current = cloudArchive.entries;
        lastSavedDriveFolderIdRef.current = cloudArchive.settings.driveFolderId ?? "";
        cloudSnapshotReadyRef.current = true;
      }

      const baseEntries = lastSyncedEntriesRef.current;
      let syncedEntries = nextEntries;
      let changes = createCloudEntryChanges(baseEntries, nextEntries);
      let expectedRevision = cloudRevisionRef.current;
      let settingsChanged = cloudDriveFolderId !== lastSavedDriveFolderIdRef.current;

      try {
        if (hasCloudEntryChanges(changes) || settingsChanged) {
          const saveResult = await saveCloudEntryChanges(
            firebaseUser,
            changes,
            { driveFolderId: cloudDriveFolderId },
            expectedRevision
          );
          expectedRevision = saveResult.revision;
        }
      } catch (error) {
        if (!isCloudConflictError(error)) {
          throw error;
        }

        const latestCloudArchive = await loadCloudEntries(firebaseUser);
        const rebased = rebaseCloudEntryChanges(
          baseEntries,
          nextEntries,
          latestCloudArchive.entries
        );

        if (rebased.conflictingEntryIds.length > 0) {
          autoSaveBlockedRef.current = true;
          throw new CloudConflictError(
            `同じ記録が別の端末でも更新されています。競合した ${rebased.conflictingEntryIds.length} 件を確認してから同期してください。`
          );
        }

        changes = rebased.changes;
        syncedEntries = rebased.entries;
        expectedRevision = latestCloudArchive.revision;
        settingsChanged =
          cloudDriveFolderId !== (latestCloudArchive.settings.driveFolderId ?? "");

        if (hasCloudEntryChanges(changes) || settingsChanged) {
          const saveResult = await saveCloudEntryChanges(
            firebaseUser,
            changes,
            { driveFolderId: cloudDriveFolderId },
            expectedRevision
          );
          expectedRevision = saveResult.revision;
        }
      }

      cloudRevisionRef.current = expectedRevision;
      lastSyncedEntriesRef.current = syncedEntries;
      lastSavedDriveFolderIdRef.current = cloudDriveFolderId;
      autoSaveBlockedRef.current = false;
      lastSyncedHashRef.current = writeCloudSyncState(
        window.localStorage,
        firebaseUser.uid,
        syncedEntries
      );
      updateLastSyncedAtLabel(readCloudSyncState(window.localStorage).syncedAt);

      const currentEntries = currentEntriesRef.current;
      const uiRebase = rebaseCloudEntryChanges(nextEntries, currentEntries, syncedEntries);

      if (
        uiRebase.conflictingEntryIds.length === 0 &&
        hashEntries(uiRebase.entries) !== hashEntries(currentEntries)
      ) {
        currentEntriesRef.current = uiRebase.entries;
        setEntries(uiRebase.entries);
      }
    },
    [cloudDriveFolderId, firebaseUser, localEntriesMatchCurrentUser, setEntries]
  );

  const persistEntriesToCloud = useCallback(
    (nextEntries: LiveEntry[]) => {
      const queuedWrite = cloudWriteQueueRef.current.then(
        () => persistEntriesImmediately(nextEntries),
        () => persistEntriesImmediately(nextEntries)
      );
      cloudWriteQueueRef.current = queuedWrite.then(
        () => undefined,
        () => undefined
      );
      return queuedWrite;
    },
    [persistEntriesImmediately]
  );

  const handleSaveCurrentToCloud = useCallback(
    async (overrideEntries?: LiveEntry[]) => {
      if (!firebaseUser) {
        showAuthMessage("この端末の変更を保存するには Google ログインが必要です。");
        return false;
      }

      const nextEntries = overrideEntries ?? entries;

      try {
        autoSaveBlockedRef.current = false;
        await persistEntriesToCloud(nextEntries);
        setSyncStatus("クラウド同期済み");
        showAuthMessage("この端末の変更をクラウドへ保存しました。");
        return true;
      } catch (error) {
        if (isCloudConflictError(error)) {
          setSyncStatus("クラウド競合");
          showAuthMessage(error.message, 7000);
          return false;
        }

        setSyncStatus("クラウド保存失敗");
        showAuthMessage(
          error instanceof Error
            ? error.message
            : "この端末の変更をクラウドへ保存できませんでした。",
          7000
        );
        return false;
      }
    },
    [entries, firebaseUser, persistEntriesToCloud, showAuthMessage]
  );

  const persistEntryToCloud = useCallback(
    (nextEntries: LiveEntry[], _nextEntry: LiveEntry) => persistEntriesToCloud(nextEntries),
    [persistEntriesToCloud]
  );

  const deleteEntryFromCloud = useCallback(
    (nextEntries: LiveEntry[], _entryId: string) => persistEntriesToCloud(nextEntries),
    [persistEntriesToCloud]
  );

  const {
    driveFolderId,
    hasDriveSession,
    driveSessionSavedAtLabel,
    isDriveAccessStale,
    registerDriveAccessToken,
    clearDriveState,
    handleConfigureDriveFolder
  } = useDriveSession({
    showMessage: showAuthMessage,
    cloudDriveFolderId,
    onDriveFolderIdChange: setCloudDriveFolderId
  });

  const handleDriveAuthExpiry = useCallback((message: string) => {
    void clearDriveState();
    showAuthMessage(message, 7000);
  }, [clearDriveState, showAuthMessage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storage = window.localStorage;
    const syncState = readCloudSyncState(storage);
    lastSyncedHashRef.current = syncState.hash;
    updateLastSyncedAtLabel(syncState.syncedAt);

    return () => {
      if (cloudHydrateRetryTimeoutRef.current) {
        window.clearTimeout(cloudHydrateRetryTimeoutRef.current);
      }
      if (driveFolderSaveRetryTimeoutRef.current) {
        window.clearTimeout(driveFolderSaveRetryTimeoutRef.current);
      }
      if (authMessageTimeoutRef.current) {
        window.clearTimeout(authMessageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !firebaseUser ||
      !localEntriesReady ||
      !localEntriesMatchCurrentUser ||
      !cloudSnapshotReadyRef.current
    ) {
      return;
    }

    if (cloudDriveFolderId === lastSavedDriveFolderIdRef.current) {
      return;
    }

    const user = firebaseUser;
    const folderIdToSave = cloudDriveFolderId;
    const persistSettings = async () => {
      let saveResult;

      try {
        saveResult = await saveCloudSettings(
          user,
          { driveFolderId: folderIdToSave },
          cloudRevisionRef.current
        );
      } catch (error) {
        if (!isCloudConflictError(error)) {
          throw error;
        }

        const latestCloudArchive = await loadCloudEntries(user);
        cloudRevisionRef.current = latestCloudArchive.revision;

        if (hashEntries(latestCloudArchive.entries) !== hashEntries(lastSyncedEntriesRef.current)) {
          autoSaveBlockedRef.current = true;
          setSyncStatus("クラウド競合");
          throw new CloudConflictError(
            "別の端末で記録が更新されています。記録を同期してからDrive保存先を再設定してください。"
          );
        }

        saveResult = await saveCloudSettings(
          user,
          { driveFolderId: folderIdToSave },
          cloudRevisionRef.current
        );
      }

      lastSavedDriveFolderIdRef.current = folderIdToSave;
      cloudRevisionRef.current = saveResult.revision;
      driveFolderSaveRetryCountRef.current = 0;
    };
    const queuedWrite = cloudWriteQueueRef.current.then(persistSettings, persistSettings);
    cloudWriteQueueRef.current = queuedWrite.then(
      () => undefined,
      () => undefined
    );

    void queuedWrite
      .then((saveResult) => {
        return saveResult;
      })
      .catch((error) => {
        if (isCloudConflictError(error)) {
          showAuthMessage(error.message, 7000);
          return;
        }

        if (driveFolderSaveRetryCountRef.current >= 3) {
          showAuthMessage("Drive 保存先のクラウド保存に失敗しました。しばらくしてからもう一度試してください。", 7000);
          return;
        }

        driveFolderSaveRetryCountRef.current += 1;
        if (driveFolderSaveRetryTimeoutRef.current) {
          window.clearTimeout(driveFolderSaveRetryTimeoutRef.current);
        }
        driveFolderSaveRetryTimeoutRef.current = window.setTimeout(() => {
          driveFolderSaveRetryTimeoutRef.current = null;
          setDriveFolderSaveRetryNonce((current) => current + 1);
        }, 2000);
      });
  }, [
    cloudDriveFolderId,
    driveFolderSaveRetryNonce,
    firebaseUser,
    localEntriesMatchCurrentUser,
    localEntriesReady,
    showAuthMessage
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !localEntriesReady || !localEntriesMatchCurrentUser) {
      return;
    }

    if (!isFirebaseConfigured()) {
      setSyncStatus("ローカル保存");
      return;
    }

    if (!firebaseUser) {
      setSyncStatus("ローカル保存");
      return;
    }

    const hasPendingLocalChanges = hasUnsyncedLocalChanges(
      window.localStorage,
      firebaseUser.uid,
      entries,
      EMPTY_ENTRIES
    );

    const unsyncedImageCount = countUnsyncedImages(entries.flatMap((entry) => entry.images));

    if (unsyncedImageCount > 0) {
      if (!hasDriveSession) {
        setSyncStatus("Drive連携待ち");
        return;
      }

      if (!driveFolderId) {
        setSyncStatus("Drive保存先未設定");
        return;
      }

      setSyncStatus("画像同期待ち");
      return;
    }

    setSyncStatus(hasPendingLocalChanges ? "未同期の変更あり" : "クラウド同期済み");
  }, [
    driveFolderId,
    entries,
    firebaseUser,
    hasDriveSession,
    localEntriesMatchCurrentUser,
    localEntriesReady
  ]);

  useEffect(() => {
    if (!firebaseUser || !localEntriesReady || !localEntriesMatchCurrentUser) {
      return;
    }

    const unsyncedImageCount = countUnsyncedImages(entries.flatMap((entry) => entry.images));

    if (unsyncedImageCount === 0) {
      imageSyncWarningKeyRef.current = "";
      return;
    }

    if (!hasDriveSession) {
      const nextKey = `no-session:${unsyncedImageCount}`;
      if (imageSyncWarningKeyRef.current !== nextKey) {
        imageSyncWarningKeyRef.current = nextKey;
        showAuthMessage(
          `未同期画像が ${unsyncedImageCount} 件あります。新しいURLや別ブラウザでは Drive連携更新 が必要です。`,
          7000
        );
      }
      return;
    }

    if (!driveFolderId) {
      const nextKey = `no-folder:${unsyncedImageCount}`;
      if (imageSyncWarningKeyRef.current !== nextKey) {
        imageSyncWarningKeyRef.current = nextKey;
        showAuthMessage(
          `未同期画像が ${unsyncedImageCount} 件あります。Drive保存先を設定すると同期を再開できます。`,
          7000
        );
      }
      return;
    }

    imageSyncWarningKeyRef.current = "";
  }, [
    driveFolderId,
    entries,
    firebaseUser,
    hasDriveSession,
    localEntriesMatchCurrentUser,
    localEntriesReady,
    showAuthMessage
  ]);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      return;
    }

    return observeFirebaseUser((user) => {
      setFirebaseUser(user);
      setFirebaseAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!firebaseUser || !localEntriesReady || !localEntriesMatchCurrentUser) {
      autoHydratedUserIdRef.current = "";
      cloudHydrateRetryCountRef.current = 0;
      cloudRevisionRef.current = 0;
      lastSavedDriveFolderIdRef.current = "";
      lastSyncedEntriesRef.current = [];
      cloudSnapshotReadyRef.current = false;
      autoSaveBlockedRef.current = false;
      imageSyncWarningKeyRef.current = "";
      if (!firebaseUser) {
        setCloudDriveFolderId("");
      }
      return;
    }

    const user = firebaseUser;

    if (autoHydratedUserIdRef.current === user.uid) {
      return;
    }

    let cancelled = false;

    async function autoHydrateFromCloud() {
      try {
        const cloudArchive = await loadCloudEntries(user);
        const cloudEntries = cloudArchive.entries;

        if (cancelled) {
          return;
        }

        setCloudDriveFolderId(cloudArchive.settings.driveFolderId ?? "");
        lastSavedDriveFolderIdRef.current = cloudArchive.settings.driveFolderId ?? "";
        cloudRevisionRef.current = cloudArchive.revision;

        const hasPendingLocalChanges = hasUnsyncedLocalChanges(
          window.localStorage,
          user.uid,
          entries,
          EMPTY_ENTRIES
        );

        if (cloudEntries.length === 0) {
          const currentLooksLikeFallback = entries.length === 0;

          if (!hasPendingLocalChanges && currentLooksLikeFallback && cloudHydrateRetryCountRef.current < 3) {
            cloudHydrateRetryCountRef.current += 1;
            cloudHydrateRetryTimeoutRef.current = window.setTimeout(() => {
              autoHydratedUserIdRef.current = "";
              cloudHydrateRetryTimeoutRef.current = null;
              setCloudHydrateRetryNonce((current) => current + 1);
            }, 2500);
            return;
          }

          lastSyncedEntriesRef.current = [];
          cloudSnapshotReadyRef.current = true;
          autoSaveBlockedRef.current = currentLooksLikeFallback;
          autoHydratedUserIdRef.current = user.uid;
          cloudHydrateRetryCountRef.current = 0;
          return;
        }

        const cloudHash = hashEntries(cloudEntries);
        lastSyncedEntriesRef.current = cloudEntries;
        cloudSnapshotReadyRef.current = true;

        if (hasPendingLocalChanges) {
          autoSaveBlockedRef.current = true;
          autoHydratedUserIdRef.current = user.uid;
          showAuthMessage("この端末に未同期変更があります。クラウド同期前に内容を確認してください。", 7000);
          return;
        }

        const currentHash = hashEntries(entries);
        const sampleHash = hashEntries(EMPTY_ENTRIES);

        if (currentHash !== cloudHash && currentHash !== sampleHash) {
          autoSaveBlockedRef.current = true;
          autoHydratedUserIdRef.current = user.uid;
          showAuthMessage("この端末の内容とクラウドが異なります。同期タブで内容を確認してから更新してください。", 7000);
          return;
        }

        suppressCloudSyncEffectRef.current = true;
        autoSaveBlockedRef.current = false;
        currentEntriesRef.current = cloudEntries;
        setEntries(cloudEntries);
        lastSyncedHashRef.current = cloudHash;
        writeCloudSyncState(window.localStorage, user.uid, cloudEntries);
        updateLastSyncedAtLabel(readCloudSyncState(window.localStorage).syncedAt);
        autoHydratedUserIdRef.current = user.uid;
        cloudHydrateRetryCountRef.current = 0;
      } catch (error) {
        if (!cancelled) {
          autoHydratedUserIdRef.current = user.uid;
          cloudSnapshotReadyRef.current = false;
          setSyncStatus("クラウド読込失敗");
          showAuthMessage(
            error instanceof Error
              ? error.message
              : "クラウドの記録を読み込めませんでした。通信状態を確認して再試行してください。",
            7000
          );
        }
      }
    }

    void autoHydrateFromCloud();

    return () => {
      cancelled = true;
      if (cloudHydrateRetryTimeoutRef.current) {
        window.clearTimeout(cloudHydrateRetryTimeoutRef.current);
        cloudHydrateRetryTimeoutRef.current = null;
      }
    };
  }, [
    cloudHydrateRetryNonce,
    entries,
    firebaseUser,
    localEntriesMatchCurrentUser,
    localEntriesReady,
    setEntries,
    showAuthMessage
  ]);

  useEffect(() => {
    if (
      !firebaseUser ||
      !localEntriesReady ||
      !localEntriesMatchCurrentUser ||
      !cloudSnapshotReadyRef.current ||
      autoSaveBlockedRef.current
    ) {
      return;
    }

    if (suppressCloudSyncEffectRef.current) {
      suppressCloudSyncEffectRef.current = false;
      return;
    }

    const nextHash = hashEntries(entries);

    if (nextHash === lastSyncedHashRef.current) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(async () => {
      if (hashEntries(entries) === lastSyncedHashRef.current) {
        return;
      }

      try {
        await persistEntriesToCloud(entries);
        setSyncStatus("クラウド同期済み");
      } catch (error) {
        if (isCloudConflictError(error)) {
          setSyncStatus("クラウド競合");
          showAuthMessage(error.message, 7000);
          return;
        }

        setSyncStatus("クラウド保存失敗");
        if (error instanceof Error) {
          showAuthMessage(error.message, 7000);
        } else {
          showAuthMessage("クラウド保存に失敗しました。しばらくしてから再試行してください。", 7000);
        }
      }
    }, 1800);

    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    entries,
    firebaseUser,
    localEntriesMatchCurrentUser,
    localEntriesReady,
    persistEntriesToCloud,
    showAuthMessage
  ]);

  const {
    pendingImageUploadRef,
    handleRetryImageSync,
    handleRetryEntryImageSync,
    handleDeleteImage
  } = useDriveImageSync({
    entries,
    setEntries,
    firebaseUser,
    localEntriesReady: localEntriesReady && localEntriesMatchCurrentUser,
    hasDriveSession,
    driveFolderId,
    onAuthExpired: handleDriveAuthExpiry,
    showMessage: showAuthMessage,
    onPersistEntries: persistEntriesToCloud
  });

  async function handleGoogleSignIn() {
    try {
      const accessToken = await signInWithGoogle();

      if (accessToken) {
        await registerDriveAccessToken(accessToken);
        showAuthMessage("Google ログインと Drive 連携を更新しました。");
        return;
      }

      showAuthMessage("Google ログインを開始しました。");
    } catch (error) {
      showAuthMessage(
        error instanceof Error ? error.message : "Google ログインに失敗しました。Firebase 設定を確認してください。",
        7000
      );
    }
  }

  async function handleGoogleSignOut() {
    await clearDriveState();
    await signOutFromFirebase();
    showAuthMessage("ログアウトしました。ローカル保存は引き続き使えます。");
  }

  async function handleCloudLoad() {
    if (!firebaseUser) {
      showAuthMessage("クラウド同期には Google ログインが必要です。");
      return;
    }

    try {
      const cloudArchive = await loadCloudEntries(firebaseUser);
      const cloudEntries = cloudArchive.entries;

      if (!cloudEntries) {
        return;
      }

      if (cloudEntries.length === 0) {
        lastSyncedEntriesRef.current = [];
        cloudRevisionRef.current = cloudArchive.revision;
        cloudSnapshotReadyRef.current = true;
        showAuthMessage("クラウド上にまだ保存データはありません。");
        return;
      }

      if (!confirmCloudSync(cloudEntries)) {
        showAuthMessage("クラウド同期をキャンセルしました。");
        return;
      }

      suppressCloudSyncEffectRef.current = true;
      autoSaveBlockedRef.current = false;
      cloudSnapshotReadyRef.current = true;
      lastSyncedEntriesRef.current = cloudEntries;
      currentEntriesRef.current = cloudEntries;
      setEntries(cloudEntries);
      setCloudDriveFolderId(cloudArchive.settings.driveFolderId ?? "");
      lastSavedDriveFolderIdRef.current = cloudArchive.settings.driveFolderId ?? "";
      cloudRevisionRef.current = cloudArchive.revision;
      autoHydratedUserIdRef.current = firebaseUser.uid;
      lastSyncedHashRef.current = writeCloudSyncState(window.localStorage, firebaseUser.uid, cloudEntries);
      updateLastSyncedAtLabel(readCloudSyncState(window.localStorage).syncedAt);

      showAuthMessage("クラウドと同期しました。");
    } catch (error) {
      showAuthMessage(
        error instanceof Error ? error.message : "クラウド同期に失敗しました。Firebase 設定を確認してください。",
        7000
      );
    }
  }

  return {
    firebaseUser,
    firebaseAuthReady,
    authMessage,
    syncStatus,
    lastSyncedAtLabel,
    imageService,
    driveFolderId,
    cloudDriveFolderId,
    driveSessionSavedAtLabel,
    isDriveAccessStale,
    hasDriveAccessToken: hasDriveSession,
    handleGoogleSignIn,
    handleGoogleSignOut,
    handleCloudLoad,
    handleSaveCurrentToCloud,
    handleRetryImageSync,
    handleRetryEntryImageSync,
    handleConfigureDriveFolder,
    handleDeleteImage,
    persistEntryToCloud,
    persistEntriesToCloud,
    deleteEntryFromCloud
  };
}
