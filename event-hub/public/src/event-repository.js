import { normalizeEvent } from "./models.js";
import { resolveDataBackend } from "./app-config.js";
import { parseEventsCsv, serializeEventsToCsv } from "./csv-transfer.js";
import { db, eventHubDoc, getDoc, runTransaction, setDoc } from "./firebase-client.js";

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

function toFirestoreRepositoryError(action, error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "permission-denied"
  ) {
    return new Error(
      action === "read"
        ? "Firestore の読込権限がありません。eventHub/appState を読める Rules になっているか確認してください。"
        : "Firestore の保存権限がありません。eventHub/appState を書ける Rules になっているか確認してください。"
    );
  }

  return new Error(
    action === "read"
      ? "Firestore からの読込に失敗しました。接続設定かルールを確認してください。"
      : "Firestore への保存に失敗しました。接続設定かルールを確認してください。"
  );
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
      return {
        authRequired: false,
        backendLabel: "Firestore / Vercel",
        user: null,
        isAllowed: true
      };
    },
    async load() {
      try {
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
