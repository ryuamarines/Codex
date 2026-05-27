import { normalizeEvent } from "./models.js";
import { resolveDataBackend } from "./app-config.js";
import { parseEventsCsv, serializeEventsToCsv } from "./csv-transfer.js";
import { FIRESTORE_ACCESS_MODE } from "./firebase-config.js";
import {
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

function createRepositoryError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getCurrentUserHint() {
  const user = auth.currentUser;

  if (!user) {
    return "";
  }

  const email = user.email ? ` / email: ${user.email}` : "";
  return ` UID: ${user.uid}${email}`;
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

  return createRepositoryError("Google ログインに失敗しました。Firebase Authentication の設定を確認してください。", "auth-failed");
}

function toFirestoreRepositoryError(action, error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "revision-conflict"
  ) {
    return createRepositoryError("他の端末や別タブの更新が先に保存されました。画面を開き直してから、もう一度変更を反映してください。", "revision-conflict");
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "access-not-allowed"
  ) {
    return createRepositoryError(
      `この Google アカウントには Event Hub の閲覧権限がありません。Firestore に eventHubMembers/{uid} を作成し、active: true を設定してください。${getCurrentUserHint()}`,
      "access-not-allowed"
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "permission-denied"
  ) {
    const message = auth.currentUser
      ? action === "read"
        ? `Google ログインは通っていますが、Firestore Rules が読込を許可していません。Rules が request.auth != null を許可しているか確認してください。${getCurrentUserHint()}`
        : `Google ログインは通っていますが、Firestore Rules が保存を許可していません。Rules が request.auth != null を許可しているか確認してください。${getCurrentUserHint()}`
      : "Google アカウントでログインしてから、もう一度お試しください。";

    return createRepositoryError(message, "permission-denied");
  }

  if (typeof error === "object" && error !== null && "code" in error && error.code === "unauthenticated") {
    return createRepositoryError("Google アカウントでログインしてから、もう一度お試しください。", "unauthenticated");
  }

  return createRepositoryError(
    action === "read"
      ? "Firestore からの読込に失敗しました。接続設定かルールを確認してください。"
      : "Firestore への保存に失敗しました。接続設定かルールを確認してください。"
    ,
    action === "read" ? "firestore-read-failed" : "firestore-write-failed"
  );
}

function createSessionPayload(user, isAllowed = Boolean(user)) {
  return {
    authRequired: true,
    backendLabel: "Firestore / Vercel",
    user: serializeAuthUser(user),
    isAllowed,
    accessMode: FIRESTORE_ACCESS_MODE
  };
}

async function requireSignedInUser() {
  await authReadyPromise;

  if (!auth.currentUser) {
    throw createRepositoryError("Google アカウントでログインしてください。", "unauthenticated");
  }

  return auth.currentUser;
}

async function isMemberAllowed(user) {
  if (!user) {
    return false;
  }

  if (FIRESTORE_ACCESS_MODE !== "member-doc") {
    return true;
  }

  const snapshot = await getDoc(getMemberDoc(user.uid));
  return snapshot.exists() && snapshot.data()?.active === true;
}

async function requireAuthorizedUser() {
  const user = await requireSignedInUser();

  if (!(await isMemberAllowed(user))) {
    throw createRepositoryError("この Google アカウントには Event Hub の閲覧権限がありません。", "access-not-allowed");
  }

  return user;
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
  let knownRevision = null;
  let accessCache = {
    uid: null,
    isAllowed: false
  };

  function rememberRevision(revision) {
    knownRevision = Number.isFinite(revision) ? revision : null;
  }

  async function buildSession(user) {
    if (!user) {
      accessCache = { uid: null, isAllowed: false };
      return createSessionPayload(null, false);
    }

    if (accessCache.uid === user.uid) {
      return createSessionPayload(user, accessCache.isAllowed);
    }

    const isAllowed = await isMemberAllowed(user);
    accessCache = { uid: user.uid, isAllowed };
    return createSessionPayload(user, isAllowed);
  }

  return {
    key: "firestore",
    async getSession() {
      try {
        const user = await authReadyPromise;
        return await buildSession(user);
      } catch (error) {
        throw toFirestoreRepositoryError("read", error);
      }
    },
    subscribeSession(listener) {
      return subscribeAuthSession(async (user) => {
        try {
          listener(await buildSession(user));
        } catch (error) {
          console.error(error);
          listener(createSessionPayload(user, false));
        }
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
      rememberRevision(null);
      accessCache = { uid: null, isAllowed: false };
      await signOut(auth);
    },
    async load() {
      try {
        const user = await requireAuthorizedUser();
        accessCache = { uid: user.uid, isAllowed: true };
        const snapshot = await getDoc(eventHubDoc);

        if (!snapshot.exists()) {
          const seedEvents = await loadSeedEvents();
          await setDoc(eventHubDoc, {
            revision: 1,
            updatedAt: new Date().toISOString(),
            events: seedEvents
          });
          rememberRevision(1);
          return normalizeEvents(seedEvents);
        }

        const payload = snapshot.data();
        rememberRevision(Number(payload?.revision || 0));
        return normalizeEvents(Array.isArray(payload?.events) ? payload.events : []);
      } catch (error) {
        throw toFirestoreRepositoryError("read", error);
      }
    },
    async save(events) {
      const normalizedEvents = normalizeEvents(events);

      try {
        const user = await requireAuthorizedUser();
        accessCache = { uid: user.uid, isAllowed: true };
        let nextRevision = null;
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(eventHubDoc);
          const currentRevision = snapshot.exists() ? Number(snapshot.data()?.revision || 0) : 0;

          if (knownRevision !== null && currentRevision !== knownRevision) {
            const conflictError = new Error("Remote document revision changed");
            conflictError.code = "revision-conflict";
            throw conflictError;
          }

          nextRevision = currentRevision + 1;
          transaction.set(eventHubDoc, {
            revision: nextRevision,
            updatedAt: new Date().toISOString(),
            events: normalizedEvents
          });
        });
        rememberRevision(nextRevision);
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
