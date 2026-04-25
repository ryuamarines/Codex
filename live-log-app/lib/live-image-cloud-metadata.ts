import type { LiveEntry, LiveEntryImage } from "@/lib/types";

type CloudLiveEntryImage = Omit<LiveEntryImage, "src"> & {
  src?: string;
  hasLocalPreview?: boolean;
};

type CloudLiveEntry = Omit<LiveEntry, "images"> & {
  images: CloudLiveEntryImage[];
};

export type CloudDriveSettings = {
  driveFolderId?: string;
};

function removeUndefinedFields<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;
}

export function toCloudEntryDocumentId(entryId: string) {
  return encodeURIComponent(entryId);
}

function serializeImageForCloud(image: LiveEntryImage): CloudLiveEntryImage {
  const isCloudReady = !image.storageStatus || image.storageStatus === "cloud";

  return removeUndefinedFields({
    id: image.id,
    type: image.type,
    caption: image.caption,
    sourceFingerprint: image.sourceFingerprint,
    sourceFileName: image.sourceFileName,
    sourceFileSize: image.sourceFileSize,
    storageStatus: image.storageStatus,
    uploadError: image.uploadError,
    driveFileId: image.driveFileId,
    driveWebUrl: image.driveWebUrl,
    driveThumbnailUrl: image.driveThumbnailUrl,
    src: isCloudReady ? image.driveThumbnailUrl ?? image.src : undefined,
    hasLocalPreview: image.src.startsWith("data:")
  });
}

function deserializeCloudImage(image: CloudLiveEntryImage): LiveEntryImage {
  return {
    id: image.id,
    type: image.type,
    caption: image.caption,
    sourceFingerprint: image.sourceFingerprint,
    sourceFileName: image.sourceFileName,
    sourceFileSize: image.sourceFileSize,
    storageStatus: image.storageStatus,
    uploadError: image.uploadError,
    driveFileId: image.driveFileId,
    driveWebUrl: image.driveWebUrl,
    driveThumbnailUrl: image.driveThumbnailUrl,
    src: image.src ?? image.driveThumbnailUrl ?? ""
  };
}

export function serializeEntryForCloud(entry: LiveEntry): CloudLiveEntry {
  return removeUndefinedFields({
    ...entry,
    images: entry.images.map(serializeImageForCloud)
  });
}

export function deserializeEntryFromCloud(entry: CloudLiveEntry): LiveEntry {
  return {
    ...entry,
    images: (entry.images ?? []).map(deserializeCloudImage)
  };
}

export function serializeEntriesForCloud(entries: LiveEntry[]): CloudLiveEntry[] {
  return entries.map(serializeEntryForCloud);
}

export function deserializeEntriesFromCloud(entries: CloudLiveEntry[]): LiveEntry[] {
  return entries.map(deserializeEntryFromCloud);
}

export function createCloudComparableEntries(entries: LiveEntry[]) {
  return serializeEntriesForCloud(entries).map((entry) => ({
    ...entry,
    images: entry.images.map((image) => ({
      id: image.id,
      type: image.type,
      caption: image.caption ?? "",
      sourceFingerprint: image.sourceFingerprint ?? "",
      sourceFileName: image.sourceFileName ?? "",
      sourceFileSize: image.sourceFileSize ?? 0,
      storageStatus: image.storageStatus ?? "cloud",
      uploadError: image.uploadError ?? "",
      driveFileId: image.driveFileId ?? "",
      driveWebUrl: image.driveWebUrl ?? "",
      driveThumbnailUrl: image.driveThumbnailUrl ?? "",
      src: image.src ?? "",
      hasLocalPreview: Boolean(image.hasLocalPreview)
    }))
  }));
}

type ImageVisibilityInput = {
  src?: string;
  driveWebUrl?: string;
  driveThumbnailUrl?: string;
  storageStatus?: LiveEntryImage["storageStatus"];
};

export function isRenderableImage(image: ImageVisibilityInput) {
  if (image.storageStatus === "cloud") {
    return Boolean(image.src || image.driveThumbnailUrl || image.driveWebUrl);
  }

  return false;
}

export function countRenderableImages(images: ImageVisibilityInput[]) {
  return images.filter(isRenderableImage).length;
}

export function countUnsyncedImages(images: Pick<LiveEntryImage, "storageStatus">[]) {
  return images.filter(
    (image) =>
      image.storageStatus === "local_pending" ||
      image.storageStatus === "syncing" ||
      image.storageStatus === "error"
  ).length;
}

export function hasUnsyncedImages(images: Pick<LiveEntryImage, "storageStatus">[]) {
  return countUnsyncedImages(images) > 0;
}

export function normalizeCloudDriveSettings(settings: CloudDriveSettings | undefined) {
  return {
    driveFolderId: settings?.driveFolderId?.trim() || ""
  };
}
