import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import type { User } from "firebase/auth";
import type { LiveEntry } from "@/lib/types";
import { getFirebaseDb } from "@/lib/firebase/client";
import { recoverInterruptedImageSync, sanitizeEntries } from "@/lib/live-entry-utils";
import {
  type CloudDriveSettings,
  deserializeEntryFromCloud,
  deserializeEntriesFromCloud,
  normalizeCloudDriveSettings,
  serializeEntryForCloud,
  toCloudEntryDocumentId
} from "@/lib/live-image-cloud-metadata";
import { CloudConflictError } from "@/lib/live-cloud-service";
import { includeLegacyEntriesForMigration } from "@/lib/live-cloud-changes";

const ARCHIVE_COLLECTION = "liveLogArchives";
const ENTRIES_SUBCOLLECTION = "entries";
const MAX_TRANSACTION_ENTRY_WRITES = 300;

type ArchiveDocument = {
  settings?: CloudDriveSettings;
  revision?: number;
  entryIds?: string[];
  updatedAt?: Timestamp;
  entries?: LiveEntry[];
};

type EntryChanges = {
  upserts: LiveEntry[];
  deleteEntryIds: string[];
  entryIds: string[];
};

type EntryMutation =
  | { type: "upsert"; entry: LiveEntry }
  | { type: "delete"; entryId: string };

export class FirestoreLiveEntryRepository {
  async load(user: Pick<User, "uid">) {
    const db = getFirebaseDb();

    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const archiveRef = doc(db, ARCHIVE_COLLECTION, user.uid);
    const snapshot = await getDoc(archiveRef);
    const entrySnapshots = await getDocs(collection(archiveRef, ENTRIES_SUBCOLLECTION));

    if (!snapshot.exists()) {
      return {
        entries: recoverInterruptedImageSync(sanitizeEntries(
          entrySnapshots.docs.map((entrySnapshot) =>
            deserializeEntryFromCloud({
              ...(entrySnapshot.data() as ReturnType<typeof serializeEntryForCloud>),
              id: (entrySnapshot.data() as { id?: string })?.id ?? decodeURIComponent(entrySnapshot.id)
            })
          )
        )),
        settings: normalizeCloudDriveSettings(undefined),
        revision: 0
      };
    }

    const data = snapshot.data() as ArchiveDocument;
    const collectionEntries = entrySnapshots.docs.map((entrySnapshot) =>
      deserializeEntryFromCloud({
        ...(entrySnapshot.data() as ReturnType<typeof serializeEntryForCloud>),
        id: (entrySnapshot.data() as { id?: string })?.id ?? decodeURIComponent(entrySnapshot.id)
      })
    );
    const legacyEntries = deserializeEntriesFromCloud((data.entries ?? []) as LiveEntry[]);
    const collectionEntryIds = new Set(collectionEntries.map((entry) => entry.id));
    const mergedCollectionEntries = [
      ...collectionEntries,
      ...legacyEntries.filter((entry) => !collectionEntryIds.has(entry.id))
    ];
    const orderedCollectionEntries = orderEntriesFromArchive(data.entryIds, mergedCollectionEntries);

    return {
      entries:
        mergedCollectionEntries.length > 0 || Array.isArray(data.entryIds)
          ? recoverInterruptedImageSync(sanitizeEntries(orderedCollectionEntries))
          : recoverInterruptedImageSync(
              sanitizeEntries(legacyEntries)
            ),
      settings: normalizeCloudDriveSettings(data.settings as CloudDriveSettings | undefined),
      revision: typeof data.revision === "number" ? data.revision : 0
    };
  }

  async save(
    user: Pick<User, "uid" | "displayName" | "email">,
    entries: LiveEntry[],
    settings?: CloudDriveSettings,
    expectedRevision?: number
  ) {
    const db = getFirebaseDb();

    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const sanitizedEntries = sanitizeEntries(entries);
    const archiveRef = doc(db, ARCHIVE_COLLECTION, user.uid);
    const archiveSnapshot = await getDoc(archiveRef);
    const archiveData = archiveSnapshot.exists() ? (archiveSnapshot.data() as ArchiveDocument) : undefined;
    const previousEntryIds = readArchiveEntryIds(archiveData);
    const nextEntryIds = sanitizedEntries.map((entry) => entry.id);
    const nextEntryIdSet = new Set(nextEntryIds);

    return this.applyChanges(
      user,
      {
        upserts: sanitizedEntries,
        deleteEntryIds: previousEntryIds.filter((entryId) => !nextEntryIdSet.has(entryId)),
        entryIds: nextEntryIds
      },
      settings,
      expectedRevision
    );
  }

