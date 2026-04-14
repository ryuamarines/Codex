import { createEntry, parseArtists, type ManualEntryInput } from "@/lib/live-entry-utils";
import type { LiveEntry, LiveEntryImage } from "@/lib/types";

export type PhotoImportInput = ManualEntryInput & {
  photoType: LiveEntryImage["type"];
};

export function inferImageType(fileName: string): LiveEntryImage["type"] {
  const normalized = fileName.toLowerCase();

  if (normalized.includes("qr") || normalized.includes("e-ticket") || normalized.includes("eticket")) {
    return "eticket";
  }

  if (normalized.includes("ticket")) {
    return "paperTicket";
  }

  if (normalized.includes("sign") || normalized.includes("board")) {
    return "signboard";
  }

  return "signboard";
}

export function normalizeColumnName(column: string) {
  const normalized = column.replace(/^\uFEFF/, "").trim().toLowerCase();

  const aliases: Record<string, string> = {
    title: "title",
    "公演": "title",
    "公演名": "title",
    event_title: "title",
    date: "date",
    "日付": "date",
    artists: "artists",
    "出演者": "artists",
    place: "place",
    "場所": "place",
    area: "place",
    venue: "venue",
    "会場": "venue",
    venues_raw: "venue",
    genre: "genre",
    "ジャンル": "genre",
    event_type: "genre",
    memo: "memo",
    "メモ": "memo",
    notes: "memo"
  };

  return aliases[normalized] ?? normalized;
}

export function normalizeGenre(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "festival") {
    return "フェス";
  }

  if (normalized === "normal") {
    return "";
  }

  return value.trim();
}

export function createEntryFromCsvRecord(columns: string[], record: string[]) {
  const row = columns.reduce<Record<string, string>>((accumulator, column, index) => {
    const nextValue = (record[index] ?? "").trim();
    const currentValue = accumulator[column]?.trim() ?? "";

    if (!currentValue || nextValue) {
      accumulator[column] = nextValue;
    }

    return accumulator;
  }, {});

  return createEntry({
    title: row.title,
    date: row.date,
    place: row.place ?? "",
    venue: row.venue,
    artistsText: row.artists,
    genre: normalizeGenre(row.genre ?? ""),
    memo: row.memo ?? ""
  });
}

export function findMatchingEntryIndex(entries: LiveEntry[], photoForm: PhotoImportInput) {
  const title = photoForm.title.trim().toLowerCase();
  const venue = photoForm.venue.trim().toLowerCase();
  const date = photoForm.date.trim();
  const artists = parseArtists(photoForm.artistsText.toLowerCase());

  return entries.findIndex((entry) => {
    const sameTitle = entry.title.trim().toLowerCase() === title;
    const sameDate = entry.date.trim() === date;
    const sameVenue = venue && entry.venue.trim().toLowerCase() === venue;
    const sameArtists =
      artists.length > 0 &&
      artists.every((artist) => entry.artists.map((item) => item.toLowerCase()).includes(artist));

    if (sameTitle && sameDate) {
      return true;
    }

    return Boolean(sameDate && sameVenue && sameArtists);
  });
}
