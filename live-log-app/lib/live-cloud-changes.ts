import { createCloudComparableEntries } from "@/lib/live-image-cloud-metadata";
import type { LiveEntry } from "@/lib/types";

export type CloudEntryChanges = {
  upserts: LiveEntry[];
  deleteEntryIds: string[];
  entryIds: string[];
};

export type RebasedCloudEntryChanges = {
  changes: CloudEntryChanges;
  entries: LiveEntry[];
  conflictingEntryIds: string[];
};

export function createCloudEntryChanges(
  previousEntries: LiveEntry[],
  nextEntries: LiveEntry[]
): CloudEntryChanges {
  const previousById = new Map(previousEntries.map((entry) => [entry.id, entry]));
  const nextIds = new Set(nextEntries.map((entry) => entry.id));

  return {
    upserts: nextEntries.filter((entry) => {
      const previousEntry = previousById.get(entry.id);
      return !previousEntry || !areCloudEntriesEqual(previousEntry, entry);
    }),
    deleteEntryIds: previousEntries
      .filter((entry) => !nextIds.has(entry.id))
      .map((entry) => entry.id),
    entryIds: nextEntries.map((entry) => entry.id)
  };
}

export function hasCloudEntryChanges(changes: CloudEntryChanges) {
  return changes.upserts.length > 0 || changes.deleteEntryIds.length > 0;
}

export function includeLegacyEntriesForMigration(
  changes: CloudEntryChanges,
  legacyEntries: LiveEntry[]
): CloudEntryChanges {
  const activeEntryIds = new Set(changes.entryIds);
  const deletedEntryIds = new Set(changes.deleteEntryIds);
  const upsertsById = new Map<string, LiveEntry>();

  for (const entry of legacyEntries) {
    if (activeEntryIds.has(entry.id) && !deletedEntryIds.has(entry.id)) {
      upsertsById.set(entry.id, entry);
    }
  }

  for (const entry of changes.upserts) {
    if (activeEntryIds.has(entry.id) && !deletedEntryIds.has(entry.id)) {
      upsertsById.set(entry.id, entry);
    }
  }

  return {
    ...changes,
    upserts: Array.from(upsertsById.values())
  };
}

export function rebaseCloudEntryChanges(
  baseEntries: LiveEntry[],
  localEntries: LiveEntry[],
  latestCloudEntries: LiveEntry[]
): RebasedCloudEntryChanges {
  const localChanges = createCloudEntryChanges(baseEntries, localEntries);
  const baseById = new Map(baseEntries.map((entry) => [entry.id, entry]));
  const localById = new Map(localEntries.map((entry) => [entry.id, entry]));
  const latestById = new Map(latestCloudEntries.map((entry) => [entry.id, entry]));
  const conflictingEntryIds: string[] = [];

  for (const entry of localChanges.upserts) {
    const baseEntry = baseById.get(entry.id);
    const latestEntry = latestById.get(entry.id);

    if (latestEntry && areCloudEntriesEqual(latestEntry, entry)) {
      continue;
    }

    if (
      (baseEntry && latestEntry && areCloudEntriesEqual(baseEntry, latestEntry)) ||
      (!baseEntry && !latestEntry)
    ) {
      latestById.set(entry.id, entry);
      continue;
    }

    conflictingEntryIds.push(entry.id);
  }

  for (const entryId of localChanges.deleteEntryIds) {
    const baseEntry = baseById.get(entryId);
    const latestEntry = latestById.get(entryId);

    if (!latestEntry) {
      continue;
    }

    if (baseEntry && areCloudEntriesEqual(baseEntry, latestEntry)) {
      latestById.delete(entryId);
      continue;
    }

    conflictingEntryIds.push(entryId);
  }

  if (conflictingEntryIds.length > 0) {
    return {
      changes: {
        upserts: [],
        deleteEntryIds: [],
        entryIds: latestCloudEntries.map((entry) => entry.id)
      },
      entries: latestCloudEntries,
      conflictingEntryIds
    };
  }

  const localOrder = localEntries.map((entry) => entry.id);
  const localIds = new Set(localOrder);
  const remoteOnlyOrder = latestCloudEntries
    .map((entry) => entry.id)
    .filter((entryId) => !localIds.has(entryId) && latestById.has(entryId));
  const mergedEntries = [...localOrder, ...remoteOnlyOrder]
    .map((entryId) => latestById.get(entryId) ?? localById.get(entryId))
    .filter((entry): entry is LiveEntry => Boolean(entry));

  return {
    changes: createCloudEntryChanges(latestCloudEntries, mergedEntries),
    entries: mergedEntries,
    conflictingEntryIds: []
  };
}

function areCloudEntriesEqual(left: LiveEntry, right: LiveEntry) {
  return cloudEntryFingerprint(left) === cloudEntryFingerprint(right);
}

function cloudEntryFingerprint(entry: LiveEntry) {
  return JSON.stringify(createCloudComparableEntries([entry])[0]);
}
