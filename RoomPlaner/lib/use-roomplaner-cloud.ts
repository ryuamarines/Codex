"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { FirestoreRoomPlanRepository } from "@/lib/firebase/firestore-roomplan-repository";
import {
  buildPlannerStorageScope,
  type PlannerStorageScope,
  type PlannerWorkspaceSnapshot
} from "@/lib/planner-workspace-storage";
import type { PlannerProject } from "@/lib/types";

type UseRoomPlanerCloudParams = {
  firebaseUser: User | null;
  authResolved: boolean;
  project: PlannerProject;
  hydrateWorkspaceState: (workspace: PlannerWorkspaceSnapshot) => boolean;
  loadWorkspaceState: (workspace: PlannerWorkspaceSnapshot) => boolean;
  getWorkspaceSnapshot: () => PlannerWorkspaceSnapshot | null;
  storageReady: boolean;
  storageScope: PlannerStorageScope | null;
  storageHasProject: boolean;
};

function getCloudErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = String(error.code);
    if (code === "permission-denied") {
      return "Firestoreの権限設定で保存が拒否されています。Firebase ConsoleのFirestore Rulesを確認してください。";
    }
    if (code === "unavailable") {
      return "Firestoreに接続できませんでした。ネットワークかFirebase側の状態を確認してください。";
    }
    if (code === "deadline-exceeded") {
      return "Firestoreの応答が遅いため中断しました。現在のブラウザデータで編集を続けられます。";
    }
  }

  return error instanceof Error ? error.message : "クラウド操作に失敗しました。";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject({ code: "deadline-exceeded" }), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export function useRoomPlanerCloud({
  firebaseUser,
  authResolved,
  project,
  hydrateWorkspaceState,
  loadWorkspaceState,
  getWorkspaceSnapshot,
  storageReady,
  storageScope,
  storageHasProject
}: UseRoomPlanerCloudParams) {
  const [cloudMessage, setCloudMessage] = useState(
    isFirebaseConfigured() ? "" : "Firebase環境変数を入れると、Googleログインとクラウド保存を使えます。"
  );
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudUpdatedAtMs, setCloudUpdatedAtMs] = useState<number | null>(null);
  const [hydratingScope, setHydratingScope] = useState<PlannerStorageScope | null>(null);
  const [readyScope, setReadyScope] = useState<PlannerStorageScope | null>(null);
  const expectedScope = buildPlannerStorageScope(firebaseUser?.uid ?? null);
  const activeContextRef = useRef({ userId: firebaseUser?.uid ?? null, projectId: project.id, project });
  const cloudOperationRef = useRef(0);
  activeContextRef.current = { userId: firebaseUser?.uid ?? null, projectId: project.id, project };
  const cloudHydrating = hydratingScope === expectedScope;
  const cloudReady = authResolved && storageReady && storageScope === expectedScope && readyScope === expectedScope;

  const contextIsCurrent = (userId: string, projectId: string, projectSnapshot?: PlannerProject) => {
    const current = activeContextRef.current;
    return current.userId === userId
      && current.projectId === projectId
      && (!projectSnapshot || current.project === projectSnapshot);
  };

  useEffect(() => {
    cloudOperationRef.current += 1;
    setCloudBusy(false);
    setCloudUpdatedAtMs(null);
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (!authResolved || !storageReady || storageScope !== expectedScope || readyScope === expectedScope) {
      return;
    }

    if (!firebaseUser) {
      setHydratingScope(null);
      setReadyScope(expectedScope);
      if (isFirebaseConfigured()) setCloudMessage("");
      return;
    }

    if (storageHasProject) {
      setHydratingScope(null);
      setReadyScope(expectedScope);
      setCloudMessage("このアカウントのブラウザ保存を読み込みました。クラウド読込は必要な場合だけ実行してください。");
      return;
    }

    let active = true;
    const hydrate = async () => {
      try {
        setHydratingScope(expectedScope);
        const repository = new FirestoreRoomPlanRepository();
        const cloudRecord = await withTimeout(repository.load(firebaseUser), 8000);
        if (!active) return;

        if (!cloudRecord) {
          setCloudUpdatedAtMs(null);
          setCloudMessage("このアカウントには保存済みプロジェクトがありません。サンプルから開始できます。");
          return;
        }

        if (!hydrateWorkspaceState(cloudRecord.workspace)) {
          setCloudMessage("クラウドデータを端末へ保存できなかったため、読込を中断しました。ブラウザの空き容量を確認してください。");
          return;
        }
        setCloudUpdatedAtMs(cloudRecord.updatedAtMs > 0 ? cloudRecord.updatedAtMs : null);

        if (cloudRecord.migratedLegacy || cloudRecord.schemaVersion < FirestoreRoomPlanRepository.schemaVersion) {
          setCloudMessage(
            "旧形式のクラウドデータを安全に読み込みました。次回のクラウド保存で複数プロジェクト形式へ更新されます。"
          );
        } else {
          setCloudMessage(`${cloudRecord.workspace.projects.length}件のクラウドプロジェクトを読み込みました。`);
        }
      } catch (error) {
        if (active) setCloudMessage(getCloudErrorMessage(error));
      } finally {
        if (active) {
          setHydratingScope(null);
          setReadyScope(expectedScope);
        }
      }
    };

    void hydrate();
    return () => {
      active = false;
    };
  }, [
    authResolved,
    expectedScope,
    firebaseUser,
    hydrateWorkspaceState,
    readyScope,
    storageHasProject,
    storageReady,
    storageScope
  ]);

  const saveProjectToCloud = async () => {
    if (!firebaseUser) {
      setCloudMessage("先にGoogleログインしてください。");
      return;
    }
    const targetUserId = firebaseUser.uid;
    const targetProjectId = project.id;
    const targetProject = project;
    const operationId = ++cloudOperationRef.current;
    const workspaceSnapshot = getWorkspaceSnapshot();
    if (!workspaceSnapshot) {
      setCloudMessage("ブラウザ保存を準備できなかったため、クラウド保存を中断しました。");
      return;
    }

    try {
      setCloudBusy(true);
      const repository = new FirestoreRoomPlanRepository();
      const result = await withTimeout(repository.saveWorkspace(firebaseUser, workspaceSnapshot), 12000);
      if (cloudOperationRef.current !== operationId) return;
      if (!contextIsCurrent(targetUserId, targetProjectId)) return;
      if (!contextIsCurrent(targetUserId, targetProjectId, targetProject)) {
        setCloudMessage("保存中に編集されたため、最新の変更はまだFirestoreへ保存されていません。もう一度保存してください。");
        return;
      }
      setCloudMessage(
        result.backgroundsOmitted > 0
          ? `${workspaceSnapshot.projects.length}件をクラウド保存しました。背景画像${result.backgroundsOmitted}件は端末内だけに保持しています。`
          : `${workspaceSnapshot.projects.length}件のプロジェクトをクラウド保存しました。`
      );
      setCloudUpdatedAtMs(result.updatedAtMs);
    } catch (error) {
      if (cloudOperationRef.current === operationId && contextIsCurrent(targetUserId, targetProjectId)) {
        setCloudMessage(getCloudErrorMessage(error));
      }
    } finally {
      if (cloudOperationRef.current === operationId) setCloudBusy(false);
    }
  };

  const loadProjectFromCloud = async () => {
    if (!firebaseUser) {
      setCloudMessage("先にGoogleログインしてください。");
      return;
    }
    const targetUserId = firebaseUser.uid;
    const targetProjectId = project.id;
    const targetProject = project;
    const operationId = ++cloudOperationRef.current;

    try {
      setCloudBusy(true);
      const repository = new FirestoreRoomPlanRepository();
      const cloudRecord = await withTimeout(repository.load(firebaseUser), 8000);
      if (cloudOperationRef.current !== operationId) return;
      if (!contextIsCurrent(targetUserId, targetProjectId)) return;
      if (!contextIsCurrent(targetUserId, targetProjectId, targetProject)) {
        setCloudMessage("読込中に編集されたため、Firestoreの内容は反映しませんでした。もう一度読込を実行してください。");
        return;
      }
      if (!cloudRecord) {
        setCloudUpdatedAtMs(null);
        setCloudMessage("Firestoreに保存済みのプロジェクトが見つかりませんでした。");
        return;
      }
      if (!loadWorkspaceState(cloudRecord.workspace)) {
        setCloudMessage("クラウドデータを端末へ保存できなかったため、読込を中断しました。ブラウザの空き容量を確認してください。");
        return;
      }
      setCloudUpdatedAtMs(cloudRecord.updatedAtMs > 0 ? cloudRecord.updatedAtMs : null);
      setCloudMessage(`${cloudRecord.workspace.projects.length}件のプロジェクトをクラウドから読み込みました。`);
    } catch (error) {
      if (cloudOperationRef.current === operationId && contextIsCurrent(targetUserId, targetProjectId)) {
        setCloudMessage(getCloudErrorMessage(error));
      }
    } finally {
      if (cloudOperationRef.current === operationId) setCloudBusy(false);
    }
  };

  return {
    cloudMessage,
    cloudBusy,
    cloudUpdatedAtMs,
    cloudHydrating,
    cloudReady,
    firebaseConfigured: isFirebaseConfigured(),
    saveProjectToCloud,
    loadProjectFromCloud,
    setCloudMessage
  };
}
