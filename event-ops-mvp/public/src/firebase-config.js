export const APP_TITLE = "Event Hub";

export const APP_RUNTIME = {
  dataBackend: "firebase",
  requireLogin: false,
  allowedEmails: []
};

export const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyAVnp2umEHgo3IrPEcUsHYzoAGTnA2Dh6U",
  authDomain: "event-hub-feb37.firebaseapp.com",
  projectId: "event-hub-feb37",
  storageBucket: "event-hub-feb37.firebasestorage.app",
  messagingSenderId: "1084688606361",
  appId: "1:1084688606361:web:7a96f1b151223b13ee8408",
  measurementId: "G-11880P5KTV"
};

export const FIRESTORE_COLLECTIONS = {
  events: "events",
  appState: "_app"
};

export const FIRESTORE_DOCUMENTS = {
  legacyEventsState: "events",
  eventsMeta: "events_meta"
};
