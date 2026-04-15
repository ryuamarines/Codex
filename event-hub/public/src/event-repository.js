import { normalizeEvent } from "./models.js";
import { APP_RUNTIME, FIRESTORE_COLLECTIONS, FIRESTORE_DOCUMENTS } from "./firebase-config.js";
import { getFirebaseClient } from "./firebase-client.js";
import { parseEventsCsv, serializeEventsToCsv } from "./csv-transfer.js";

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

function sanitizeForFirestore(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createLocalApiEventRepository() {
  return {
    key: "local-api",
    async getSession() {
      return {
        authRequired: false,
        backendLabel: "Local API / JSON",
        user: null,
        isAllowed: true
      };
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

export async function createFirebaseEventRepository() {
  const client = await getFirebaseClient();
  const collectionName = FIRESTORE_COLLECTIONS.events;
  const collectionRef = client.db.collection(collectionName);
  const appCollectionRef = client.db.collection(FIRESTORE_COLLECTIONS.appState);
  const eventsMetaRef = appCollectionRef.doc(FIRESTORE_DOCUMENTS.eventsMeta);
  const legacyStateRef = appCollectionRef.doc(FIRESTORE_DOCUMENTS.legacyEventsState);
  const authIsOptional = APP_RUNTIME.requireLogin === false;
  let loadedRevision = 0;
  let loadedEventIds = new Set();

  async function loadCollectionEvents() {
    const snapshot = await collectionRef.get();
    loadedEventIds = new Set(snapshot.docs.map((doc) => doc.id));
    return normalizeEvents(snapshot.docs.map((doc) => doc.data()));
  }

  async function loadLegacyEventsState() {
    const doc = await legacyStateRef.get();

    if (!doc.exists) {
      return null;
    }

    const payload = doc.data() || {};
    const hasEventsArray = Array.isArray(payload.events);
    const looksLikeStateDocument =
      hasEventsArray &&
      (Object.prototype.hasOwnProperty.call(payload, "revision") || Object.prototype.hasOwnProperty.call(payload, "updatedAt"));

    if (!looksLikeStateDocument) {
      return null;
    }

    loadedRevision = Number(payload.revision || 0);
    const events = normalizeEvents(payload.events);
    loadedEventIds = new Set(events.map((event) => event.id));
    return events;
  }

  async function loadEventsMeta() {
    const doc = await eventsMetaRef.get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() || {};
  }

  async function requireAllowedUser() {
    if (authIsOptional) {
      return {
        authRequired: false,
        backendLabel: "Firebase / Firestore",
        user: null,
        isAllowed: true
      };
    }

    const session = await client.getSession();

    if (!session.user) {
      throw new Error("Firebase にログインしてください。");
    }

    if (!session.isAllowed) {
      await client.signOut();
      throw new Error("このアカウントは Event Hub の許可対象ではありません。");
    }

    return session;
  }

  return {
    key: "firebase",
    async getSession() {
      const session = await client.getSession();

      if (authIsOptional) {
        return {
          ...session,
          authRequired: false,
          isAllowed: true
        };
      }

      return session;
    },
    async signInWithGoogle() {
      const user = await client.signInWithGoogle();

      if (!client.isAllowedUser({ email: user?.email })) {
        await client.signOut();
        throw new Error("このGoogleアカウントは Event Hub の許可対象ではありません。");
      }

      return user;
    },
    async signInWithEmailPassword(email, password) {
      const user = await client.signInWithEmailPassword(email, password);

      if (!client.isAllowedUser({ email: user?.email })) {
        await client.signOut();
        throw new Error("このメールアドレスは Event Hub の許可対象ではありません。");
      }

      return user;
    },
    async signOut() {
      await client.signOut();
    },
    async load() {
      await requireAllowedUser();
      const [events, meta, legacyEvents] = await Promise.all([
        loadCollectionEvents(),
        loadEventsMeta(),
        loadLegacyEventsState()
      ]);

      if (meta) {
        loadedRevision = Number(meta?.revision || 0);
        loadedEventIds = new Set(events.map((event) => event.id));
        return events;
      }

      if (events.length) {
        loadedRevision = 0;
        loadedEventIds = new Set(events.map((event) => event.id));
        return events;
      }

      if (legacyEvents) {
        return legacyEvents;
      }

      loadedRevision = Number(meta?.revision || 0);
      loadedEventIds = new Set();
      return [];
    },
    async save(events) {
      await requireAllowedUser();
      const normalizedEvents = normalizeEvents(events);
      const nextEventIds = new Set(normalizedEvents.map((event) => event.id));

      await client.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(eventsMetaRef);
        const remoteRevision = doc.exists ? Number(doc.data()?.revision || 0) : 0;

        if (remoteRevision !== loadedRevision) {
          throw new Error("他の端末の更新が先に保存されました。再読み込みして内容を確認してください。");
        }

        normalizedEvents.forEach((event) => {
          transaction.set(collectionRef.doc(event.id), sanitizeForFirestore(event));
        });

        loadedEventIds.forEach((id) => {
          if (!nextEventIds.has(id)) {
            transaction.delete(collectionRef.doc(id));
          }
        });

        transaction.set(eventsMetaRef, {
          revision: remoteRevision + 1,
          updatedAt: new Date().toISOString()
        });
        transaction.delete(legacyStateRef);
      });

      loadedRevision += 1;
      loadedEventIds = nextEventIds;
      return normalizedEvents;
    },
    async reset() {
      await requireAllowedUser();
      const response = await fetch("/seed/default-events.json");

      if (!response.ok) {
        throw new Error("サンプルデータの取得に失敗しました。");
      }

      const events = normalizeEvents(await response.json());
      return this.save(events);
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
  if (APP_RUNTIME.dataBackend === "firebase") {
    return createFirebaseEventRepository();
  }

  return createLocalApiEventRepository();
}
