"use client";

import { useCallback, useEffect, useState } from "react";
import { consumeGoogleRedirectAccessToken } from "@/lib/firebase/auth";
import {
  clearDriveFolderId,
  clearDriveSession,
  createDriveSession,
  isDriveAccessTokenStale,
  readDriveFolderId,
  readDriveSessionStatus,
  saveDriveFolderId
} from "@/lib/google-drive-image-service";

type UseDriveSessionParams = {
  showMessage(message: string, durationMs?: number): void;
  cloudDriveFolderId?: string;
  onDriveFolderIdChange?(folderId: string): void;
};

function formatDriveSavedAtLabel(savedAt: string) {
  if (!savedAt) {
    return "";
  }

  const parsed = new Date(savedAt);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

export function useDriveSession({
  showMessage,
  cloudDriveFolderId = "",
  onDriveFolderIdChange
}: UseDriveSessionParams) {
  const [hasDriveSession, setHasDriveSession] = useState(false);
  const [driveSessionSavedAt, setDriveSessionSavedAt] = useState("");
  const [driveFolderId, setDriveFolderId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storage = window.localStorage;
    setDriveFolderId(readDriveFolderId(storage));

    let cancelled = false;

    async function refreshSession() {
      const session = await readDriveSessionStatus().catch(() => ({
        connected: false,
        savedAt: ""
      }));

      if (cancelled) {
        return;
      }

      setHasDriveSession(session.connected);
      setDriveSessionSavedAt(session.savedAt);
    }

    void refreshSession();

    const intervalId = window.setInterval(() => {
      void refreshSession();
    }, 60_000);

    void consumeGoogleRedirectAccessToken()
      .then((token) => {
        if (!token) {
          return;
        }

        void createDriveSession(token)
          .then((session) => {
            setHasDriveSession(session.connected);
            setDriveSessionSavedAt(session.savedAt);
            showMessage("Google Drive 連携を更新しました。");
          })
          .catch(() => {
            showMessage("Google Drive 連携の更新に失敗しました。");
          });
      })
      .catch(() => {
        showMessage("Google ログインの復帰に失敗しました。もう一度ログインしてください。");
      });

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [showMessage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storage = window.localStorage;
    if (!cloudDriveFolderId) {
      clearDriveFolderId(storage);
      setDriveFolderId("");
      return;
    }

    const currentLocalFolderId = readDriveFolderId(storage);

    if (currentLocalFolderId === cloudDriveFolderId) {
      return;
    }

    saveDriveFolderId(storage, cloudDriveFolderId);
    setDriveFolderId(cloudDriveFolderId);
  }, [cloudDriveFolderId]);

  const registerDriveAccessToken = useCallback(
    async (accessToken: string) => {
      const session = await createDriveSession(accessToken);
      setHasDriveSession(session.connected);
      setDriveSessionSavedAt(session.savedAt);
      return session;
    },
    []
  );

  const clearDriveState = useCallback(async () => {
    await clearDriveSession();
    if (typeof window !== "undefined") {
      clearDriveFolderId(window.localStorage);
    }
    setHasDriveSession(false);
    setDriveSessionSavedAt("");
    setDriveFolderId("");
    onDriveFolderIdChange?.("");
  }, [onDriveFolderIdChange]);

  const handleConfigureDriveFolder = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextValue = window.prompt(
      "Google Drive の保存先フォルダURLかフォルダIDを入れてください。",
      driveFolderId
    );

    if (nextValue === null) {
      return;
    }

    const saved = saveDriveFolderId(window.localStorage, nextValue);
    setDriveFolderId(saved);
    onDriveFolderIdChange?.(saved);
    showMessage(saved ? "Google Drive の保存先を更新しました。" : "Google Drive の保存先を解除しました。");
  }, [driveFolderId, onDriveFolderIdChange, showMessage]);

  return {
    driveFolderId,
    hasDriveSession,
    driveSessionSavedAtLabel: formatDriveSavedAtLabel(driveSessionSavedAt),
    isDriveAccessStale: hasDriveSession && isDriveAccessTokenStale(driveSessionSavedAt),
    registerDriveAccessToken,
    clearDriveState,
    handleConfigureDriveFolder
  };
}
