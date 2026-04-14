import {
  DEFAULT_ANALYTICS_TILE_HEIGHTS,
  DEFAULT_ANALYTICS_TILE_ORDER,
  DEFAULT_ANALYTICS_TILE_SIZES,
  type AnalyticsTileId,
  type TileHeight,
  type TileSize
} from "@/lib/analytics-dashboard";

type TableColumn = "date" | "title" | "venue" | "place" | "artists" | "year" | "genre" | "photos";
export type ThemeMode = "system" | "light" | "dark";
export type ListDensity = "comfortable" | "compact";

const COLUMN_WIDTHS_KEY = "live-log-column-widths";
const ANALYTICS_ORDER_KEY = "live-log-analytics-order";
const ANALYTICS_SIZES_KEY = "live-log-analytics-sizes";
const ANALYTICS_HEIGHTS_KEY = "live-log-analytics-heights";
const THEME_MODE_KEY = "live-log-theme-mode";
const LIST_DENSITY_KEY = "live-log-list-density";

function normalizeAnalyticsTileId(value: unknown): AnalyticsTileId | null {
  if (value === "artistTopChart") {
    return "artistYearStackedChart";
  }

  return typeof value === "string" && DEFAULT_ANALYTICS_TILE_ORDER.includes(value as AnalyticsTileId)
    ? (value as AnalyticsTileId)
    : null;
}

export function loadUiPreferences(storage: Storage) {
  return {
    columnWidths: readJson<Record<TableColumn, number>>(storage, COLUMN_WIDTHS_KEY),
    analyticsOrder: readAnalyticsOrder(storage),
    analyticsSizes: normalizeAnalyticsTileSizeMap(readJson<Record<string, TileSize>>(storage, ANALYTICS_SIZES_KEY)),
    analyticsHeights: normalizeAnalyticsTileHeightMap(
      readJson<Record<string, TileHeight>>(storage, ANALYTICS_HEIGHTS_KEY)
    ),
    themeMode: readThemeMode(storage),
    listDensity: readListDensity(storage)
  };
}

export function saveColumnWidths(storage: Storage, value: Record<TableColumn, number>) {
  storage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(value));
}

export function saveAnalyticsOrder(storage: Storage, value: AnalyticsTileId[]) {
  storage.setItem(ANALYTICS_ORDER_KEY, JSON.stringify(value));
}

export function saveAnalyticsSizes(storage: Storage, value: Record<AnalyticsTileId, TileSize>) {
  storage.setItem(ANALYTICS_SIZES_KEY, JSON.stringify(value));
}

export function saveAnalyticsHeights(storage: Storage, value: Record<AnalyticsTileId, TileHeight>) {
  storage.setItem(ANALYTICS_HEIGHTS_KEY, JSON.stringify(value));
}

export function saveThemeMode(storage: Storage, value: ThemeMode) {
  storage.setItem(THEME_MODE_KEY, value);
}

export function saveListDensity(storage: Storage, value: ListDensity) {
  storage.setItem(LIST_DENSITY_KEY, value);
}

function readAnalyticsOrder(storage: Storage) {
  const parsed = readJson<unknown[]>(storage, ANALYTICS_ORDER_KEY);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const filtered = parsed
    .map((item) => normalizeAnalyticsTileId(item))
    .filter((item): item is AnalyticsTileId => item !== null);

  const deduped = Array.from(new Set(filtered));

  if (deduped.length !== DEFAULT_ANALYTICS_TILE_ORDER.length) {
    return null;
  }

  return deduped;
}

function readThemeMode(storage: Storage) {
  const value = storage.getItem(THEME_MODE_KEY);
  return value === "system" || value === "light" || value === "dark" ? (value as ThemeMode) : null;
}

function readListDensity(storage: Storage) {
  const value = storage.getItem(LIST_DENSITY_KEY);
  return value === "comfortable" || value === "compact" ? (value as ListDensity) : null;
}

function readJson<T>(storage: Storage, key: string) {
  const raw = storage.getItem(key);

  if (!raw) {
    return null as T | null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null as T | null;
  }
}

export function normalizeAnalyticsTileSizeMap(value: Record<string, TileSize> | null) {
  if (!value) {
    return null;
  }

  const next = Object.fromEntries(
    Object.entries(value)
      .map(([key, size]) => [normalizeAnalyticsTileId(key), size] as const)
      .filter((entry): entry is [AnalyticsTileId, TileSize] => entry[0] !== null)
  );

  return Object.keys(next).length > 0 ? next : null;
}

export function normalizeAnalyticsTileHeightMap(value: Record<string, TileHeight> | null) {
  if (!value) {
    return null;
  }

  const next = Object.fromEntries(
    Object.entries(value)
      .map(([key, height]) => [normalizeAnalyticsTileId(key), height] as const)
      .filter((entry): entry is [AnalyticsTileId, TileHeight] => entry[0] !== null)
  );

  return Object.keys(next).length > 0 ? next : null;
}

export {
  DEFAULT_ANALYTICS_TILE_HEIGHTS,
  DEFAULT_ANALYTICS_TILE_ORDER,
  DEFAULT_ANALYTICS_TILE_SIZES
};
