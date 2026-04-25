import { parseCsv } from "@/lib/csv";
import { createEntry, parseArtists, type ManualEntryInput } from "@/lib/live-entry-utils";
import {
  createEntryFromCsvRecord,
  findMatchingEntryIndex,
  normalizeColumnName,
  type PhotoImportInput
} from "@/lib/live-import-utils";
import type { LiveEntry, LiveEntryImage } from "@/lib/types";

type BulkEditInput = {
  place: string;
  venue: string;
  genre: string;
};

function getImageDuplicateKey(image: LiveEntryImage) {
  const fingerprint = image.sourceFingerprint?.trim();

  if (fingerprint) {
    return `fingerprint:${fingerprint}`;
  }

  const fileName = image.sourceFileName?.trim().toLowerCase();
  const fileSize =
    typeof image.sourceFileSize === "number" && Number.isFinite(image.sourceFileSize)
      ? image.sourceFileSize
      : 0;

  if (fileName && fileSize > 0) {
    return `file:${fileName}:${fileSize}`;
  }

  const driveFileId = image.driveFileId?.trim();

  if (driveFileId) {
    return `drive:${driveFileId}`;
  }

  return "";
}

export function mergeImagesWithDedup(
  existingImages: LiveEntryImage[],
  incomingImages: LiveEntryImage[]
) {
  const seenKeys = new Set(existingImages.map(getImageDuplicateKey).filter(Boolean));
  const accepted: LiveEntryImage[] = [];
  let duplicateCount = 0;

  for (const image of incomingImages) {
    const duplicateKey = getImageDuplicateKey(image);

    if (duplicateKey && seenKeys.has(duplicateKey)) {
      duplicateCount += 1;
      continue;
    }

    if (duplicateKey) {
      seenKeys.add(duplicateKey);
    }

    accepted.push(image);
  }

  return {
    images: [...accepted, ...existingImages],
    duplicateCount,
    addedCount: accepted.length
  };
}

export function createManualEntry(input: ManualEntryInput) {
  const nextEntry = createEntry(input);

  if (!nextEntry.title || !nextEntry.date || !nextEntry.venue || nextEntry.artists.length === 0) {
    return null;
  }

  return nextEntry;
}

export function importEntriesFromCsvContent(content: string) {
  const rows = parseCsv(content);

  if (rows.length < 2) {
    return {
      entries: [] as LiveEntry[],
      message: "CSV の行数が足りません。ヘッダーとデータ行を確認してください。"
    };
  }

  const [header, ...records] = rows;
  const columns = header.map(normalizeColumnName);
  const requiredColumns = ["title", "date", "venue", "artists"];
  const hasAllColumns = requiredColumns.every((column) => columns.includes(column));

  if (!hasAllColumns) {
    return {
      entries: [] as LiveEntry[],
      message: "CSV ヘッダーは title/date/venue/artists 相当の列を含めてください。日本語ヘッダーにも対応しています。"
    };
  }

  const entries = records
    .map((record) => createEntryFromCsvRecord(columns, record))
    .filter((entry) => entry.title && entry.date && entry.venue && entry.artists.length > 0);

  if (entries.length === 0) {
    return {
      entries,
      message: "取り込める行がありませんでした。必須項目を確認してください。"
    };
  }

  return {
    entries,
    message: `${entries.length} 件のライブ記録を取り込みました。`
  };
}

export function appendImagesToEntry(
  entries: LiveEntry[],
  entryId: string,
  images: LiveEntryImage[]
) {
  return entries.map((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }

    const merged = mergeImagesWithDedup(entry.images, images);
    return { ...entry, images: merged.images };
  });
}

export function removeImageFromEntry(
  entries: LiveEntry[],
  entryId: string,
  imageId: string
) {
  return entries.map((entry) =>
    entry.id === entryId
      ? { ...entry, images: entry.images.filter((image) => image.id !== imageId) }
      : entry
  );
}

export function applyPhotoImportToEntries(
  entries: LiveEntry[],
  photoForm: PhotoImportInput,
  images: LiveEntryImage[]
) {
  const matchedIndex = findMatchingEntryIndex(entries, photoForm);

  if (matchedIndex >= 0) {
    const merged = mergeImagesWithDedup(entries[matchedIndex].images, images);
    return {
      selectedEntryId: entries[matchedIndex].id,
      duplicateCount: merged.duplicateCount,
      addedCount: merged.addedCount,
      entries: entries.map((entry, index) =>
        index === matchedIndex ? { ...entry, images: merged.images } : entry
      )
    };
  }

  const nextEntry = createEntry({
    title: photoForm.title,
    date: photoForm.date,
    place: photoForm.place,
    venue: photoForm.venue || "未設定",
    artistsText: photoForm.artistsText || "未設定",
    genre: photoForm.genre,
    memo: photoForm.memo
  });

  return {
    selectedEntryId: nextEntry.id,
    duplicateCount: 0,
    addedCount: images.length,
    entries: [{ ...nextEntry, images }, ...entries]
  };
}

export function updateEntryFieldValue(
  entries: LiveEntry[],
  entryId: string,
  key: keyof Omit<LiveEntry, "id" | "images">,
  value: string
) {
  return entries.map((entry) => {
    if (entry.id !== entryId) {
      return entry;
    }

    switch (key) {
      case "artists":
        return { ...entry, artists: parseArtists(value) };
      case "date":
        return { ...entry, date: value };
      case "title":
        return { ...entry, title: value };
      case "place":
        return { ...entry, place: value };
      case "venue":
        return { ...entry, venue: value };
      case "genre":
        return { ...entry, genre: value };
      case "memo":
        return { ...entry, memo: value };
      default:
        return entry;
    }
  });
}

export function applyBulkEditToEntries(
  entries: LiveEntry[],
  selectedEntryIds: string[],
  bulkEdit: BulkEditInput
) {
  const updates = Object.entries(bulkEdit).filter(([, value]) => value.trim() !== "");

  if (selectedEntryIds.length === 0 || updates.length === 0) {
    return entries;
  }

  return entries.map((entry) => {
    if (!selectedEntryIds.includes(entry.id)) {
      return entry;
    }

    const nextEntry = { ...entry };

    for (const [key, value] of updates) {
      if (key === "place") nextEntry.place = value;
      if (key === "venue") nextEntry.venue = value;
      if (key === "genre") nextEntry.genre = value;
    }

    return nextEntry;
  });
}

export function deleteEntriesById(entries: LiveEntry[], selectedEntryIds: string[]) {
  if (selectedEntryIds.length === 0) {
    return entries;
  }

  return entries.filter((entry) => !selectedEntryIds.includes(entry.id));
}
