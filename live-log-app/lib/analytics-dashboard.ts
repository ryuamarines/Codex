export type AnalyticsTileId =
  | "yearTrend"
  | "summary"
  | "artists"
  | "artistYearStackedChart"
  | "venues"
  | "places"
  | "genres";

export type TileSize = "standard" | "wide";
export type TileHeight = "compact" | "standard" | "tall";

export type PositionedDashboardTile = {
  id: AnalyticsTileId;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
};

export const DEFAULT_ANALYTICS_TILE_ORDER: AnalyticsTileId[] = [
  "yearTrend",
  "summary",
  "genres",
  "artists",
  "artistYearStackedChart",
  "venues",
  "places"
];

export const DEFAULT_ANALYTICS_TILE_SIZES: Record<AnalyticsTileId, TileSize> = {
  yearTrend: "wide",
  summary: "wide",
  genres: "standard",
  artists: "standard",
  artistYearStackedChart: "standard",
  venues: "standard",
  places: "standard"
};

export const DEFAULT_ANALYTICS_TILE_HEIGHTS: Record<AnalyticsTileId, TileHeight> = {
  yearTrend: "tall",
  summary: "compact",
  genres: "compact",
  artists: "standard",
  artistYearStackedChart: "standard",
  venues: "standard",
  places: "standard"
};

export function createDashboardLayout(
  order: AnalyticsTileId[],
  sizes: Record<AnalyticsTileId, TileSize>,
  heights: Record<AnalyticsTileId, TileHeight>
) {
  const positioned: PositionedDashboardTile[] = [];
  let currentRow = 1;
  let pendingTile: {
    id: AnalyticsTileId;
    rowSpan: number;
  } | null = null;

  for (const tileId of order) {
    const rowSpan = heightToRowSpan(tileId, heights[tileId] ?? "standard");
    const isWide = sizes[tileId] === "wide";

    if (isWide) {
      if (pendingTile) {
        positioned.push({
          id: pendingTile.id,
          rowStart: currentRow,
          rowSpan: pendingTile.rowSpan,
          colStart: 1,
          colSpan: 1
        });
        currentRow += pendingTile.rowSpan;
        pendingTile = null;
      }

      positioned.push({
        id: tileId,
        rowStart: currentRow,
        rowSpan,
        colStart: 1,
        colSpan: 2
      });
      currentRow += rowSpan;
      continue;
    }

    if (!pendingTile) {
      pendingTile = { id: tileId, rowSpan };
      continue;
    }

    const pairedRowSpan = Math.max(pendingTile.rowSpan, rowSpan);
    positioned.push({
      id: pendingTile.id,
      rowStart: currentRow,
      rowSpan: pendingTile.rowSpan,
      colStart: 1,
      colSpan: 1
    });
    positioned.push({
      id: tileId,
      rowStart: currentRow,
      rowSpan,
      colStart: 2,
      colSpan: 1
    });
    currentRow += pairedRowSpan;
    pendingTile = null;
  }

  if (pendingTile) {
    positioned.push({
      id: pendingTile.id,
      rowStart: currentRow,
      rowSpan: pendingTile.rowSpan,
      colStart: 1,
      colSpan: 1
    });
  }

  return positioned;
}

function heightToRowSpan(tileId: AnalyticsTileId, height: TileHeight) {
  if (tileId === "summary") {
    return 8;
  }

  if (height === "compact") {
    return 12;
  }

  if (height === "tall") {
    return 22;
  }

  return 16;
}
