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
const CLOUD_SYNC_USER_KEY = "live-log-cloud-sync-user";
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

export function loadRestorePoints(storage: Storage, userId?: string) {
  const scopedStorageKey = createScopedRestorePointsKey(userId);
  const scopedValue = storage.getItem(scopedStorageKey);
  const lastSyncedUserId = storage.getItem(CLOUD_SYNC_USER_KEY) ?? "";
  const canMigrateLegacyData = userId
    ? !lastSyncedUserId || lastSyncedUserId === userId
    : !lastSyncedUserId;
  const rawValue = scopedValue ?? (canMigrateLegacyData ? storage.getItem(RESTORE_POINTS_KEY) : null);
  const sourceStorageKey = scopedValue === null ? RESTORE_POINTS_KEY : scopedStorageKey;

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    const points = parsed
      .map(normalizeRestorePoint)
      .filter((point): point is LiveRestorePoint => Boolean(point))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_RESTORE_POINTS);

    if (sourceStorageKey === RESTORE_POINTS_KEY) {
      try {
        storage.setItem(scopedStorageKey, JSON.stringify(points));
      } catch {
        // Keep the legacy restore points intact when scoped migration cannot be stored.
      }
    }

    return points;
  } catch {
    storage.removeItem(sourceStorageKey);
    return [];
  }
}

export function saveRestorePoint(
  storage: Storage,
  label: string,
  entries: LiveEntry[],
  userId?: string
) {
  const sanitizedEntries = sanitizeEntries(entries);

  if (sanitizedEntries.length === 0) {
    return loadRestorePoints(storage, userId);
  }

  const nextPoint: LiveRestorePoint = {
    id: createRestorePointId(),
    label,
    createdAt: new Date().toISOString(),
    entryCount: sanitizedEntries.length,
    entries: sanitizedEntries
  };
  const points = [nextPoint, ...loadRestorePoints(storage, userId)].slice(0, MAX_RESTORE_POINTS);
  try {
    storage.setItem(createScopedRestorePointsKey(userId), JSON.stringify(points));
  } catch {
    return points.slice(1);
  }
  return points;
}

export function deleteRestorePoint(storage: Storage, restorePointId: string, userId?: string) {
  const points = loadRestorePoints(storage, userId).filter((point) => point.id !== restorePointId);
  try {
    storage.setItem(createScopedRestorePointsKey(userId), JSON.stringify(points));
  } catch {
    return loadRestorePoints(storage, userId);
  }
  return points;
}

function createScopedRestorePointsKey(userId?: string) {
  return userId
    ? `${RESTORE_POINTS_KEY}.user.${userId}`
    : `${RESTORE_POINTS_KEY}.anonymous`;
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
