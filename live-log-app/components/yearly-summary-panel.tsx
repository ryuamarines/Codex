"use client";

import type { ReactNode } from "react";
import { AggregateCard } from "@/components/analytics-cards";
import type { AggregateBucket } from "@/lib/live-analytics";

type YearOverview = {
  entryCount: number;
  artistCount: number;
  imageCount: number;
};

type YearAggregates = {
  focusArtists: AggregateBucket[];
  places: AggregateBucket[];
  venues: AggregateBucket[];
  genres: AggregateBucket[];
};

export type YearlyAggregateKey = "focusArtists" | "places" | "venues" | "genres";

type YearlySummaryPanelProps = {
  selectedYear: string;
  availableYears: string[];
  yearOverview: YearOverview;
  yearAggregates: YearAggregates;
  onYearChange: (year: string) => void;
  actions?: ReactNode;
  registerAggregateRef?: (key: YearlyAggregateKey, element: HTMLDivElement | null) => void;
  renderAggregateActions?: (key: YearlyAggregateKey, label: string) => ReactNode;
};

export function YearlySummaryPanel({
  selectedYear,
  availableYears,
  yearOverview,
  yearAggregates,
  onYearChange,
  actions,
  registerAggregateRef,
  renderAggregateActions
}: YearlySummaryPanelProps) {
  return (
    <section className="panel yearlySummaryPanel">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Year Focus</p>
          <h2>年別まとめ</h2>
          <p>{selectedYear ? `${selectedYear}年の記録を集計しています。` : "年を選ぶと、その年だけをまとめて見られます。"}</p>
        </div>
        <div className="yearlySummaryActions" data-share-exclude="true">
          {actions}
          <label className="yearPicker">
            <span>対象年</span>
            <select value={selectedYear} onChange={(event) => onYearChange(event.target.value)}>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {selectedYear ? (
        <>
          <section className="summaryStrip">
            <div className="summaryCard">
              <span>{selectedYear}年の記録数</span>
              <strong>{yearOverview.entryCount}</strong>
            </div>
            <div className="summaryCard">
              <span>{selectedYear}年の出演アーティスト数</span>
              <strong>{yearOverview.artistCount}</strong>
            </div>
            <div className="summaryCard">
              <span>{selectedYear}年の写真枚数</span>
              <strong>{yearOverview.imageCount}</strong>
            </div>
            <div className="summaryCard summaryMessage">
              <span>対象期間</span>
              <strong>{selectedYear}年のみ</strong>
            </div>
          </section>

          <section className="yearlyAggregateGrid">
            <div ref={(element) => registerAggregateRef?.("focusArtists", element)}>
              <AggregateCard
                title={`${selectedYear}年 アーティスト別 TOP10`}
                items={yearAggregates.focusArtists}
                actions={renderAggregateActions?.("focusArtists", `${selectedYear}年 アーティスト別 TOP10`)}
              />
            </div>
            <div ref={(element) => registerAggregateRef?.("places", element)}>
              <AggregateCard
                title={`${selectedYear}年 地域 TOP10`}
                items={yearAggregates.places}
                actions={renderAggregateActions?.("places", `${selectedYear}年 地域 TOP10`)}
              />
            </div>
            <div ref={(element) => registerAggregateRef?.("venues", element)}>
              <AggregateCard
                title={`${selectedYear}年 会場 TOP10`}
                items={yearAggregates.venues}
                actions={renderAggregateActions?.("venues", `${selectedYear}年 会場 TOP10`)}
              />
            </div>
            <div ref={(element) => registerAggregateRef?.("genres", element)}>
              <AggregateCard
                title={`${selectedYear}年 イベント形式`}
                items={yearAggregates.genres}
                actions={renderAggregateActions?.("genres", `${selectedYear}年 イベント形式`)}
              />
            </div>
          </section>
        </>
      ) : (
        <p className="trendEmpty">年付きデータがまだありません。</p>
      )}
    </section>
  );
}
