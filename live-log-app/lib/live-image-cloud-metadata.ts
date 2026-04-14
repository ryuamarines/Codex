import type { LiveEntry, LiveEntryImage } from "@/lib/types";

type CloudLiveEntryImage = Omit<LiveEntryImage, "src"> & {
  src?: string;
  hasLocalPreview?: boolean;
};

type CloudLiveEntry = Omit<LiveEntry, "images"> & {
  images: CloudLiveEntryImage[];
};

function serializeImageForCloud(image: LiveEntryImage): CloudLiveEntryImage {
  const isCloudReady = !image.storageStatus || image.storageStatus === "cloud";

  return {
    id: image.id,
    type: image.type,
    caption: image.caption,
    storageStatus: image.storageStatus,
    uploadError: image.uploadError,
    driveFileId: image.driveFileId,
    driveWebUrl: image.driveWebUrl,
    driveThumbnailUrl: image.driveThumbnailUrl,
    src: isCloudReady ? image.driveThumbnailUrl ?? image.src : undefined,
    hasLocalPreview: image.src.startsWith("data:")
  };
}

function deserializeCloudImage(image: CloudLiveEntryImage): LiveEntryImage {
  return {
    id: image.id,
    type: image.type,
    caption: image.caption,
    storageStatus: image.storageStatus,
    uploadError: image.uploadError,
    driveFileId: image.driveFileId,
    driveWebUrl: image.driveWebUrl,
    driveThumbnailUrl: image.driveThumbnailUrl,
    src: image.src ?? image.driveThumbnailUrl ?? ""
  };
}

export function serializeEntriesForCloud(entries: LiveEntry[]): CloudLiveEntry[] {
  return entries.map((entry) => ({
    ...entry,
    images: entry.images.map(serializeImageForCloud)
  }));
}

export function deserializeEntriesFromCloud(entries: CloudLiveEntry[]): LiveEntry[] {
  return entries.map((entry) => ({
    ...entry,
    images: (entry.images ?? []).map(deserializeCloudImage)
  }));
}

export function createCloudComparableEntries(entries: LiveEntry[]) {
  return serializeEntriesForCloud(entries).map((entry) => ({
    ...entry,
    images: entry.images.map((image) => ({
      id: image.id,
      type: image.type,
      caption: image.caption ?? "",
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
