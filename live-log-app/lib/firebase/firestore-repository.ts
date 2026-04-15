import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch
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

const ARCHIVE_COLLECTION = "liveLogArchives";
const ENTRIES_SUBCOLLECTION = "entries";

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
        settings: normalizeCloudDriveSettings(undefined)
      };
    }

    const data = snapshot.data();
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
      settings: normalizeCloudDriveSettings(data.settings as CloudDriveSettings | undefined)
    };
  }

  async save(
    user: Pick<User, "uid" | "displayName" | "email">,
    entries: LiveEntry[],
    settings?: CloudDriveSettings
  ) {
    const db = getFirebaseDb();

    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const archiveRef = doc(db, ARCHIVE_COLLECTION, user.uid);
    const archiveSnapshot = await getDoc(archiveRef);
    const entriesCollectionRef = collection(archiveRef, ENTRIES_SUBCOLLECTION);
    const existingEntrySnapshots = await getDocs(entriesCollectionRef);
    const existingEntryIds = new Set(existingEntrySnapshots.docs.map((snapshot) => snapshot.id));
    const nextEntryIds = new Set(entries.map((entry) => entry.id));
    const batch = writeBatch(db);

    batch.set(
      archiveRef,
      {
        settings: normalizeCloudDriveSettings(settings),
        updatedAt: serverTimestamp(),
        owner: {
          displayName: user.displayName ?? null,
          email: user.email ?? null
        }
      },
      { merge: true }
    );

    for (const entry of sanitizeEntries(entries)) {
      batch.set(
        doc(entriesCollectionRef, entry.id),
        {
          ...serializeEntryForCloud(entry),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }

    for (const existingEntryId of existingEntryIds) {
      if (!nextEntryIds.has(existingEntryId)) {
        batch.delete(doc(entriesCollectionRef, existingEntryId));
      }
    }

    if (archiveSnapshot.exists()) {
      batch.update(archiveRef, {
        entries: deleteField()
      });
    }

    await batch.commit();
  }
}
