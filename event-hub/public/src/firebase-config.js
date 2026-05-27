const currentHost = typeof window === "undefined" ? "" : window.location.host;
const isProductionHost = currentHost === "event-hub-orpin-seven.vercel.app";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAVnp2umEHgo3IrPEcUsHYzoAGTnA2Dh6U",
  authDomain: isProductionHost ? "event-hub-orpin-seven.vercel.app" : "event-hub-feb37.firebaseapp.com",
  projectId: "event-hub-feb37",
  storageBucket: "event-hub-feb37.firebasestorage.app",
  messagingSenderId: "1084688606361",
  appId: "1:1084688606361:web:7a96f1b151223b13ee8408",
  measurementId: "G-11880P5KTV"
};

export const FIRESTORE_COLLECTION = "eventHub";
export const FIRESTORE_DOCUMENT = "appState";
export const FIRESTORE_MEMBER_COLLECTION = "eventHubMembers";

// "authenticated" は Google ログイン済みなら共有データを読める運用です。
// より厳密に絞りたい場合は "member-doc" に戻し、
// eventHubMembers/{uid}.active == true を Firestore に作ります。
export const FIRESTORE_ACCESS_MODE = "authenticated";
