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
import { sanitizeEntries } from "@/lib/live-entry-utils";
import {
  type CloudDriveSettings,
  deserializeEntryFromCloud,
  deserializeEntriesFromCloud,
  normalizeCloudDriveSettings,
  serializeEntryForCloud
} from "@/lib/live-image-cloud-metadata";
import { CloudConflictError } from "@/lib/live-cloud-service";

const ARCHIVE_COLLECTION = "liveLogArchives";
const ENTRIES_SUBCOLLECTION = "entries";

type ArchiveDocument = {
  settings?: CloudDriveSettings;
  revision?: number;
  entryIds?: string[];
  updatedAt?: Timestamp;
  entries?: LiveEntry[];
};

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
        entries: sanitizeEntries(
          entrySnapshots.docs.map((entrySnapshot) =>
            deserializeEntryFromCloud({
              ...(entrySnapshot.data() as ReturnType<typeof serializeEntryForCloud>),
              id: entrySnapshot.id
            })
          )
        ),
        settings: normalizeCloudDriveSettings(undefined),
        revision: 0
      };
    }

    const data = snapshot.data() as ArchiveDocument;
    const collectionEntries = entrySnapshots.docs.map((entrySnapshot) =>
      deserializeEntryFromCloud({
        ...(entrySnapshot.data() as ReturnType<typeof serializeEntryForCloud>),
        id: entrySnapshot.id
      })
    );

    return {
      entries:
        collectionEntries.length > 0
          ? sanitizeEntries(collectionEntries)
          : sanitizeEntries(deserializeEntriesFromCloud((data.entries ?? []) as LiveEntry[])),
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

    const archiveRef = doc(db, ARCHIVE_COLLECTION, user.uid);
    const sanitizedEntries = sanitizeEntries(entries);

    return runTransaction(db, async (transaction) => {
      const archiveSnapshot = await transaction.get(archiveRef);
      const archiveData = archiveSnapshot.exists() ? (archiveSnapshot.data() as ArchiveDocument) : undefined;
      const currentRevision = typeof archiveData?.revision === "number" ? archiveData.revision : 0;

      if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
        throw new CloudConflictError();
      }

      const previousEntryIds = Array.isArray(archiveData?.entryIds)
        ? archiveData.entryIds.filter((value): value is string => typeof value === "string")
        : [];
      const nextEntryIds = sanitizedEntries.map((entry) => entry.id);
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

      if (archiveSnapshot.exists()) {
        transaction.update(archiveRef, {
          entries: deleteField()
        });
      }

      for (const entry of sanitizedEntries) {
        transaction.set(
          doc(entriesCollectionRef, entry.id),
          {
            ...serializeEntryForCloud(entry),
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      }

      for (const previousEntryId of previousEntryIds) {
        if (!nextEntryIds.includes(previousEntryId)) {
          transaction.delete(doc(entriesCollectionRef, previousEntryId));
        }
      }

      return {
        revision: currentRevision + 1
      };
    });
  }
}
