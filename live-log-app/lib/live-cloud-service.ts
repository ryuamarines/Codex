import type { User } from "firebase/auth";
import type { LiveEntry } from "@/lib/types";
import type { CloudDriveSettings } from "@/lib/live-image-cloud-metadata";
import { FirestoreLiveEntryRepository } from "@/lib/firebase/firestore-repository";

export type CloudArchive = {
  entries: LiveEntry[];
  settings: CloudDriveSettings;
};

export async function loadCloudEntries(user: Pick<User, "uid">) {
  const repository = new FirestoreLiveEntryRepository();
  return repository.load(user) as Promise<CloudArchive>;
}

export async function saveCloudEntries(
  user: Pick<User, "uid" | "displayName" | "email">,
  entries: LiveEntry[],
  settings?: CloudDriveSettings
) {
  const repository = new FirestoreLiveEntryRepository();
  await repository.save(user, entries, settings);
}
