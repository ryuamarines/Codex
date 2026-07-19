import type { LiveEntry } from "@/lib/types";
import { recoverInterruptedImageSync, sanitizeEntries, STORAGE_KEY } from "@/lib/live-entry-utils";

const CORRUPT_BACKUP_PREFIX = `${STORAGE_KEY}.corrupt`;
const CLOUD_SYNC_USER_KEY = "live-log-cloud-sync-user";
const INDEXED_DB_NAME = "live-log";
const INDEXED_DB_STORE = "archives";
const INDEXED_DB_VERSION = 1;
const LOCAL_BACKUP_SIZE_LIMIT = 1_500_000;

export interface LiveEntryRepository {
  load(fallbackEntries: LiveEntry[]): Promise<LiveEntry[]>;
  save(entries: LiveEntry[]): Promise<void>;
}

export class LocalStorageLiveEntryRepository implements LiveEntryRepository {
  constructor(
    private readonly storage: Storage,
    private readonly storageKey = STORAGE_KEY,
    private readonly legacyStorageKey?: string
  ) {}

  async load(fallbackEntries: LiveEntry[]) {
    const scopedEntries = loadEntriesFromStorage(
      this.storage,
      fallbackEntries,
      this.storageKey
    );

    if (this.storage.getItem(this.storageKey) || !this.legacyStorageKey) {
      return scopedEntries;
    }

    const legacyEntries = loadEntriesFromStorage(
      this.storage,
      fallbackEntries,
      this.legacyStorageKey
    );

    if (this.storage.getItem(this.legacyStorageKey)) {
      try {
        saveEntriesToStorage(this.storage, legacyEntries, this.storageKey);
      } catch {
        // The caller can still migrate the loaded records to IndexedDB.
      }
    }

    return legacyEntries;
  }

  async save(entries: LiveEntry[]) {
    saveEntriesToStorage(this.storage, entries, this.storageKey);
  }
}

class BrowserLiveEntryRepository implements LiveEntryRepository {
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storageKey: string,
    private readonly fallbackRepository: LiveEntryRepository
  ) {}

  async load(fallbackEntries: LiveEntry[]) {
    try {
      const indexedEntries = await readEntriesFromIndexedDb(this.storageKey);

      if (indexedEntries) {
        return recoverInterruptedImageSync(sanitizeEntries(indexedEntries));
      }
    } catch {
      // Local storage remains available when IndexedDB is blocked or unavailable.
    }

    const fallback = await this.fallbackRepository.load(fallbackEntries);

    try {
      await writeEntriesToIndexedDb(this.storageKey, fallback);
    } catch {
      // The legacy repository already contains the data.
    }

    return fallback;
  }

  save(entries: LiveEntry[]) {
    const sanitizedEntries = sanitizeEntries(entries);
    const queuedSave = this.saveQueue.then(
      () => this.saveImmediately(sanitizedEntries),
      () => this.saveImmediately(sanitizedEntries)
    );
    this.saveQueue = queuedSave.catch(() => undefined);
    return queuedSave;
  }

  private async saveImmediately(sanitizedEntries: LiveEntry[]) {
    try {
      await writeEntriesToIndexedDb(this.storageKey, sanitizedEntries);

      if (JSON.stringify(sanitizedEntries).length <= LOCAL_BACKUP_SIZE_LIMIT) {
        await this.fallbackRepository.save(sanitizedEntries);
      }
      return;
    } catch {
      await this.fallbackRepository.save(sanitizedEntries);
    }
  }
}

export function createLocalStorageLiveEntryRepository(storage: Storage, userId?: string) {
  const storageKey = createScopedEntriesStorageKey(userId);
  const lastSyncedUserId = storage.getItem(CLOUD_SYNC_USER_KEY) ?? "";
  const canMigrateLegacyData = userId
    ? !lastSyncedUserId || lastSyncedUserId === userId
    : !lastSyncedUserId;

  return new LocalStorageLiveEntryRepository(
    storage,
    storageKey,
    canMigrateLegacyData ? STORAGE_KEY : undefined
  );
}

