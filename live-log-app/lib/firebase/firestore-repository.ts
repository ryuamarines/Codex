import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import type { LiveEntry } from "@/lib/types";
import { getFirebaseDb } from "@/lib/firebase/client";
import { sanitizeEntries } from "@/lib/live-entry-utils";
import {
  deserializeEntriesFromCloud,
  serializeEntriesForCloud
} from "@/lib/live-image-cloud-metadata";

const ARCHIVE_COLLECTION = "liveLogArchives";

export class FirestoreLiveEntryRepository {
  async load(user: Pick<User, "uid">) {
    const db = getFirebaseDb();

    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const snapshot = await getDoc(doc(db, ARCHIVE_COLLECTION, user.uid));

    if (!snapshot.exists()) {
      return [] as LiveEntry[];
    }

    const data = snapshot.data();
    return sanitizeEntries(deserializeEntriesFromCloud((data.entries ?? []) as LiveEntry[]));
  }

  async save(user: Pick<User, "uid" | "displayName" | "email">, entries: LiveEntry[]) {
    const db = getFirebaseDb();

    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    await setDoc(
      doc(db, ARCHIVE_COLLECTION, user.uid),
      {
        entries: serializeEntriesForCloud(sanitizeEntries(entries)),
        updatedAt: serverTimestamp(),
        owner: {
          displayName: user.displayName ?? null,
          email: user.email ?? null
        }
      },
      { merge: true }
    );
  }
}