  async applyChanges(
    user: Pick<User, "uid" | "displayName" | "email">,
    changes: EntryChanges,
    settings?: CloudDriveSettings,
    expectedRevision?: number
  ) {
    const db = getFirebaseDb();

    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const archiveRef = doc(db, ARCHIVE_COLLECTION, user.uid);
    const entriesCollectionRef = collection(archiveRef, ENTRIES_SUBCOLLECTION);
    const migrationSnapshot = await getDoc(archiveRef);
    const migrationArchiveData = migrationSnapshot.exists()
      ? (migrationSnapshot.data() as ArchiveDocument)
      : undefined;
    const hasLegacyEntries = Array.isArray(migrationArchiveData?.entries);
    const legacyEntries = hasLegacyEntries
      ? sanitizeEntries(deserializeEntriesFromCloud(migrationArchiveData.entries ?? []))
      : [];
    const migrationSafeChanges = hasLegacyEntries
      ? includeLegacyEntriesForMigration(
          {
            ...changes,
            upserts: sanitizeEntries(changes.upserts)
          },
          legacyEntries
        )
      : changes;
    const sanitizedUpserts = sanitizeEntries(migrationSafeChanges.upserts);
    const upsertIds = new Set(sanitizedUpserts.map((entry) => entry.id));
    const deleteEntryIds = Array.from(
      new Set(migrationSafeChanges.deleteEntryIds.filter((entryId) => !upsertIds.has(entryId)))
    );
    const mutations: EntryMutation[] = [
      ...sanitizedUpserts.map((entry): EntryMutation => ({ type: "upsert", entry })),
      ...deleteEntryIds.map((entryId): EntryMutation => ({ type: "delete", entryId }))
    ];

    if (mutations.length === 0) {
      return this.saveSettings(user, settings, expectedRevision);
    }

    let nextExpectedRevision =
      expectedRevision ??
      (hasLegacyEntries
        ? typeof migrationArchiveData?.revision === "number"
          ? migrationArchiveData.revision
          : 0
        : undefined);
    let completedRevision = expectedRevision ?? 0;

    for (let offset = 0; offset < mutations.length; offset += MAX_TRANSACTION_ENTRY_WRITES) {
      const chunk = mutations.slice(offset, offset + MAX_TRANSACTION_ENTRY_WRITES);
      const isFinalChunk = offset + chunk.length >= mutations.length;
      const result = await runTransaction(db, async (transaction) => {
        const archiveSnapshot = await transaction.get(archiveRef);
        const archiveData = archiveSnapshot.exists()
          ? (archiveSnapshot.data() as ArchiveDocument)
          : undefined;
        const currentRevision = typeof archiveData?.revision === "number" ? archiveData.revision : 0;

        if (nextExpectedRevision !== undefined && currentRevision !== nextExpectedRevision) {
          throw new CloudConflictError();
        }

        const activeEntryIds = new Set(readArchiveEntryIds(archiveData));

        for (const mutation of chunk) {
          if (mutation.type === "upsert") {
            activeEntryIds.add(mutation.entry.id);
          } else {
            activeEntryIds.delete(mutation.entryId);
          }
        }

        const orderedEntryIds = orderActiveEntryIds(
          migrationSafeChanges.entryIds,
          readArchiveEntryIds(archiveData),
          activeEntryIds
        );
        const archiveUpdate: Record<string, unknown> = {
          settings: normalizeCloudDriveSettings(settings ?? archiveData?.settings),
          revision: currentRevision + 1,
          entryIds: orderedEntryIds,
          updatedAt: serverTimestamp(),
          owner: {
            displayName: user.displayName ?? null,
            email: user.email ?? null
          }
        };

        if (archiveSnapshot.exists() && isFinalChunk) {
          archiveUpdate.entries = deleteField();
        }

        transaction.set(archiveRef, archiveUpdate, { merge: true });

        for (const mutation of chunk) {
          if (mutation.type === "upsert") {
            transaction.set(
              doc(entriesCollectionRef, toCloudEntryDocumentId(mutation.entry.id)),
              {
                ...serializeEntryForCloud(mutation.entry),
                updatedAt: serverTimestamp()
              }
            );
          } else {
            transaction.delete(doc(entriesCollectionRef, toCloudEntryDocumentId(mutation.entryId)));
          }
        }

        return { revision: currentRevision + 1 };
      });

      completedRevision = result.revision;
      nextExpectedRevision = result.revision;
    }

    return { revision: completedRevision };
  }

