import type { AnalyticsTileId } from "@/lib/analytics-dashboard";
import type { AggregateBucket, TrendBucket, ArtistYearTrend } from "@/lib/live-analytics";
import type { LiveLogShareSnapshot } from "@/lib/live-log-share-snapshot";

type OverviewSummary = {
  entryCount: number;
  artistCount: number;
  imageCount: number;
};

type TrendSummary = {
  byYear: TrendBucket[];
  artistYears: {
    years: string[];
    items: ArtistYearTrend[];
  };
};

type AggregateSummary = {
  focusArtists: AggregateBucket[];
  venues: AggregateBucket[];
  places: AggregateBucket[];
  genres: AggregateBucket[];
};

export function createAnalyticsSnapshot(
  tileId: AnalyticsTileId,
  label: string,
  overview: OverviewSummary,
  trends: TrendSummary,
  aggregates: AggregateSummary
): LiveLogShareSnapshot {
  const generatedAt = new Date().toISOString();

  if (tileId === "summary") {
    return {
      version: 1,
      kind: "summary",
      title: label,
      subtitle: "集計の共有スナップショット",
      generatedAt,
      metrics: [
        { label: "総記録数", value: overview.entryCount },
        { label: "出演アーティスト数", value: overview.artistCount },
        { label: "写真枚数", value: overview.imageCount }
      ]
    };
  }

  if (tileId === "yearTrend") {
    return {
      version: 1,
      kind: "trend",
      title: label,
      subtitle: "年ごとの参加本数",
      generatedAt,
      items: trends.byYear
    };
  }

  if (tileId === "artistYearStackedChart") {
    return {
      version: 1,
      kind: "artistStacked",
      title: label,
      subtitle: "アーティスト別 推移グラフ",
      generatedAt,
      years: trends.artistYears.years,
      items: trends.artistYears.items.slice(0, 10)
    };
  }

  const aggregateMap = {
    artists: aggregates.focusArtists,
    venues: aggregates.venues,
    places: aggregates.places,
    genres: aggregates.genres
  } satisfies Partial<Record<AnalyticsTileId, AggregateBucket[]>>;

  return {
    version: 1,
    kind: "aggregate",
    title: label,
    subtitle: "集計の共有スナップショット",
    generatedAt,
    items: aggregateMap[tileId] ?? []
  };
}

export function createYearlySnapshot(
  selectedYear: string,
  yearOverview: OverviewSummary,
  yearAggregates: {
    focusArtists: AggregateBucket[];
    places: AggregateBucket[];
    venues: AggregateBucket[];
    genres: AggregateBucket[];
  }
): LiveLogShareSnapshot {
  return {
    version: 1,
    kind: "yearly",
    title: `${selectedYear}年別まとめ`,
    subtitle: "年別集計の共有スナップショット",
    generatedAt: new Date().toISOString(),
    year: selectedYear,
    metrics: [
      { label: "記録数", value: yearOverview.entryCount },
      { label: "出演アーティスト数", value: yearOverview.artistCount },
      { label: "写真枚数", value: yearOverview.imageCount }
    ],
    sections: [
      { label: `${selectedYear}年 アーティスト別 TOP10`, items: yearAggregates.focusArtists },
      { label: `${selectedYear}年 地域 TOP10`, items: yearAggregates.places },
      { label: `${selectedYear}年 会場 TOP10`, items: yearAggregates.venues },
      { label: `${selectedYear}年 イベント形式`, items: yearAggregates.genres }
    ]
  };
}

export function createYearlyAggregateSnapshot(
  selectedYear: string,
  label: string,
  items: AggregateBucket[]
): LiveLogShareSnapshot {
  return {
    version: 1,
    kind: "aggregate",
    title: label,
    subtitle: `${selectedYear}年の共有スナップショット`,
    generatedAt: new Date().toISOString(),
    items
  };
}
