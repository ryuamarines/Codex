import type { User } from "firebase/auth";
import type { LiveEntry } from "@/lib/types";
import { FirestoreLiveEntryRepository } from "@/lib/firebase/firestore-repository";

export async function loadCloudEntries(user: Pick<User, "uid">) {
  const repository = new FirestoreLiveEntryRepository();
  return repository.load(user);
}

export async function saveCloudEntries(
  user: Pick<User, "uid" | "displayName" | "email">,
  entries: LiveEntry[]
) {
  const repository = new FirestoreLiveEntryRepository();
  await repository.save(user, entries);
}
