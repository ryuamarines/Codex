import { createAggregateSummary, createTrendSummary, extractYear } from "@/lib/live-analytics";
import { countRenderableImages, hasUnsyncedImages } from "@/lib/live-image-state";
import type { LiveEntry } from "@/lib/types";

export type RecordVisibilityFilter = "all" | "withPhotos" | "withUnsyncedImages";

export function entryMatchesQuery(entry: LiveEntry, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return [
    entry.title,
    entry.date,
    entry.place,
    entry.venue,
    entry.artists.join(" "),
    extractYear(entry.date),
    entry.genre,
    entry.memo
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

export function getLeadArtist(entry: LiveEntry) {
  return entry.artists.find((artist) => artist.trim()) ?? "未設定";
}

export function parseLiveDateValue(value: string) {
  const normalized = value.trim().replace(/\//g, "-");
  const parsed = Date.parse(normalized);

  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const matched = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);

  if (!matched) {
    return 0;
  }

  const [, year, month, day] = matched;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

export function filterEntriesForTimeline(
  entries: LiveEntry[],
  query: string,
  dateSortOrder: "desc" | "asc",
  recordVisibilityFilter: RecordVisibilityFilter
) {
  const next = entries.filter((entry) => {
    if (!entryMatchesQuery(entry, query)) {
      return false;
    }

    if (recordVisibilityFilter === "withPhotos") {
      return countRenderableImages(entry.images) > 0;
    }

    if (recordVisibilityFilter === "withUnsyncedImages") {
      return hasUnsyncedImages(entry.images);
    }

    return true;
  });

  next.sort((left, right) => {
    const diff = parseLiveDateValue(left.date) - parseLiveDateValue(right.date);
    return dateSortOrder === "asc" ? diff : -diff;
  });

  return next;
}

export function createSortedEntries(entries: LiveEntry[]) {
  const next = [...entries];
  next.sort((left, right) => parseLiveDateValue(right.date) - parseLiveDateValue(left.date));
  return next;
}

export function createAvailableYears(entries: LiveEntry[]) {
  return Array.from(new Set(entries.map((entry) => extractYear(entry.date)).filter(Boolean))).sort((left, right) =>
    right.localeCompare(left, "ja")
  );
}

export function createTimelineGroups(entries: LiveEntry[], selectedYear: string) {
  const groups = new Map<string, LiveEntry[]>();

  for (const entry of entries) {
    if (extractYear(entry.date) !== selectedYear) {
      continue;
    }

    const monthKey = entry.date.slice(0, 7);
    const bucket = groups.get(monthKey) ?? [];
    bucket.push(entry);
    groups.set(monthKey, bucket);
  }

  return Array.from(groups.entries())
    .sort((left, right) => right[0].localeCompare(left[0], "ja"))
    .map(([monthKey, items]) => ({
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      items: items.sort((left, right) => parseLiveDateValue(right.date) - parseLiveDateValue(left.date))
    }));
}

export function createArtistArchive(sortedEntries: LiveEntry[]) {
  const countsByArtist = new Map<string, LiveEntry[]>();

  for (const entry of sortedEntries) {
    const artists = entry.artists.length > 0 ? entry.artists : ["未設定"];

    for (const artist of artists) {
      const key = artist.trim() || "未設定";
      const bucket = countsByArtist.get(key) ?? [];
      bucket.push(entry);
      countsByArtist.set(key, bucket);
    }
  }

  return Array.from(countsByArtist.entries())
    .map(([artist, items]) => ({
      artist,
      entries: items,
      count: items.length,
      firstDate: items[items.length - 1]?.date ?? "",
      lastDate: items[0]?.date ?? "",
      years: createTrendSummary(items).byYear
    }))
    .sort((left, right) => right.count - left.count || left.artist.localeCompare(right.artist, "ja"));
}

export function createVenueArchive(sortedEntries: LiveEntry[]) {
  const countsByVenue = new Map<string, LiveEntry[]>();

  for (const entry of sortedEntries) {
    const key = entry.venue.trim() || "未設定";
    const bucket = countsByVenue.get(key) ?? [];
    bucket.push(entry);
    countsByVenue.set(key, bucket);
  }

  return Array.from(countsByVenue.entries())
    .map(([venue, items]) => ({
      venue,
      entries: items,
      count: items.length,
      place: items[0]?.place ?? "",
      lastDate: items[0]?.date ?? "",
      firstDate: items[items.length - 1]?.date ?? ""
    }))
    .sort((left, right) => right.count - left.count || left.venue.localeCompare(right.venue, "ja"));
}

export function createYearlyArchiveCards(availableYears: string[], sortedEntries: LiveEntry[]) {
  return availableYears.slice(0, 4).map((year) => {
    const items = sortedEntries.filter((entry) => extractYear(entry.date) === year);
    const topArtist = createAggregateSummary(items).focusArtists[0]?.label ?? "記録なし";
    return {
      year,
      count: items.length,
      topArtist
    };
  });
}

export function formatMonthLabel(value: string) {
  const [, month] = value.split("-");

  if (!month) {
    return value;
  }

  return `${Number(month)}月`;
}

export function formatDay(value: string) {
  const matched = value.match(/\d{4}-(\d{2})-(\d{2})/);
  return matched ? matched[2] : value.slice(-2);
}

export function formatWeekday(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(parsed).toUpperCase();
}