  async upsertEntry(
    user: Pick<User, "uid" | "displayName" | "email">,
    entry: LiveEntry,
    settings?: CloudDriveSettings,
    expectedRevision?: number
  ) {
    const db = getFirebaseDb();

    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const archiveRef = doc(db, ARCHIVE_COLLECTION, user.uid);
    const sanitizedEntry = sanitizeEntries([entry])[0];

    return runTransaction(db, async (transaction) => {
      const archiveSnapshot = await transaction.get(archiveRef);
      const archiveData = archiveSnapshot.exists() ? (archiveSnapshot.data() as ArchiveDocument) : undefined;
      const currentRevision = typeof archiveData?.revision === "number" ? archiveData.revision : 0;

      if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
        throw new CloudConflictError();
      }

      const previousEntryIds = readArchiveEntryIds(archiveData);
      const nextEntryIds = previousEntryIds.includes(sanitizedEntry.id)
        ? previousEntryIds
        : [...previousEntryIds, sanitizedEntry.id];
      const entriesCollectionRef = collection(archiveRef, ENTRIES_SUBCOLLECTION);

      transaction.set(
        archiveRef,
        {
          settings: normalizeCloudDriveSettings(settings),
          revision: currentRevision + 1,
          entryIds: nextEntryIds,
          updatedAt: serverTimestamp(),
          owner: {
            displayName: user.displayName ?? null,
            email: user.email ?? null
          }
        },
        { merge: true }
      );

      transaction.set(
        doc(entriesCollectionRef, toCloudEntryDocumentId(sanitizedEntry.id)),
        {
          ...serializeEntryForCloud(sanitizedEntry),
          updatedAt: serverTimestamp()
        }
      );

      return {
        revision: currentRevision + 1
      };
    });
  }

  async deleteEntry(
    user: Pick<User, "uid" | "displayName" | "email">,
    entryId: string,
    settings?: CloudDriveSettings,
    expectedRevision?: number
  ) {
    const db = getFirebaseDb();

    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const archiveRef = doc(db, ARCHIVE_COLLECTION, user.uid);

    return runTransaction(db, async (transaction) => {
      const archiveSnapshot = await transaction.get(archiveRef);
      const archiveData = archiveSnapshot.exists() ? (archiveSnapshot.data() as ArchiveDocument) : undefined;
      const currentRevision = typeof archiveData?.revision === "number" ? archiveData.revision : 0;

      if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
        throw new CloudConflictError();
      }

      const previousEntryIds = readArchiveEntryIds(archiveData);
      const nextEntryIds = previousEntryIds.filter((value) => value !== entryId);
      const entriesCollectionRef = collection(archiveRef, ENTRIES_SUBCOLLECTION);

      transaction.set(
        archiveRef,
        {
          settings: normalizeCloudDriveSettings(settings),
          revision: currentRevision + 1,
          entryIds: nextEntryIds,
          updatedAt: serverTimestamp(),
          owner: {
            displayName: user.displayName ?? null,
            email: user.email ?? null
          }
        },
        { merge: true }
      );

      transaction.delete(doc(entriesCollectionRef, toCloudEntryDocumentId(entryId)));

      return {
        revision: currentRevision + 1
      };
    });
  }

  async saveSettings(
    user: Pick<User, "uid" | "displayName" | "email">,
    settings?: CloudDriveSettings,
    expectedRevision?: number
  ) {
    const db = getFirebaseDb();

    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const archiveRef = doc(db, ARCHIVE_COLLECTION, user.uid);

    return runTransaction(db, async (transaction) => {
      const archiveSnapshot = await transaction.get(archiveRef);
      const archiveData = archiveSnapshot.exists() ? (archiveSnapshot.data() as ArchiveDocument) : undefined;
      const currentRevision = typeof archiveData?.revision === "number" ? archiveData.revision : 0;

      if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
        throw new CloudConflictError();
      }

      const previousEntryIds = readArchiveEntryIds(archiveData);

      transaction.set(
        archiveRef,
        {
          settings: normalizeCloudDriveSettings(settings),
          revision: currentRevision + 1,
          entryIds: previousEntryIds,
          updatedAt: serverTimestamp(),
          owner: {
            displayName: user.displayName ?? null,
            email: user.email ?? null
          }
        },
        { merge: true }
      );

      return {
        revision: currentRevision + 1
      };
    });
  }
}

function readArchiveEntryIds(archiveData: ArchiveDocument | undefined) {
  if (Array.isArray(archiveData?.entryIds)) {
    return archiveData.entryIds.filter((value): value is string => typeof value === "string");
  }

  if (Array.isArray(archiveData?.entries)) {
    return sanitizeEntries(archiveData.entries).map((entry) => entry.id);
  }

  return [];
}

function orderEntriesFromArchive(entryIds: string[] | undefined, entries: LiveEntry[]) {
  if (!Array.isArray(entryIds)) {
    return entries;
  }

  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  return entryIds
    .map((entryId) => entriesById.get(entryId))
    .filter((entry): entry is LiveEntry => Boolean(entry));
}

function orderActiveEntryIds(
  desiredEntryIds: string[],
  previousEntryIds: string[],
  activeEntryIds: Set<string>
) {
  const orderedIds: string[] = [];
  const includedIds = new Set<string>();

  for (const entryId of [...desiredEntryIds, ...previousEntryIds, ...activeEntryIds]) {
    if (!activeEntryIds.has(entryId) || includedIds.has(entryId)) {
      continue;
    }

    includedIds.add(entryId);
    orderedIds.push(entryId);
  }

  return orderedIds;
}
