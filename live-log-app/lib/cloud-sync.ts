import type { LiveEntry } from "@/lib/types";
import { createCloudComparableEntries } from "@/lib/live-image-cloud-metadata";

export const CLOUD_SYNC_HASH_KEY = "live-log-cloud-sync-hash";
export const CLOUD_SYNC_USER_KEY = "live-log-cloud-sync-user";
export const CLOUD_SYNC_AT_KEY = "live-log-cloud-sync-at";

export function hashEntries(entries: LiveEntry[]) {
  return JSON.stringify(createCloudComparableEntries(entries));
}

export function readCloudSyncState(storage: Storage) {
  return {
    hash: storage.getItem(CLOUD_SYNC_HASH_KEY) ?? "",
    userId: storage.getItem(CLOUD_SYNC_USER_KEY) ?? "",
    syncedAt: storage.getItem(CLOUD_SYNC_AT_KEY) ?? ""
  };
}

export function writeCloudSyncState(storage: Storage, userId: string, entries: LiveEntry[]) {
  const hash = hashEntries(entries);
  const syncedAt = new Date().toISOString();
  storage.setItem(CLOUD_SYNC_HASH_KEY, hash);
  storage.setItem(CLOUD_SYNC_USER_KEY, userId);
  storage.setItem(CLOUD_SYNC_AT_KEY, syncedAt);
  return hash;
}

export function hasUnsyncedLocalChanges(
  storage: Storage,
  userId: string,
  currentEntries: LiveEntry[],
  sampleEntries: LiveEntry[]
) {
  const currentHash = hashEntries(currentEntries);
  const sampleHash = hashEntries(sampleEntries);
  const syncState = readCloudSyncState(storage);

  return currentHash !== syncState.hash && currentHash !== sampleHash && syncState.userId === userId;
}

export function hasLocalOnlyImages(entries: LiveEntry[]) {
  return entries.some((entry) =>
    entry.images.some((image) =>
      image.storageStatus === "local_pending" ||
      image.storageStatus === "syncing" ||
      image.storageStatus === "error"
    )
  );
}
