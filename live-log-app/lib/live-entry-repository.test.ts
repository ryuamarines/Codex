import { describe, expect, it } from "vitest";
import {
  createLocalStorageLiveEntryRepository,
  createScopedEntriesStorageKey
} from "@/lib/live-entry-repository";
import { STORAGE_KEY } from "@/lib/live-entry-utils";
import type { LiveEntry } from "@/lib/types";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function createEntry(id: string): LiveEntry {
  return {
    id,
    title: id,
    date: "2026-01-01",
    place: "",
    venue: "Test Hall",
    artists: ["Test Artist"],
    genre: "",
    memo: "",
    images: []
  };
}

describe("scoped local entry storage", () => {
  it("migrates legacy records only to their last synced user", async () => {
    const storage = new MemoryStorage();
    const legacyEntry = createEntry("legacy");
    storage.setItem(STORAGE_KEY, JSON.stringify([legacyEntry]));
    storage.setItem("live-log-cloud-sync-user", "owner-user");

    const ownerEntries = await createLocalStorageLiveEntryRepository(
      storage,
      "owner-user"
    ).load([]);
    const otherEntries = await createLocalStorageLiveEntryRepository(
      storage,
      "other-user"
    ).load([]);

    expect(ownerEntries).toEqual([legacyEntry]);
    expect(otherEntries).toEqual([]);
    expect(storage.getItem(createScopedEntriesStorageKey("owner-user"))).not.toBeNull();
    expect(storage.getItem(createScopedEntriesStorageKey("other-user"))).toBeNull();
  });

  it("keeps records for different users in separate keys", async () => {
    const storage = new MemoryStorage();
    const ownerRepository = createLocalStorageLiveEntryRepository(storage, "owner-user");
    const otherRepository = createLocalStorageLiveEntryRepository(storage, "other-user");

    await ownerRepository.save([createEntry("owner-entry")]);
    await otherRepository.save([createEntry("other-entry")]);

    expect((await ownerRepository.load([])).map((entry) => entry.id)).toEqual(["owner-entry"]);
    expect((await otherRepository.load([])).map((entry) => entry.id)).toEqual(["other-entry"]);
  });
});
