"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { observeFirebaseUser, signInWithGoogle, signOutFromFirebase } from "@/lib/firebase/auth";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { FirestoreRoomPlanRepository } from "@/lib/firebase/firestore-roomplan-repository";
import type { PlannerProject } from "@/lib/types";

type UseRoomPlanerCloudParams = {
  project: PlannerProject;
  loadProjectState: (project: PlannerProject) => void;
  parseProject: (raw: string) => PlannerProject;
};

function getCloudErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = String(error.code);
    if (code === "permission-denied") {
      return "Firestore の権限設定で保存が拒否されています。Firebase Console の Firestore Rules で roomPlans への read/write を許可してください。";
    }
    if (code === "unavailable") {
      return "Firestore に接続できませんでした。ネットワークか Firebase 側の状態を確認してください。";
    }
  }

  return error instanceof Error ? error.message : "クラウド操作に失敗しました。";
}

export function useRoomPlanerCloud({ project, loadProjectState, parseProject }: UseRoomPlanerCloudParams) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudMessage, setCloudMessage] = useState(
    isFirebaseConfigured() ? "" : "Firebase 環境変数を入れると、Googleログインとクラウド保存を使えます。"
  );
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => {
    return observeFirebaseUser(setFirebaseUser);
  }, []);

  const setMessage = (message: string) => {
    setCloudMessage(message);
  };

  const signIn = async () => {
    try {
      setCloudBusy(true);
      await signInWithGoogle();
      setMessage("Google ログインを開始しました。");
    } catch (error) {
      setMessage(getCloudErrorMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const signOut = async () => {
    try {
      setCloudBusy(true);
      await signOutFromFirebase();
      setMessage("ログアウトしました。");
    } catch (error) {
      setMessage(getCloudErrorMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const saveProjectToCloud = async () => {
    if (!firebaseUser) {
      setMessage("先に Google ログインしてください。");
      return;
    }

    try {
      setCloudBusy(true);
      const repository = new FirestoreRoomPlanRepository();
      const result = await repository.save(firebaseUser, project);
      setMessage(
        result.backgroundOmitted
          ? "Firestore に保存しました。背景画像は容量制限のためクラウド保存から除外しています。"
          : "現在のプロジェクトを Firestore に保存しました。"
      );
    } catch (error) {
      setMessage(getCloudErrorMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  const loadProjectFromCloud = async () => {
    if (!firebaseUser) {
      setMessage("先に Google ログインしてください。");
      return;
    }

    try {
      setCloudBusy(true);
      const repository = new FirestoreRoomPlanRepository();
      const cloudProject = await repository.load(firebaseUser);
      if (!cloudProject) {
        setMessage("Firestore に保存済みのプロジェクトが見つかりませんでした。");
        return;
      }
      loadProjectState(parseProject(JSON.stringify(cloudProject)));
      setMessage("Firestore からプロジェクトを読み込みました。");
    } catch (error) {
      setMessage(getCloudErrorMessage(error));
    } finally {
      setCloudBusy(false);
    }
  };

  return {
    firebaseUser,
    cloudMessage,
    cloudBusy,
    firebaseConfigured: isFirebaseConfigured(),
    signIn,
    signOut,
    saveProjectToCloud,
    loadProjectFromCloud,
    setCloudMessage: setMessage
  };
}
