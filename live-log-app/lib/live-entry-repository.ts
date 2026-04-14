import type { LiveEntry } from "@/lib/types";
import { sanitizeEntries, STORAGE_KEY } from "@/lib/live-entry-utils";

export interface LiveEntryRepository {
  load(fallbackEntries: LiveEntry[]): Promise<LiveEntry[]>;
  save(entries: LiveEntry[]): Promise<void>;
}

export class LocalStorageLiveEntryRepository implements LiveEntryRepository {
  constructor(private readonly storage: Storage) {}

  async load(fallbackEntries: LiveEntry[]) {
    return loadEntriesFromStorage(this.storage, fallbackEntries);
  }

  async save(entries: LiveEntry[]) {
    saveEntriesToStorage(this.storage, entries);
  }
}

export function createLocalStorageLiveEntryRepository(storage: Storage) {
  return new LocalStorageLiveEntryRepository(storage);
}

export function loadEntriesFromStorage(storage: Storage, fallbackEntries: LiveEntry[]) {
  const saved = storage.getItem(STORAGE_KEY);

  if (!saved) {
    return sanitizeEntries(fallbackEntries);
  }

  try {
    const parsed = JSON.parse(saved) as LiveEntry[];
    return sanitizeEntries(parsed);
  } catch {
    storage.removeItem(STORAGE_KEY);
    return sanitizeEntries(fallbackEntries);
  }
}

export function saveEntriesToStorage(storage: Storage, entries: LiveEntry[]) {
  storage.setItem(STORAGE_KEY, JSON.stringify(entries));
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
