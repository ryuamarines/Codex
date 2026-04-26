import {
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

function formatGoogleAuthError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message =
    typeof error === "object" && error && "message" in error ? String(error.message) : "";

  if (code === "auth/unauthorized-domain") {
    return new Error("このドメインは Firebase Auth で許可されていません。Authorized domains を確認してください。");
  }

  if (code === "auth/operation-not-allowed") {
    return new Error("Firebase の Google ログインが有効になっていません。Authentication の設定を確認してください。");
  }

  if (code === "auth/network-request-failed") {
    return new Error("Google ログイン中に通信エラーが起きました。回線とブラウザ設定を確認してください。");
  }

  if (
    code === "auth/operation-not-supported-in-this-environment" ||
    message.includes("/__/auth/handler") ||
    message.includes("redirect_uri")
  ) {
    return new Error("このブラウザでは Google ログインのリダイレクト設定が不足しています。`/__/auth/handler` の設定を確認してください。");
  }

  return error instanceof Error ? error : new Error("Google ログインに失敗しました。");
}

function shouldUseRedirectForGoogleSignIn() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent ?? "";
  const isIOS =
    /iPhone|iPad|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const isAndroidChromium = isAndroid && /Chrome|CriOS|Brave/i.test(userAgent);
  const isAlternateMobileBrowser = /CriOS|FxiOS|EdgiOS|DuckDuckGo|YaBrowser/i.test(userAgent);
  const isTouchDevice = navigator.maxTouchPoints > 1;
  const isCompactViewport = window.matchMedia("(max-width: 900px)").matches;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (typeof navigator !== "undefined" && "standalone" in navigator && Boolean(navigator.standalone));

  if (isAndroidChromium) {
    return false;
  }

  return isIOS || isAndroid || isAlternateMobileBrowser || isStandalone || (isTouchDevice && isCompactViewport);
}

export function observeFirebaseUser(callback: (user: User | null) => void) {
  const auth = getFirebaseAuth();

  if (!auth) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();

  if (!auth) {
    throw new Error("Firebase is not configured.");
  }

  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.file");
  provider.setCustomParameters({ prompt: "select_account" });
  const prefersRedirect = shouldUseRedirectForGoogleSignIn();
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch {
      // Continue with Firebase default persistence when storage is restricted.
    }
  }

  if (prefersRedirect) {
    await signInWithRedirect(auth, provider);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    return credential?.accessToken ?? null;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

    if (
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      if (!prefersRedirect) {
        throw formatGoogleAuthError(error);
      }

      await signInWithRedirect(auth, provider);
      return null;
    }

    throw formatGoogleAuthError(error);
  }
}

export async function consumeGoogleRedirectAccessToken() {
  const auth = getFirebaseAuth();

  if (!auth) {
    return null;
  }

  const result = await getRedirectResult(auth).catch((error) => {
    throw formatGoogleAuthError(error);
  });
  const credential = result ? GoogleAuthProvider.credentialFromResult(result) : null;
  return credential?.accessToken ?? null;
}

export async function signOutFromFirebase() {
  const auth = getFirebaseAuth();

  if (!auth) {
    return;
  }

  await signOut(auth);
}
