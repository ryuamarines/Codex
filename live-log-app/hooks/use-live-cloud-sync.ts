"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { sampleEntries } from "@/data/live-entries";
import { LocalArchiveImageService, type ArchiveImageService } from "@/lib/archive-image-service";
import {
  hashEntries,
  hasUnsyncedLocalChanges,
  readCloudSyncState,
  writeCloudSyncState
} from "@/lib/cloud-sync";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  observeFirebaseUser,
  signInWithGoogle,
  signOutFromFirebase
} from "@/lib/firebase/auth";
import { loadCloudEntries, saveCloudEntries } from "@/lib/live-cloud-service";
import type { LiveEntry } from "@/lib/types";
import { useDriveImageSync } from "@/hooks/use-drive-image-sync";
import { useDriveSession } from "@/hooks/use-drive-session";

type UseLiveCloudSyncParams = {
  entries: LiveEntry[];
  setEntries: React.Dispatch<React.SetStateAction<LiveEntry[]>>;
  localEntriesReady: boolean;
};

export function useLiveCloudSync({
  entries,
  setEntries,
  localEntriesReady
}: UseLiveCloudSyncParams) {
  const [cloudHydrateRetryNonce, setCloudHydrateRetryNonce] = useState(0);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authMessage, setAuthMessage] = useState(
    isFirebaseConfigured() ? "" : "Firebase の環境変数を入れるとクラウド同期を有効にできます。"
  );
  const [imageService] = useState<ArchiveImageService>(new LocalArchiveImageService());
  const [syncStatus, setSyncStatus] = useState("ローカル保存");
  const [lastSyncedAtLabel, setLastSyncedAtLabel] = useState("");
  const suppressCloudSyncEffectRef = useRef(false);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const lastSyncedHashRef = useRef<string>("");
  const autoHydratedUserIdRef = useRef<string>("");
  const cloudHydrateRetryTimeoutRef = useRef<number | null>(null);
  const cloudHydrateRetryCountRef = useRef(0);
  const authMessageTimeoutRef = useRef<number | null>(null);

  const confirmCloudReplace = useCallback(
    (cloudEntries: LiveEntry[], mode: "sync" | "replace") => {
      if (typeof window === "undefined") {
        return true;
      }

      const currentHash = hashEntries(entries);
      const cloudHash = hashEntries(cloudEntries);

      if (currentHash === cloudHash) {
        return true;
      }

      const title =
        mode === "replace"
          ? "この端末の内容をクラウドの内容で置き換えます。"
          : "クラウドの内容を読み込みます。";
      const warning =
        "この端末の表示中データとクラウドの内容が違います。\n\n" +
        "このまま続けると、この端末の未同期変更は表示上は消えます。\n" +
        "最新のつもりのデータか確認してから進めてください。";

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

  const persistEntriesToCloud = useCallback(
    async (nextEntries: LiveEntry[]) => {
      if (!firebaseUser || typeof window === "undefined") {
        return;
      }

      await saveCloudEntries(firebaseUser, nextEntries);
      lastSyncedHashRef.current = writeCloudSyncState(window.localStorage, firebaseUser.uid, nextEntries);
      updateLastSyncedAtLabel(readCloudSyncState(window.localStorage).syncedAt);
    },
    [firebaseUser]
  );

  const {
    driveFolderId,
    hasDriveSession,
    driveSessionSavedAtLabel,
    isDriveAccessStale,
    registerDriveAccessToken,
    clearDriveState,
    handleConfigureDriveFolder
  } = useDriveSession({ showMessage: showAuthMessage });

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
      if (authMessageTimeoutRef.current) {
        window.clearTimeout(authMessageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !localEntriesReady) {
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
      sampleEntries
    );

    setSyncStatus(hasPendingLocalChanges ? "未同期の変更あり" : "クラウド同期済み");
  }, [entries, firebaseUser, localEntriesReady]);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      return;
    }

    return observeFirebaseUser((user) => {
      setFirebaseUser(user);
    });
  }, []);

  useEffect(() => {
    if (!firebaseUser || !localEntriesReady) {
      autoHydratedUserIdRef.current = "";
      cloudHydrateRetryCountRef.current = 0;
      return;
    }

    const user = firebaseUser;

    if (autoHydratedUserIdRef.current === user.uid) {
      return;
    }

    let cancelled = false;

    async function autoHydrateFromCloud() {
      try {
        const cloudEntries = await loadCloudEntries(user);

        if (cancelled) {
          return;
        }

        const hasPendingLocalChanges = hasUnsyncedLocalChanges(
          window.localStorage,
          user.uid,
          entries,
          sampleEntries
        );

        if (cloudEntries.length === 0) {
          const currentLooksLikeFallback = hashEntries(entries) === hashEntries(sampleEntries);

          if (!hasPendingLocalChanges && currentLooksLikeFallback && cloudHydrateRetryCountRef.current < 3) {
            cloudHydrateRetryCountRef.current += 1;
            cloudHydrateRetryTimeoutRef.current = window.setTimeout(() => {
              autoHydratedUserIdRef.current = "";
              cloudHydrateRetryTimeoutRef.current = null;
              setCloudHydrateRetryNonce((current) => current + 1);
            }, 2500);
            return;
          }

          autoHydratedUserIdRef.current = user.uid;
          return;
        }

        const cloudHash = hashEntries(cloudEntries);

        if (hasPendingLocalChanges) {
          showAuthMessage("この端末に未同期変更があります。クラウド同期前に内容を確認してください。", 7000);
          return;
        }

        const currentHash = hashEntries(entries);
        const sampleHash = hashEntries(sampleEntries);

        if (currentHash !== cloudHash && currentHash !== sampleHash) {
          showAuthMessage("この端末の内容とクラウドが異なります。必要なら手動でクラウド同期してください。", 7000);
          return;
        }

        suppressCloudSyncEffectRef.current = true;
        setEntries(cloudEntries);
        lastSyncedHashRef.current = cloudHash;
        writeCloudSyncState(window.localStorage, user.uid, cloudEntries);
        updateLastSyncedAtLabel(readCloudSyncState(window.localStorage).syncedAt);
        autoHydratedUserIdRef.current = user.uid;
        cloudHydrateRetryCountRef.current = 0;
      } catch {
        if (!cancelled) {
          autoHydratedUserIdRef.current = user.uid;
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
  }, [cloudHydrateRetryNonce, entries, firebaseUser, localEntriesReady, setEntries]);

  useEffect(() => {
    if (!firebaseUser || !localEntriesReady) {
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
      try {
        await saveCloudEntries(firebaseUser, entries);
        lastSyncedHashRef.current = writeCloudSyncState(window.localStorage, firebaseUser.uid, entries);
        updateLastSyncedAtLabel(readCloudSyncState(window.localStorage).syncedAt);
        setSyncStatus("クラウド同期済み");
      } catch {
        setSyncStatus("クラウド保存失敗");
      }
    }, 1800);

    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [entries, firebaseUser, localEntriesReady]);

  const {
    pendingImageUploadRef,
    handleRetryImageSync,
    handleRetryEntryImageSync,
    handleDeleteImage
  } = useDriveImageSync({
    entries,
    setEntries,
    firebaseUser,
    localEntriesReady,
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
    } catch {
      showAuthMessage("Google ログインに失敗しました。Firebase 設定を確認してください。");
    }
  }

  async function handleGoogleSignOut() {
    await signOutFromFirebase();
    await clearDriveState();
    showAuthMessage("ログアウトしました。ローカル保存は引き続き使えます。");
  }

  async function handleCloudLoad() {
    if (!firebaseUser) {
      showAuthMessage("クラウド同期には Google ログインが必要です。");
      return;
    }

    try {
      const cloudEntries = await loadCloudEntries(firebaseUser);

      if (!cloudEntries) {
        return;
      }

      if (cloudEntries.length === 0) {
        showAuthMessage("クラウド上にまだ保存データはありません。");
        return;
      }

      if (!confirmCloudReplace(cloudEntries, "sync")) {
        showAuthMessage("クラウド同期をキャンセルしました。");
        return;
      }

      suppressCloudSyncEffectRef.current = true;
      setEntries(cloudEntries);
      lastSyncedHashRef.current = writeCloudSyncState(window.localStorage, firebaseUser.uid, cloudEntries);
      updateLastSyncedAtLabel(readCloudSyncState(window.localStorage).syncedAt);

      showAuthMessage("クラウドと同期しました。");
    } catch {
      showAuthMessage("クラウド同期に失敗しました。Firebase 設定を確認してください。");
    }
  }

  async function handleForceCloudReplace() {
    if (!firebaseUser) {
      showAuthMessage("この端末をクラウドで置き換えるには Google ログインが必要です。");
      return;
    }

    try {
      const cloudEntries = await loadCloudEntries(firebaseUser);

      if (!cloudEntries) {
        return;
      }

      if (cloudEntries.length === 0) {
        showAuthMessage("クラウド上にまだ保存データはありません。");
        return;
      }

      if (!confirmCloudReplace(cloudEntries, "replace")) {
        showAuthMessage("クラウドでの置き換えをキャンセルしました。");
        return;
      }

      suppressCloudSyncEffectRef.current = true;
      setEntries(cloudEntries);
      lastSyncedHashRef.current = writeCloudSyncState(window.localStorage, firebaseUser.uid, cloudEntries);
      updateLastSyncedAtLabel(readCloudSyncState(window.localStorage).syncedAt);

      showAuthMessage("この端末をクラウド同期データで置き換えました。");
    } catch {
      showAuthMessage("クラウドでの置き換えに失敗しました。Firebase 設定を確認してください。");
    }
  }

  return {
    firebaseUser,
    authMessage,
    syncStatus,
    lastSyncedAtLabel,
    imageService,
    driveFolderId,
    driveSessionSavedAtLabel,
    isDriveAccessStale,
    hasDriveAccessToken: hasDriveSession,
    handleGoogleSignIn,
    handleGoogleSignOut,
    handleCloudLoad,
    handleForceCloudReplace,
    handleRetryImageSync,
    handleRetryEntryImageSync,
    handleConfigureDriveFolder,
    handleDeleteImage
  };
}
