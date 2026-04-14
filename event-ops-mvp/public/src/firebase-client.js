import { APP_RUNTIME, FIREBASE_WEB_CONFIG } from "./firebase-config.js";

let firebaseClientPromise = null;

function requireFirebaseGlobal() {
  if (!window.firebase) {
    throw new Error("Firebase SDK の読み込みに失敗しました。index.html の script 設定を確認してください。");
  }

  return window.firebase;
}

function isAllowedUser(user) {
  if (!APP_RUNTIME.requireLogin) {
    return true;
  }

  if (!user?.email) {
    return false;
  }

  if (!APP_RUNTIME.allowedEmails.length) {
    return true;
  }

  return APP_RUNTIME.allowedEmails.includes(user.email.toLowerCase());
}

function buildUserProfile(user) {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    photoURL: user.photoURL || ""
  };
}

export async function getFirebaseClient() {
  if (firebaseClientPromise) {
    return firebaseClientPromise;
  }

  firebaseClientPromise = Promise.resolve().then(() => {
    const firebase = requireFirebaseGlobal();
    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(FIREBASE_WEB_CONFIG);
    const auth = firebase.auth();
    const db = firebase.firestore();

    return {
      app,
      auth,
      db,
      isAllowedUser,
      buildUserProfile,
      async waitForInitialAuth() {
        return new Promise((resolve) => {
          const unsubscribe = auth.onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user);
          });
        });
      },
      async getSession() {
        const user = auth.currentUser || (await this.waitForInitialAuth());
        return {
          authRequired: Boolean(APP_RUNTIME.requireLogin),
          backendLabel: "Firebase / Firestore",
          user: buildUserProfile(user),
          isAllowed: isAllowedUser(user)
        };
      },
      async signInWithGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        return buildUserProfile(result.user);
      },
      async signInWithEmailPassword(email, password) {
        const result = await auth.signInWithEmailAndPassword(email, password);
        return buildUserProfile(result.user);
      },
      async signOut() {
        await auth.signOut();
      }
    };
  });

  return firebaseClientPromise;
}
