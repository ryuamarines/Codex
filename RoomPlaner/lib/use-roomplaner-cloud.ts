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
      setMessage(error instanceof Error ? error.message : "Google ログインに失敗しました。");
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
      setMessage(error instanceof Error ? error.message : "ログアウトに失敗しました。");
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
      await repository.save(firebaseUser, project);
      setMessage("現在のプロジェクトを Firestore に保存しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "クラウド保存に失敗しました。");
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
      setMessage(error instanceof Error ? error.message : "クラウド読込に失敗しました。");
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
