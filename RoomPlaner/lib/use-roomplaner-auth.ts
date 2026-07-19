"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { observeFirebaseUser, signInWithGoogle, signOutFromFirebase } from "@/lib/firebase/auth";

function authErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = String(error.code);
    if (code === "auth/popup-closed-by-user") return "Googleログインがキャンセルされました。";
    if (code === "auth/network-request-failed") return "認証サーバーに接続できませんでした。ネットワークを確認してください。";
    if (code === "auth/unauthorized-domain") return "このURLはFirebase Authの承認済みドメインに登録されていません。";
    if (code === "auth/operation-not-allowed") return "Firebase ConsoleでGoogleログインを有効にしてください。";
    if (code === "auth/invalid-api-key") return "FirebaseのAPIキー設定が正しくありません。";
  }
  return error instanceof Error ? error.message : "認証操作に失敗しました。";
}

export function useRoomPlanerAuth() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    return observeFirebaseUser(
      (user) => {
        setFirebaseUser(user);
        setAuthResolved(true);
        setAuthBusy(false);
      },
      (error) => {
        setAuthMessage(authErrorMessage(error));
        setAuthBusy(false);
      }
    );
  }, []);

  const signIn = useCallback(async () => {
    try {
      setAuthBusy(true);
      setAuthMessage("");
      await signInWithGoogle();
    } catch (error) {
      setAuthMessage(authErrorMessage(error));
      setAuthBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setAuthBusy(true);
      setAuthMessage("");
      await signOutFromFirebase();
    } catch (error) {
      setAuthMessage(authErrorMessage(error));
      setAuthBusy(false);
    }
  }, []);

  return {
    firebaseUser,
    authResolved,
    authBusy,
    authMessage,
    signIn,
    signOut
  };
}
