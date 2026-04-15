import type { User } from "firebase/auth";
import type { LiveEntry } from "@/lib/types";
import type { CloudDriveSettings } from "@/lib/live-image-cloud-metadata";
import { FirestoreLiveEntryRepository } from "@/lib/firebase/firestore-repository";

export type CloudArchive = {
  entries: LiveEntry[];
  settings: CloudDriveSettings;
  revision: number;
};

export class CloudConflictError extends Error {
  constructor(message = "クラウド上で新しい更新が見つかりました。最新内容を確認してからやり直してください。") {
    super(message);
    this.name = "CloudConflictError";
  }
}

export function isCloudConflictError(error: unknown): error is CloudConflictError {
  return error instanceof CloudConflictError;
}

export async function loadCloudEntries(user: Pick<User, "uid">) {
  const repository = new FirestoreLiveEntryRepository();
  return repository.load(user) as Promise<CloudArchive>;
}

export async function saveCloudEntries(
  user: Pick<User, "uid" | "displayName" | "email">,
  entries: LiveEntry[],
  settings?: CloudDriveSettings,
  expectedRevision?: number
) {
  const repository = new FirestoreLiveEntryRepository();
  return repository.save(user, entries, settings, expectedRevision);
}

export async function saveCloudEntry(
  user: Pick<User, "uid" | "displayName" | "email">,
  entry: LiveEntry,
  settings?: CloudDriveSettings,
  expectedRevision?: number
) {
  const repository = new FirestoreLiveEntryRepository();
  return repository.upsertEntry(user, entry, settings, expectedRevision);
}

export async function deleteCloudEntry(
  user: Pick<User, "uid" | "displayName" | "email">,
  entryId: string,
  settings?: CloudDriveSettings,
  expectedRevision?: number
) {
  const repository = new FirestoreLiveEntryRepository();
  return repository.deleteEntry(user, entryId, settings, expectedRevision);
}

export async function saveCloudSettings(
  user: Pick<User, "uid" | "displayName" | "email">,
  settings?: CloudDriveSettings,
  expectedRevision?: number
) {
  const repository = new FirestoreLiveEntryRepository();
  return repository.saveSettings(user, settings, expectedRevision);
}
