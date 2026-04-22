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

function normalizeCloudError(error: unknown, action: "read" | "write") {
  if (isCloudConflictError(error)) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "permission-denied"
  ) {
    return new Error(
      action === "read"
        ? "Firestore の読込権限がありません。Google ログイン中のユーザーに対応する liveLogArchives/{uid} と liveLogArchives/{uid}/entries/{entryId} の read ルールを確認してください。"
        : "Firestore の保存権限がありません。Google ログイン中のユーザーに対応する liveLogArchives/{uid} と liveLogArchives/{uid}/entries/{entryId} の write ルールを確認してください。"
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(
    action === "read" ? "クラウド読込に失敗しました。" : "クラウド保存に失敗しました。"
  );
}

export async function loadCloudEntries(user: Pick<User, "uid">) {
  const repository = new FirestoreLiveEntryRepository();

  try {
    return (await repository.load(user)) as CloudArchive;
  } catch (error) {
    throw normalizeCloudError(error, "read");
  }
}

export async function saveCloudEntries(
  user: Pick<User, "uid" | "displayName" | "email">,
  entries: LiveEntry[],
  settings?: CloudDriveSettings,
  expectedRevision?: number
) {
  const repository = new FirestoreLiveEntryRepository();

  try {
    return await repository.save(user, entries, settings, expectedRevision);
  } catch (error) {
    throw normalizeCloudError(error, "write");
  }
}

export async function saveCloudEntry(
  user: Pick<User, "uid" | "displayName" | "email">,
  entry: LiveEntry,
  settings?: CloudDriveSettings,
  expectedRevision?: number
) {
  const repository = new FirestoreLiveEntryRepository();

  try {
    return await repository.upsertEntry(user, entry, settings, expectedRevision);
  } catch (error) {
    throw normalizeCloudError(error, "write");
  }
}

export async function deleteCloudEntry(
  user: Pick<User, "uid" | "displayName" | "email">,
  entryId: string,
  settings?: CloudDriveSettings,
  expectedRevision?: number
) {
  const repository = new FirestoreLiveEntryRepository();

  try {
    return await repository.deleteEntry(user, entryId, settings, expectedRevision);
  } catch (error) {
    throw normalizeCloudError(error, "write");
  }
}

export async function saveCloudSettings(
  user: Pick<User, "uid" | "displayName" | "email">,
  settings?: CloudDriveSettings,
  expectedRevision?: number
) {
  const repository = new FirestoreLiveEntryRepository();

  try {
    return await repository.saveSettings(user, settings, expectedRevision);
  } catch (error) {
    throw normalizeCloudError(error, "write");
  }
}
