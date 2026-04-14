import type { AnalyticsTileId, TileHeight, TileSize } from "@/lib/analytics-dashboard";

export function moveTileOrder(
  current: AnalyticsTileId[],
  tileId: AnalyticsTileId,
  direction: -1 | 1
) {
  const index = current.indexOf(tileId);

  if (index < 0) {
    return current;
  }

  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= current.length) {
    return current;
  }

  const next = [...current];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function toggleTileSizeValue(
  current: Record<AnalyticsTileId, TileSize>,
  tileId: AnalyticsTileId
) {
  return {
    ...current,
    [tileId]: current[tileId] === "wide" ? "standard" : "wide"
  };
}

export function cycleTileHeightValue(
  current: Record<AnalyticsTileId, TileHeight>,
  tileId: AnalyticsTileId
) {
  const nextMap: Record<TileHeight, TileHeight> = {
    compact: "standard",
    standard: "tall",
    tall: "compact"
  };

  return {
    ...current,
    [tileId]: nextMap[current[tileId] ?? "standard"]
  };
}

export function getTileHeightLabel(height: TileHeight) {
  if (height === "compact") {
    return "低め";
  }

  if (height === "tall") {
    return "高め";
  }

  return "標準";
}
