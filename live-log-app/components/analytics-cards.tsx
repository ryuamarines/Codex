"use client";

import type { ReactNode } from "react";
import type { AggregateBucket, ArtistYearTrend, TrendBucket } from "@/lib/live-analytics";
import type { TileHeight, TileSize } from "@/lib/analytics-dashboard";

function getVisibleCount(height: TileHeight, compactCount: number, standardCount: number, tallCount: number) {
  if (height === "compact") {
    return compactCount;
  }

  if (height === "tall") {
    return tallCount;
  }

  return standardCount;
}

function getVisibleTrailingItems<T>(
  items: T[],
  height: TileHeight,
  compactCount: number,
  standardCount: number
) {
  if (height === "tall") {
    return items;
  }

  const visibleCount = getVisibleCount(height, compactCount, standardCount, items.length);
  return items.slice(-visibleCount);
}

export function SummaryTile({
  overview,
  backupMessage,
  actions,
  height = "standard"
}: {
  overview: { entryCount: number; artistCount: number; imageCount: number };
  backupMessage: string;
  actions?: ReactNode;
  height?: TileHeight;
}) {
  const isCompact = height === "compact";

  return (
    <section className={`panel summaryTileCard summaryTileCard-${height}`}>
      <div className="panelHeader">
        <div>
          <h2>件数サマリ</h2>
          {!isCompact ? <p>記録全体の規模感をざっくり把握するための補助ブロックです。</p> : null}
        </div>
        {actions}
      </div>
      <section className="summaryStrip">
        <div className="summaryCard">
          <span>総記録数</span>
          <strong>{overview.entryCount}</strong>
        </div>
        <div className="summaryCard">
          <span>出演アーティスト数</span>
          <strong>{overview.artistCount}</strong>
        </div>
        <div className="summaryCard">
          <span>写真枚数</span>
          <strong>{overview.imageCount}</strong>
        </div>
        <div className="summaryCard summaryMessage">
          <span>バックアップ</span>
          <strong>{isCompact ? "CSV でバックアップできます。" : backupMessage}</strong>
        </div>
      </section>
    </section>
  );
}

