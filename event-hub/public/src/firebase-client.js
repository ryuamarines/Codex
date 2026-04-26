import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { doc, getDoc, getFirestore, runTransaction, setDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { FIREBASE_CONFIG, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT } from "./firebase-config.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
auth.languageCode = "ja";
const db = getFirestore(app);
const eventHubDoc = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOCUMENT);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const authReadyPromise = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  });
});

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
  await setPersistence(auth, browserLocalPersistence);
  return signInWithPopup(auth, googleProvider);
}

function subscribeAuthSession(listener) {
  return onAuthStateChanged(auth, (user) => {
    listener(serializeAuthUser(user));
  });
}

export {
  auth,
  authReadyPromise,
  db,
  eventHubDoc,
  getDoc,
  runTransaction,
  serializeAuthUser,
  setDoc,
  signInWithGoogleAccount,
  signOut,
  subscribeAuthSession
};
