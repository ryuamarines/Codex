import { normalizeEvent } from "./models.js";
import { resolveDataBackend } from "./app-config.js";
import { parseEventsCsv, serializeEventsToCsv } from "./csv-transfer.js";
import {
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
} from "./firebase-client.js";

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json();
}

async function requestText(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.text();
}

function normalizeEvents(events) {
  return events.map((event) => normalizeEvent(event));
}

function toAuthRepositoryError(error) {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "auth/popup-closed-by-user") {
      return new Error("Google ログインがキャンセルされました。");
    }

    if (error.code === "auth/popup-blocked") {
      return new Error("Google ログインのポップアップがブロックされました。ポップアップを許可してからもう一度お試しください。");
    }
  }

  return new Error("Google ログインに失敗しました。Firebase Authentication の設定を確認してください。");
}

function toFirestoreRepositoryError(action, error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "permission-denied"
  ) {
    return new Error(
      auth.currentUser
        ? action === "read"
          ? "Google ログインは通っていますが、Firestore Rules が eventHub/appState の読込を許可していません。Rules を確認してください。"
          : "Google ログインは通っていますが、Firestore Rules が eventHub/appState の保存を許可していません。Rules を確認してください。"
        : "Google アカウントでログインしてから、もう一度お試しください。"
    );
  }

  if (typeof error === "object" && error !== null && "code" in error && error.code === "unauthenticated") {
    return new Error("Google アカウントでログインしてから、もう一度お試しください。");
  }

  return new Error(
    action === "read"
      ? "Firestore からの読込に失敗しました。接続設定かルールを確認してください。"
      : "Firestore への保存に失敗しました。接続設定かルールを確認してください。"
  );
}

function createSessionPayload(user) {
  return {
    authRequired: true,
    backendLabel: "Firestore / Vercel",
    user: serializeAuthUser(user),
    isAllowed: Boolean(user)
  };
}

async function requireSignedInUser() {
  await authReadyPromise;

  if (!auth.currentUser) {
    throw new Error("Google アカウントでログインしてください。");
  }

  return auth.currentUser;
}

export function createApiEventRepository() {
  return {
    key: resolveDataBackend(),
    async getSession() {
      try {
        return await requestJson("/api/session");
      } catch {
        return {
          authRequired: false,
          backendLabel: "Shared API",
          user: null,
          isAllowed: true
        };
      }
    },
    subscribeSession() {
      return () => {};
    },
    async signInWithGoogle() {
      return null;
    },
    async signOut() {
      return null;
    },
    async load() {
      const events = await requestJson("/api/events");
      return normalizeEvents(events);
    },
    async save(events) {
      const saved = await requestJson("/api/events", {
        method: "PUT",
        body: JSON.stringify(events)
      });

      return normalizeEvents(saved);
    },
    async reset() {
      const events = await requestJson("/api/reset", {
        method: "POST",
        body: JSON.stringify({})
      });

      return normalizeEvents(events);
    },
    async importCsv(csvText) {
      const events = await requestJson("/api/import-csv", {
        method: "POST",
        headers: {
          "Content-Type": "text/csv; charset=utf-8"
        },
        body: csvText
      });

      return normalizeEvents(events);
    },
    async exportCsv() {
      return requestText("/api/export-csv");
    }
  };
}

async function loadSeedEvents() {
  const response = await fetch("/seed/default-events.json");

  if (!response.ok) {
    throw new Error("初期サンプルデータの取得に失敗しました。");
  }

  return normalizeEvents(await response.json());
}

export function createFirestoreEventRepository() {
  return {
    key: "firestore",
    async getSession() {
      const user = await authReadyPromise;
      return createSessionPayload(user);
    },
    subscribeSession(listener) {
      return subscribeAuthSession((user) => {
        listener(createSessionPayload(user));
      });
    },
    async signInWithGoogle() {
      try {
        await signInWithGoogleAccount();
      } catch (error) {
        throw toAuthRepositoryError(error);
      }
    },
    async signOut() {
      await signOut(auth);
    },
    async load() {
      try {
        await requireSignedInUser();
        const snapshot = await getDoc(eventHubDoc);

        if (!snapshot.exists()) {
          const seedEvents = await loadSeedEvents();
          await setDoc(eventHubDoc, {
            revision: 1,
            updatedAt: new Date().toISOString(),
            events: seedEvents
          });
          return normalizeEvents(seedEvents);
        }

        const payload = snapshot.data();
        return normalizeEvents(Array.isArray(payload?.events) ? payload.events : []);
      } catch (error) {
        throw toFirestoreRepositoryError("read", error);
      }
    },
    async save(events) {
      const normalizedEvents = normalizeEvents(events);

      try {
        await requireSignedInUser();
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(eventHubDoc);
          const currentRevision = snapshot.exists() ? Number(snapshot.data()?.revision || 0) : 0;

          transaction.set(eventHubDoc, {
            revision: currentRevision + 1,
            updatedAt: new Date().toISOString(),
            events: normalizedEvents
          });
        });
      } catch (error) {
        throw toFirestoreRepositoryError("write", error);
      }

      return normalizedEvents;
    },
    async reset() {
      const seedEvents = await loadSeedEvents();
      return this.save(seedEvents);
    },
    async importCsv(csvText) {
      const events = normalizeEvents(parseEventsCsv(csvText));
      return this.save(events);
    },
    async exportCsv() {
      const events = await this.load();
      return serializeEventsToCsv(events);
    }
  };
}

export async function createEventRepository() {
  if (resolveDataBackend() === "firestore") {
    return createFirestoreEventRepository();
  }

  return createApiEventRepository();
}
