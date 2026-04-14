import type { LiveEntry } from "@/lib/types";

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

export function createAggregateSummary(entries: LiveEntry[]) {
  return {
    focusArtists: aggregateArtistsTopN(entries),
    venues: aggregateTopN(entries, (entry) => entry.venue || "未設定"),
    places: aggregateTopN(entries, (entry) => entry.place || "未設定"),
    genres: aggregateTopN(entries, (entry) => entry.genre || "未設定")
  };
}

export function createTrendSummary(entries: LiveEntry[]) {
  return {
    byYear: aggregateTimeline(entries, (entry) => extractYear(entry.date)),
    artistYears: aggregateArtistYearTrends(entries)
  };
}

export function createOverview(entries: LiveEntry[]) {
  const artistCount = new Set(entries.flatMap((entry) => entry.artists.map((artist) => artist.trim()).filter(Boolean)))
    .size;
  const imageCount = entries.reduce((sum, entry) => sum + entry.images.length, 0);

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

function aggregateArtistsTopN(entries: LiveEntry[], limit = 10) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const artists = entry.artists.length > 0 ? entry.artists : ["未設定"];

    for (const artist of artists) {
      const key = artist.trim() || "未設定";
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

function aggregateArtistYearTrends(entries: LiveEntry[], limit = 20) {
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
      const artist = rawArtist.trim() || "未設定";
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
