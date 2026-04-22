import type { LiveEntry, LiveEntryImage } from "@/lib/types";

export const STORAGE_KEY = "live-log.entries";

export type ManualEntryInput = {
  title: string;
  date: string;
  place: string;
  venue: string;
  artistsText: string;
  genre: string;
  memo: string;
};

function normalizeImageType(type: string): LiveEntryImage["type"] {
  if (type === "ticket") {
    return "paperTicket";
  }

  if (type === "other") {
    return "signboard";
  }

  if (type === "eticket" || type === "paperTicket" || type === "signboard") {
    return type;
  }

  return "signboard";
}

function normalizeStorageStatus(value: string | undefined): LiveEntryImage["storageStatus"] {
  if (value === "local_pending" || value === "syncing" || value === "error") {
    return value;
  }

  if (value === "pending" || value === "local") {
    return "local_pending";
  }

  return "cloud";
}

export function parseArtists(input: string) {
  return input
    .split(/[\/,\n]/)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

export function normalizeDateValue(input: string) {
  const value = input.trim();

  if (!value) {
    return "";
  }

  const normalized = value
    .replace(/[年/.]/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, "");

  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export function createEntryId(title: string, date: string) {
  const slug = slugify(title) || "live";
  const safeDate = date || "undated";
  return `${safeDate}-${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createImageId() {
  return `img-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEntry(input: ManualEntryInput): LiveEntry {
  const artists = parseArtists(input.artistsText);
  const normalizedDate = normalizeDateValue(input.date);

  return {
    id: createEntryId(input.title, normalizedDate),
    title: input.title.trim(),
    date: normalizedDate,
    place: input.place.trim(),
    venue: input.venue.trim(),
    artists,
    genre: input.genre.trim(),
    memo: input.memo.trim(),
    images: []
  };
}

export function createImage(
  src: string,
  type: LiveEntryImage["type"],
  caption?: string,
  meta?: Partial<Pick<LiveEntryImage, "driveFileId" | "driveWebUrl" | "driveThumbnailUrl">>
): LiveEntryImage {
  return {
    id: createImageId(),
    type,
    src,
    caption: caption?.trim() || undefined,
    storageStatus: "cloud",
    driveFileId: meta?.driveFileId,
    driveWebUrl: meta?.driveWebUrl,
    driveThumbnailUrl: meta?.driveThumbnailUrl
  };
}

export function createPendingImage(
  src: string,
  type: LiveEntryImage["type"],
  caption?: string
): LiveEntryImage {
  return {
    id: createImageId(),
    type,
    src,
    caption: caption?.trim() || undefined,
    storageStatus: "local_pending"
  };
}

export function sanitizeEntries(entries: LiveEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    title: entry.title.trim(),
    date: normalizeDateValue(entry.date),
    place: (entry.place ?? "").trim(),
    venue: entry.venue.trim(),
    artists: entry.artists.map((artist) => artist.trim()).filter(Boolean),
    genre: (entry.genre ?? "").trim(),
    memo: entry.memo.trim(),
    images: (entry.images ?? []).map((image) => ({
      ...image,
      type: normalizeImageType(image.type),
      caption: image.caption?.trim() || undefined,
      storageStatus: normalizeStorageStatus(image.storageStatus),
      uploadError: image.uploadError?.trim() || undefined,
      driveFileId: image.driveFileId?.trim() || undefined,
      driveWebUrl: image.driveWebUrl?.trim() || undefined,
      driveThumbnailUrl: image.driveThumbnailUrl?.trim() || undefined
    }))
  }));
}
