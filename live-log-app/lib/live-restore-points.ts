import type { LiveEntry } from "@/lib/types";
import { sanitizeEntries } from "@/lib/live-entry-utils";

export type LiveRestorePoint = {
  id: string;
  label: string;
  createdAt: string;
  entryCount: number;
  entries: LiveEntry[];
};

const RESTORE_POINTS_KEY = "live-log.restore-points";
const MAX_RESTORE_POINTS = 8;

function createRestorePointId() {
  return `restore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRestorePoint(value: unknown): LiveRestorePoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const point = value as Partial<LiveRestorePoint>;

  if (!Array.isArray(point.entries)) {
    return null;
  }

  const entries = sanitizeEntries(point.entries);
  return {
    id: typeof point.id === "string" && point.id ? point.id : createRestorePointId(),
    label: typeof point.label === "string" && point.label ? point.label : "自動保存",
    createdAt:
      typeof point.createdAt === "string" && !Number.isNaN(new Date(point.createdAt).getTime())
        ? point.createdAt
        : new Date().toISOString(),
    entryCount: entries.length,
    entries
  };
}

export function loadRestorePoints(storage: Storage) {
  const rawValue = storage.getItem(RESTORE_POINTS_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeRestorePoint)
      .filter((point): point is LiveRestorePoint => Boolean(point))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_RESTORE_POINTS);
  } catch {
    storage.removeItem(RESTORE_POINTS_KEY);
    return [];
  }
}

export function saveRestorePoint(storage: Storage, label: string, entries: LiveEntry[]) {
  const sanitizedEntries = sanitizeEntries(entries);

  if (sanitizedEntries.length === 0) {
    return loadRestorePoints(storage);
  }

  const nextPoint: LiveRestorePoint = {
    id: createRestorePointId(),
    label,
    createdAt: new Date().toISOString(),
    entryCount: sanitizedEntries.length,
    entries: sanitizedEntries
  };
  const points = [nextPoint, ...loadRestorePoints(storage)].slice(0, MAX_RESTORE_POINTS);
  storage.setItem(RESTORE_POINTS_KEY, JSON.stringify(points));
  return points;
}

export function deleteRestorePoint(storage: Storage, restorePointId: string) {
  const points = loadRestorePoints(storage).filter((point) => point.id !== restorePointId);
  storage.setItem(RESTORE_POINTS_KEY, JSON.stringify(points));
  return points;
}

export function formatRestorePointCreatedAt(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}