export function createBrowserLiveEntryRepository(storage: Storage, userId?: string) {
  const storageKey = createScopedEntriesStorageKey(userId);
  const fallbackRepository = createLocalStorageLiveEntryRepository(storage, userId);
  return new BrowserLiveEntryRepository(storageKey, fallbackRepository);
}

export function createScopedEntriesStorageKey(userId?: string) {
  return userId ? `${STORAGE_KEY}.user.${userId}` : `${STORAGE_KEY}.anonymous`;
}

export function loadEntriesFromStorage(
  storage: Storage,
  fallbackEntries: LiveEntry[],
  storageKey = STORAGE_KEY
) {
  const saved = storage.getItem(storageKey);

  if (!saved) {
    return sanitizeEntries(fallbackEntries);
  }

  try {
    const parsed = JSON.parse(saved) as LiveEntry[];
    return recoverInterruptedImageSync(sanitizeEntries(parsed));
  } catch {
    preserveCorruptStorageValue(storage, saved, storageKey);
    storage.removeItem(storageKey);
    return sanitizeEntries(fallbackEntries);
  }
}

export function saveEntriesToStorage(
  storage: Storage,
  entries: LiveEntry[],
  storageKey = STORAGE_KEY
) {
  storage.setItem(storageKey, JSON.stringify(entries));
}

function preserveCorruptStorageValue(storage: Storage, value: string, storageKey: string) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPrefix = storageKey === STORAGE_KEY ? CORRUPT_BACKUP_PREFIX : `${storageKey}.corrupt`;
    storage.setItem(`${backupPrefix}.${timestamp}`, value);
  } catch {
    // If storage is full or unavailable, fall back to resetting the active key.
  }
}

function openLiveLogDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(INDEXED_DB_STORE)) {
        database.createObjectStore(INDEXED_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked."));
  });
}

async function readEntriesFromIndexedDb(storageKey: string) {
  const database = await openLiveLogDatabase();

  try {
    return await new Promise<LiveEntry[] | null>((resolve, reject) => {
      const transaction = database.transaction(INDEXED_DB_STORE, "readonly");
      const request = transaction.objectStore(INDEXED_DB_STORE).get(storageKey);
      request.onsuccess = () => {
        const value = request.result as { entries?: LiveEntry[] } | undefined;
        resolve(Array.isArray(value?.entries) ? value.entries : null);
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB read aborted."));
    });
  } finally {
    database.close();
  }
}

async function writeEntriesToIndexedDb(storageKey: string, entries: LiveEntry[]) {
  const database = await openLiveLogDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INDEXED_DB_STORE, "readwrite");
      transaction.objectStore(INDEXED_DB_STORE).put(
        {
          entries,
          updatedAt: new Date().toISOString()
        },
        storageKey
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted."));
    });
  } finally {
    database.close();
  }
}

export function exportEntriesToCsv(entries: LiveEntry[]) {
  const sanitizedEntries = sanitizeEntries(entries);
  const header = [
    "date",
    "event_title",
    "venue",
    "venues_raw",
    "area",
    "artists",
    "event_type",
    "notes"
  ];

  const rows = sanitizedEntries.map((entry) => [
    entry.date,
    entry.title,
    entry.venue,
    "",
    entry.place,
    entry.artists.join(" / "),
    serializeEventType(entry.genre),
    entry.memo
  ]);

  return [header, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
}

function serializeEventType(genre: string) {
  const normalized = genre.trim().toLowerCase();

  if (!normalized) {
    return "normal";
  }

  if (normalized === "フェス") {
    return "festival";
  }

  return normalized;
}

function escapeCsvValue(value: string) {
  if (value.includes('"')) {
    value = value.replaceAll('"', '""');
  }

  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value}"`;
  }

  return value;
}
