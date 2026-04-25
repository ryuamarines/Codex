import { getApps, initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function readFirebaseConfig(): FirebaseConfig | null {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };

  if (Object.values(config).some((value) => !value)) {
    return null;
  }

  return config as FirebaseConfig;
}

let cachedApp: FirebaseApp | null | undefined;
let cachedAuth: Auth | null | undefined;

export function getFirebaseApp() {
  if (cachedApp !== undefined) {
    return cachedApp;
  }

  const config = readFirebaseConfig();

  if (!config) {
    cachedApp = null;
    return cachedApp;
  }

  cachedApp = getApps()[0] ?? initializeApp(config);
  return cachedApp;
}

export function isFirebaseConfigured() {
  return getFirebaseApp() !== null;
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();

  if (!app) {
    cachedAuth = null;
    return null;
  }

  if (cachedAuth !== undefined) {
    return cachedAuth;
  }

  try {
    cachedAuth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } catch {
    cachedAuth = getAuth(app);
  }

  return cachedAuth;
}

export function getFirebaseDb() {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}
