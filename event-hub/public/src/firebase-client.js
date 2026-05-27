import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithRedirect,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { doc, getDoc, getFirestore, runTransaction, setDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  FIREBASE_CONFIG,
  FIRESTORE_COLLECTION,
  FIRESTORE_DOCUMENT,
  FIRESTORE_MEMBER_COLLECTION
} from "./firebase-config.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
auth.languageCode = "ja";
const db = getFirestore(app);
const eventHubDoc = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const persistenceReadyPromise = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Firebase auth persistence setup failed", error);
});

const authStatePromise = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  });
});

const redirectResultPromise = persistenceReadyPromise
  .then(() => getRedirectResult(auth))
  .catch((error) => {
    console.warn("Google redirect result failed", error);
    return null;
  });

const authReadyPromise = Promise.all([redirectResultPromise, authStatePromise]).then(([, user]) => auth.currentUser || user || null);

function shouldUseRedirectForGoogleSignIn() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
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
    ("standalone" in navigator && Boolean(navigator.standalone));

  if (isAndroidChromium) {
    return false;
  }

  return isIOS || isAndroid || isAlternateMobileBrowser || isStandalone || (isTouchDevice && isCompactViewport);
}

function serializeAuthUser(user) {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email || "Google User"
  };
}

async function signInWithGoogleAccount() {
  await persistenceReadyPromise;
  await redirectResultPromise;

  const prefersRedirect = shouldUseRedirectForGoogleSignIn();

  if (prefersRedirect) {
    return signInWithRedirect(auth, googleProvider);
  }

  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request")
    ) {
      if (!prefersRedirect) {
        throw error;
      }

      return signInWithRedirect(auth, googleProvider);
    }

    throw error;
  }
}

function subscribeAuthSession(listener) {
  return onAuthStateChanged(auth, (user) => {
    listener(serializeAuthUser(user));
  });
}

function getMemberDoc(userId) {
  return doc(db, FIRESTORE_MEMBER_COLLECTION, userId);
}

export {
  auth,
  authReadyPromise,
  db,
  eventHubDoc,
  getMemberDoc,
  getDoc,
  runTransaction,
  serializeAuthUser,
  setDoc,
  signInWithGoogleAccount,
  signOut,
  subscribeAuthSession
};