export function AggregateCard({
  title,
  items,
  actions,
  height = "standard"
}: {
  title: string;
  items: AggregateBucket[];
  actions?: ReactNode;
  height?: TileHeight;
}) {
  const visibleCount = getVisibleCount(height, 5, 10, Math.min(items.length, 15));
  const visibleItems = items.slice(0, visibleCount);
  const max = visibleItems[0]?.count ?? 1;

  return (
    <section className={`panel aggregateCard aggregateCard-${height}`}>
      <div className="panelHeader">
        <h2>{title}</h2>
        {actions}
      </div>
      <div className="rankList">
        {visibleItems.map((item, index) => (
          <div key={`${title}-${item.label}`} className="rankRow">
            <div className="rankMeta">
              <span className="rankNumber">{index + 1}</span>
              <span className="rankLabel">{item.label}</span>
              <strong className="rankCount">{item.count}</strong>
            </div>
            <div className="rankBar">
              <div className="rankBarFill" style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ArtistYearStackedChartCard({
  title,
  years,
  items,
  actions,
  height = "standard",
  size = "standard"
}: {
  title: string;
  years: string[];
  items: ArtistYearTrend[];
  actions?: ReactNode;
  height?: TileHeight;
  size?: TileSize;
}) {
  const visibleArtistCount = size === "wide" ? Math.min(items.length, 10) : Math.min(items.length, 5);
  const topItems = items.slice(0, visibleArtistCount);
  const yearTotals = years.map((year) => ({
    year,
    total: topItems.reduce((sum, item) => sum + (item.countsByYear[year] ?? 0), 0)
  }));
  const max = Math.max(...yearTotals.map((item) => item.total), 1);
  const palette = [
    "var(--chart-stack-1)",
    "var(--chart-stack-2)",
    "var(--chart-stack-3)",
    "var(--chart-stack-4)",
    "var(--chart-stack-5)",
    "var(--chart-stack-6)",
    "var(--chart-stack-7)",
    "var(--chart-stack-8)",
    "var(--chart-stack-9)",
    "var(--chart-stack-10)"
  ];

  return (
    <section className={`panel aggregateCard artistYearStackedChartCard artistYearStackedChartCard-${height}`}>
      <div className="panelHeader">
        <div>
          <h2>{title}</h2>
          <p>
            横軸を年にして、
            {size === "wide" ? " 総数上位10組" : " 総数上位5組"}
            の内訳を縦積み棒で見られます。
          </p>
        </div>
        {actions}
      </div>
      <div className="stackedBarLegend">
        {topItems.map((item, index) => (
          <span key={item.artist} className="stackedBarLegendItem">
            <span
              className="stackedBarLegendSwatch"
              style={{ background: palette[index % palette.length] }}
            />
            {item.artist}
          </span>
        ))}
      </div>
      <div className="verticalBarChart">
        {yearTotals.map(({ year, total }) => (
          <div key={`${title}-${year}`} className="verticalBarItem">
            <strong className="verticalBarCount">{total}</strong>
            <div className={`verticalBarTrack verticalBarTrack-${height}`}>
              <div
                className="stackedBarColumn"
                style={{ height: `${(total / max) * 100}%` }}
              >
                {topItems.map((item, index) => {
                  const value = item.countsByYear[year] ?? 0;

                  if (value === 0) {
                    return null;
                  }

                  return (
                    <div
                      key={`${year}-${item.artist}`}
                      className="stackedBarSegment"
                      style={{
                        height: `${total > 0 ? (value / total) * 100 : 0}%`,
                        background: palette[index % palette.length]
                      }}
                      title={`${year} / ${item.artist}: ${value}件`}
                    />
                  );
                })}
              </div>
            </div>
            <span className="verticalBarLabel" title={year}>
              {year}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function YearTrendHeroCard({
  items,
  actions,
  height = "standard"
}: {
  items: TrendBucket[];
  actions?: ReactNode;
  height?: TileHeight;
}) {
  const max = Math.max(...items.map((item) => item.count), 1);
  const visibleItems = getVisibleTrailingItems(items, height, 8, 14);

  return (
    <section className={`panel trendHeroCard trendHeroCard-${height}`}>
      <div className="panelHeader">
        <h2>年別推移</h2>
        {actions}
      </div>
      {visibleItems.length > 0 ? (
        <div className="trendList">
          {visibleItems.map((item) => (
            <div key={`year-trend-${item.label}`} className="trendRow heroTrendRow">
              <div className="trendMeta">
                <span className="trendLabel">{item.label}</span>
                <strong className="trendCount">{item.count}件</strong>
              </div>
              <div className="trendTrack">
                <div className="trendFill" style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="trendEmpty">年付きデータが必要です。</p>
      )}
    </section>
  );
}

export function ArtistYearTrendCard({
  years,
  items,
  actions,
  height = "standard"
}: {
  years: string[];
  items: ArtistYearTrend[];
  actions?: ReactNode;
  height?: TileHeight;
}) {
  const visibleCount = getVisibleCount(height, 8, 20, items.length);
  const visibleItems = items.slice(0, visibleCount);
  const visibleYears = getVisibleTrailingItems(years, height, 8, 12);

  return (
    <section className={`panel artistTrendCard artistTrendCard-${height}`}>
      <div className="panelHeader">
        <div>
          <h2>アーティスト別 年別推移</h2>
          <p>
            出演アーティストの参加本数を年ごとに並べています。
            {` 総数上位${visibleCount}件`}
            を表示します。
          </p>
        </div>
        {actions}
      </div>
      {visibleItems.length > 0 && years.length > 0 ? (
        <div className="artistTrendTableWrap">
          <table className="artistTrendTable">
            <thead>
              <tr>
                <th>アーティスト</th>
                <th>合計</th>
                {visibleYears.map((year) => (
                  <th key={year}>{year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.artist}>
                  <th>{item.artist}</th>
                  <td className="artistTrendTotal">{item.total}</td>
                  {visibleYears.map((year) => (
                    <td key={`${item.artist}-${year}`}>{item.countsByYear[year] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="trendEmpty">アーティスト別の年次推移を出すには年付きデータが必要です。</p>
      )}
    </section>
  );
}
