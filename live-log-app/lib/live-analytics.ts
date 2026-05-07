import type { LiveEntry } from "@/lib/types";
import { countRenderableImages } from "@/lib/live-image-state";
import {
  canonicalizeArtistName,
  canonicalizeVenueName,
  createEntityNormalizationIndex,
  type EntityNormalizationPreferences,
  type EntityNormalizationIndex
} from "@/lib/live-name-normalization";

export type AggregateBucket = {
  label: string;
  count: number;
};

export type TrendBucket = {
  label: string;
  count: number;
};

export type ArtistYearTrend = {
  artist: string;
  countsByYear: Record<string, number>;
  total: number;
};

export function createAggregateSummary(entries: LiveEntry[], preferences?: EntityNormalizationPreferences) {
  const normalizationIndex = createEntityNormalizationIndex(entries, preferences);

  return {
    focusArtists: aggregateArtistsTopN(entries, normalizationIndex),
    venues: aggregateTopN(entries, (entry) => canonicalizeVenueName(entry.venue || "未設定", normalizationIndex)),
    places: aggregateTopN(entries, (entry) => entry.place || "未設定"),
    genres: aggregateTopN(entries, (entry) => entry.genre || "未設定")
  };
}

export function createTrendSummary(entries: LiveEntry[], preferences?: EntityNormalizationPreferences) {
  const normalizationIndex = createEntityNormalizationIndex(entries, preferences);

  return {
    byYear: aggregateTimeline(entries, (entry) => extractYear(entry.date)),
    artistYears: aggregateArtistYearTrends(entries, normalizationIndex)
  };
}

export function createOverview(entries: LiveEntry[], preferences?: EntityNormalizationPreferences) {
  const normalizationIndex = createEntityNormalizationIndex(entries, preferences);
  const artistCount = new Set(
    entries.flatMap((entry) =>
      entry.artists
        .map((artist) => canonicalizeArtistName(artist, normalizationIndex))
        .filter((artist) => artist && artist !== "未設定")
    )
  ).size;
  const imageCount = entries.reduce((sum, entry) => sum + countRenderableImages(entry.images), 0);

  return {
    entryCount: entries.length,
    artistCount,
    imageCount
  };
}

export function extractYear(date: string) {
  const matched = date.match(/^(\d{4})/);
  return matched?.[1] ?? "";
}

function aggregateTopN(entries: LiveEntry[], pick: (entry: LiveEntry) => string, limit = 10) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const key = pick(entry).trim() || "未設定";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ja"));

  if (sorted.length <= limit) {
    return sorted;
  }

  return sorted.slice(0, limit);
}

function aggregateArtistsTopN(entries: LiveEntry[], normalizationIndex: EntityNormalizationIndex, limit = 10) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const artists = entry.artists.length > 0 ? entry.artists : ["未設定"];

    for (const artist of artists) {
      const key = canonicalizeArtistName(artist, normalizationIndex);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const sorted = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ja"));

  if (sorted.length <= limit) {
    return sorted;
  }

  return sorted.slice(0, limit);
}

function aggregateTimeline(entries: LiveEntry[], pick: (entry: LiveEntry) => string): TrendBucket[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const key = pick(entry).trim();

    if (!key) {
      continue;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label, "ja"));
}

function aggregateArtistYearTrends(entries: LiveEntry[], normalizationIndex: EntityNormalizationIndex, limit = 20) {
  const years = Array.from(
    new Set(entries.map((entry) => extractYear(entry.date)).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right, "ja"));

  const counts = new Map<string, Record<string, number>>();
  const totals = new Map<string, number>();

  for (const entry of entries) {
    const year = extractYear(entry.date).trim();

    if (!year) {
      continue;
    }

    const artists = entry.artists.length > 0 ? entry.artists : ["未設定"];

    for (const rawArtist of artists) {
      const artist = canonicalizeArtistName(rawArtist, normalizationIndex);
      const current = counts.get(artist) ?? {};
      current[year] = (current[year] ?? 0) + 1;
      counts.set(artist, current);
      totals.set(artist, (totals.get(artist) ?? 0) + 1);
    }
  }

  const items = Array.from(counts.entries())
    .map(([artist, countsByYear]) => ({
      artist,
      countsByYear,
      total: totals.get(artist) ?? 0
    }))
    .sort((left, right) => right.total - left.total || left.artist.localeCompare(right.artist, "ja"));

  return {
    years,
    items: items.slice(0, limit)
  };
}
