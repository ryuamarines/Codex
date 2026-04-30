"use client";

import type { ReactNode, RefObject } from "react";
import { YearlySummaryPanel, type YearlyAggregateKey } from "@/components/yearly-summary-panel";
import type { AggregateBucket } from "@/lib/live-analytics";
import type { LiveEntry } from "@/lib/types";

type HomeViewProps = {
  currentYear: string;
  currentYearEntriesCount: number;
  currentMonthEntriesCount: number;
  imageCount: number;
  recentEntries: LiveEntry[];
  topArtists: AggregateBucket[];
  yearlyArchiveCards: Array<{ year: string; count: number; topArtist: string }>;
  yearlySummaryRef: RefObject<HTMLDivElement | null>;
  selectedYear: string;
  availableYears: string[];
  yearOverview: { entryCount: number; artistCount: number; imageCount: number };
  yearAggregates: {
    focusArtists: AggregateBucket[];
    places: AggregateBucket[];
    venues: AggregateBucket[];
    genres: AggregateBucket[];
  };
  onSelectEntry(entryId: string): void;
  onShowTimeline(): void;
  onShowArtists(): void;
  onSelectArtist(artist: string): void;
  onSelectYear(year: string): void;
  renderYearlySummaryActions(): ReactNode;
  renderYearlyAggregateActions(key: YearlyAggregateKey, label: string): ReactNode;
  registerAggregateRef(key: YearlyAggregateKey, element: HTMLDivElement | null): void;
};

export function LiveLogHomeView({
  currentYear,
  currentYearEntriesCount,
  currentMonthEntriesCount,
  imageCount,
  recentEntries,
  topArtists,
  yearlyArchiveCards,
  yearlySummaryRef,
  selectedYear,
  availableYears,
  yearOverview,
  yearAggregates,
  onSelectEntry,
  onShowTimeline,
  onShowArtists,
  onSelectArtist,
  onSelectYear,
  renderYearlySummaryActions,
  renderYearlyAggregateActions,
  registerAggregateRef
}: HomeViewProps) {
  return (
    <section className="archiveHomeLayout">
      <section className="panel archiveHeroCard">
        <div className="archiveHeroCopy">
          <p className="eyebrow">Archive Home</p>
          <h2>{currentYear || "今年"}のライブ記録</h2>
          <p>積み重ねたライブ体験を、静かに辿れるホームです。</p>
        </div>
        <div className="archiveHeroStats">
          <article className="archiveStat">
            <span>今年の本数</span>
            <strong>{currentYearEntriesCount}</strong>
          </article>
          <article className="archiveStat">
            <span>今月の本数</span>
            <strong>{currentMonthEntriesCount}</strong>
          </article>
          <article className="archiveStat">
            <span>記録した写真</span>
            <strong>{imageCount}</strong>
          </article>
        </div>
      </section>

      <section className="archiveOverviewGrid">
        <section className="panel archiveSectionCard">
          <div className="archiveSectionHeader">
            <div>
              <p className="eyebrow">Recent</p>
              <h2>最近のライブ</h2>
            </div>
            <button className="toolButton" type="button" onClick={onShowTimeline}>
              タイムラインへ
            </button>
          </div>
          <div className="archiveRecentList">
            {recentEntries.map((entry) => (
              <button
                key={entry.id}
                className="archiveRecentItem"
                type="button"
                onClick={() => onSelectEntry(entry.id)}
              >
                <div className="archiveRecentDate">
                  <strong>{entry.date.slice(5).replace("-", ".")}</strong>
                  <span>{entry.date.slice(0, 4)}</span>
                </div>
                <div className="archiveRecentBody">
                  <strong>{entry.artists.find((artist) => artist.trim()) ?? "未設定"}</strong>
                  <span>{entry.title}</span>
                  <small>{entry.venue}</small>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel archiveSectionCard">
          <div className="archiveSectionHeader">
            <div>
              <p className="eyebrow">Artist</p>
              <h2>よく見るアーティスト</h2>
            </div>
            <button className="toolButton" type="button" onClick={onShowArtists}>
              すべて見る
            </button>
          </div>
          <div className="archiveRankList">
            {topArtists.slice(0, 5).map((artist, index) => (
              <button
                key={artist.label}
                className="archiveRankItem"
                type="button"
                onClick={() => onSelectArtist(artist.label)}
              >
                <strong>{index + 1}</strong>
                <span>{artist.label}</span>
                <small>{artist.count}回</small>
              </button>
            ))}
          </div>
        </section>
      </section>

      <section className="panel archiveSectionCard">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Yearly</p>
            <h2>年別サマリー</h2>
          </div>
        </div>
        <div className="archiveYearGrid">
          {yearlyArchiveCards.map((item) => (
            <button
              key={item.year}
              className="archiveYearCard"
              type="button"
              onClick={() => onSelectYear(item.year)}
            >
              <span>{item.year}</span>
              <strong>{item.count}本</strong>
              <small>よく見た: {item.topArtist}</small>
            </button>
          ))}
        </div>
      </section>
      <div ref={yearlySummaryRef}>
        <YearlySummaryPanel
          selectedYear={selectedYear}
          availableYears={availableYears}
          yearOverview={yearOverview}
          yearAggregates={yearAggregates}
          onYearChange={onSelectYear}
          actions={renderYearlySummaryActions()}
          registerAggregateRef={registerAggregateRef}
          renderAggregateActions={renderYearlyAggregateActions}
        />
      </div>
    </section>
  );
}
