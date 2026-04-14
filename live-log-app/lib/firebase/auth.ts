import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

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

  if (typeof window !== "undefined" && window.innerWidth < 768) {
    await signInWithRedirect(auth, provider);
    return null;
  }

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return credential?.accessToken ?? null;
}

export async function consumeGoogleRedirectAccessToken() {
  const auth = getFirebaseAuth();

  if (!auth) {
    return null;
  }

  const result = await getRedirectResult(auth);
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
