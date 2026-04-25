"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, MutableRefObject, ReactNode, RefObject } from "react";
import { BatchImportBoard } from "@/components/batch-import-board";
import { RecordListTable } from "@/components/record-list-table";
import { RecordToolsPanel } from "@/components/record-tools-panel";
import { YearlySummaryPanel, type YearlyAggregateKey } from "@/components/yearly-summary-panel";
import type { ArchiveImageService } from "@/lib/archive-image-service";
import type { PositionedDashboardTile, AnalyticsTileId, TileHeight } from "@/lib/analytics-dashboard";
import type { AggregateBucket, TrendBucket } from "@/lib/live-analytics";
import type { ManualEntryInput } from "@/lib/live-entry-utils";
import type { LiveEntry } from "@/lib/types";

type PhotoUploadInput = {
  title: string;
  date: string;
  place: string;
  venue: string;
  artistsText: string;
  genre: string;
  memo: string;
  photoType: "signboard" | "eticket" | "paperTicket";
};

type BulkEditInput = {
  place: string;
  venue: string;
  genre: string;
};

type ListDensity = "comfortable" | "compact";
type TimelinePresentation = "cards" | "table";
type ListColumn = "venue" | "place" | "artists" | "year" | "genre" | "photos";
type TableColumn = "date" | "title" | ListColumn;
type RecordVisibilityFilter = "all" | "withPhotos" | "withUnsyncedImages";
type ActiveTool = "create" | "csv" | "photo" | "bulk" | null;

const LIST_COLUMN_OPTIONS: Array<{ key: ListColumn; label: string }> = [
  { key: "venue", label: "会場" },
  { key: "place", label: "地域" },
  { key: "artists", label: "出演者" },
  { key: "year", label: "年" },
  { key: "genre", label: "形式" },
  { key: "photos", label: "写真" }
];

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

type TimelineGroup = {
  monthKey: string;
  monthLabel: string;
  items: LiveEntry[];
};

type TimelineViewProps = {
  selectedYear: string;
  availableYears: string[];
  timelinePresentation: TimelinePresentation;
  listDensity: ListDensity;
  visibleListColumns: ListColumn[];
  query: string;
  timelineGroups: TimelineGroup[];
  timelineEntries: LiveEntry[];
  selectedEntryId: string;
  highlightedEntryId: string;
  selectedEntryIds: string[];
  visibleSelectedCount: number;
  columnWidths: Record<TableColumn, number>;
  dateSortOrder: "desc" | "asc";
  onQueryChange(value: string): void;
  onSelectYear(year: string): void;
  onSelectEntry(entryId: string): void;
  onSetTimelinePresentation(value: TimelinePresentation): void;
  onSetListDensity(value: ListDensity): void;
  onToggleListColumn(column: ListColumn): void;
  onToggleVisibleEntries(checked: boolean): void;
  onToggleEntrySelection(entryId: string, checked: boolean): void;
  onToggleDateSort(): void;
  onResizeStart(column: TableColumn, clientX: number): void;
  formatDay(value: string): string;
  formatWeekday(value: string): string;
  getLeadArtist(entry: LiveEntry): string;
  timelineTiles: PositionedDashboardTile[];
  analyticsTileRefs: MutableRefObject<Partial<Record<AnalyticsTileId, HTMLDivElement | null>>>;
  resolvedAnalyticsTileHeights: Record<AnalyticsTileId, TileHeight>;
  tileMap: Record<AnalyticsTileId, ReactNode>;
  dashboardRowCount: number;
};

export function LiveLogTimelineView({
  selectedYear,
  availableYears,
  timelinePresentation,
  listDensity,
  visibleListColumns,
  query,
  timelineGroups,
  timelineEntries,
  selectedEntryId,
  highlightedEntryId,
  selectedEntryIds,
  visibleSelectedCount,
  columnWidths,
  dateSortOrder,
  onQueryChange,
  onSelectYear,
  onSelectEntry,
  onSetTimelinePresentation,
  onSetListDensity,
  onToggleListColumn,
  onToggleVisibleEntries,
  onToggleEntrySelection,
  onToggleDateSort,
  onResizeStart,
  formatDay,
  formatWeekday,
  getLeadArtist,
  timelineTiles,
  analyticsTileRefs,
  resolvedAnalyticsTileHeights,
  tileMap,
  dashboardRowCount
}: TimelineViewProps) {
  return (
    <section className="archiveTimelineLayout">
      <section className="panel archiveTimelinePanel">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Timeline</p>
            <h2>ライブの軌跡</h2>
          </div>
          <div className="archiveTimelineControls">
            <div className="archiveYearTabs">
              {availableYears.map((year) => (
                <button
                  key={year}
                  className={selectedYear === year ? "toolButton activeToolButton" : "toolButton"}
                  type="button"
                  onClick={() => onSelectYear(year)}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="searchBox">
          <span>検索</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="公演名 / 会場 / アーティスト"
          />
        </div>
        <div className="columnChooser">
          <div className="columnChooserHeader">
            <span>表示形式</span>
            <div className="densityToggle">
              <button
                className={timelinePresentation === "cards" ? "toolButton activeToolButton" : "toolButton"}
                type="button"
                onClick={() => onSetTimelinePresentation("cards")}
              >
                カード
              </button>
              <button
                className={timelinePresentation === "table" ? "toolButton activeToolButton" : "toolButton"}
                type="button"
                onClick={() => onSetTimelinePresentation("table")}
              >
                一覧
              </button>
            </div>
          </div>
          {timelinePresentation === "table" ? (
            <>
              <div className="columnChooserHeader">
                <span>表示項目</span>
                <div className="densityToggle">
                  <button
                    className={listDensity === "comfortable" ? "toolButton activeToolButton" : "toolButton"}
                    type="button"
                    onClick={() => onSetListDensity("comfortable")}
                  >
                    ゆったり
                  </button>
                  <button
                    className={listDensity === "compact" ? "toolButton activeToolButton" : "toolButton"}
                    type="button"
                    onClick={() => onSetListDensity("compact")}
                  >
                    コンパクト
                  </button>
                </div>
              </div>
              <div className="columnButtons">
                {LIST_COLUMN_OPTIONS.map((column) => (
                  <button
                    key={column.key}
                    className={
                      visibleListColumns.includes(column.key)
                        ? "toolButton activeToolButton"
                        : "toolButton"
                    }
                    type="button"
                    onClick={() => onToggleListColumn(column.key)}
                  >
                    {column.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
        {timelinePresentation === "cards" ? (
          <div className="archiveMonthStack">
            {timelineGroups.map((group) => (
              <section key={group.monthKey} className="archiveMonthGroup">
                <div className="archiveMonthHeading">
                  <strong>{group.monthLabel}</strong>
                  <span>{group.items.length}件</span>
                </div>
                <div className="archiveTimelineCards">
                  {group.items.map((entry) => (
                    <button
                      key={entry.id}
                      className={`archiveTimelineCard ${selectedEntryId === entry.id ? "archiveTimelineCardActive" : ""}`}
                      type="button"
                      onClick={() => onSelectEntry(entry.id)}
                    >
                      <div className="archiveTimelineDate">
                        <strong>{formatDay(entry.date)}</strong>
                        <span>{formatWeekday(entry.date)}</span>
                      </div>
                      <div className="archiveTimelineBody">
                        <strong>{getLeadArtist(entry)}</strong>
                        <span>{entry.title}</span>
                        <small>{entry.venue}</small>
                      </div>
                      {entry.images[0]?.src ? (
                        <div className="archiveTimelineThumb">
                          <img src={entry.images[0].src} alt={entry.title} />
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <RecordListTable
            entries={timelineEntries}
            selectedEntryId={selectedEntryId}
            highlightedEntryId={highlightedEntryId}
            selectedEntryIds={selectedEntryIds}
            visibleSelectedCount={visibleSelectedCount}
            visibleListColumns={visibleListColumns}
            columnWidths={columnWidths}
            density={listDensity}
            dateSortOrder={dateSortOrder}
            onToggleVisibleEntries={onToggleVisibleEntries}
            onToggleEntrySelection={onToggleEntrySelection}
            onSelectEntry={onSelectEntry}
            onToggleDateSort={onToggleDateSort}
            onResizeStart={onResizeStart}
          />
        )}
      </section>
      <section className="panel archiveSectionCard">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Timeline Analytics</p>
            <h2>タイムライン分析</h2>
            <p>年ごとの推移と全体サマリをここで見ます。</p>
          </div>
        </div>
        <div
          className="analyticsBoardGrid"
          style={{ gridTemplateRows: `repeat(${dashboardRowCount}, minmax(0, 1fr))` }}
        >
          {timelineTiles.map((tile) => (
            <div
              key={tile.id}
              ref={(element) => {
                analyticsTileRefs.current[tile.id] = element;
              }}
              className={`analyticsBoardTile analyticsBoardTile-${resolvedAnalyticsTileHeights[tile.id]}`}
              style={{
                gridColumn: `${tile.colStart} / span ${tile.colSpan}`,
                gridRow: `${tile.rowStart} / span ${tile.rowSpan}`
              }}
            >
              {tileMap[tile.id]}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

type EntityArchive = {
  label: string;
  count: number;
  firstDate: string;
  lastDate: string;
  place?: string;
  years?: TrendBucket[];
  entries: LiveEntry[];
};

type ArtistsViewProps = {
  artists: EntityArchive[];
  selectedArtistLabel: string;
  onSelectArtist(artist: string): void;
  onSelectEntry(entryId: string): void;
  onBrowseArtistHistory(artist: string): void;
  getLeadArtist(entry: LiveEntry): string;
  artistTiles: PositionedDashboardTile[];
  analyticsTileRefs: MutableRefObject<Partial<Record<AnalyticsTileId, HTMLDivElement | null>>>;
  resolvedAnalyticsTileHeights: Record<AnalyticsTileId, TileHeight>;
  tileMap: Record<AnalyticsTileId, ReactNode>;
  dashboardRowCount: number;
};

export function LiveLogArtistsView({
  artists,
  selectedArtistLabel,
  onSelectArtist,
  onSelectEntry,
  onBrowseArtistHistory,
  getLeadArtist,
  artistTiles,
  analyticsTileRefs,
  resolvedAnalyticsTileHeights,
  tileMap,
  dashboardRowCount
}: ArtistsViewProps) {
  const [artistQuery, setArtistQuery] = useState("");
  const normalizedArtistQuery = artistQuery.trim().toLowerCase();
  const topArtists = artists.slice(0, 10);
  const filteredArtists = useMemo(() => {
    if (!normalizedArtistQuery) {
      return topArtists;
    }

    return artists.filter((artist) => artist.label.toLowerCase().includes(normalizedArtistQuery));
  }, [artists, normalizedArtistQuery, topArtists]);
  const selectedArtist = artists.find((item) => item.label === selectedArtistLabel) ?? artists[0] ?? null;
  const visibleArtists = useMemo(() => {
    if (!selectedArtist) {
      return filteredArtists;
    }

    if (filteredArtists.some((artist) => artist.label === selectedArtist.label)) {
      return filteredArtists;
    }

    return [selectedArtist, ...filteredArtists];
  }, [filteredArtists, selectedArtist]);
  const selectedArtistEntries = selectedArtist?.entries.slice(0, 10) ?? [];

  return (
    <section className="archiveEntityLayout">
      <section className="panel archiveEntityListPanel">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Artists</p>
            <h2>アーティスト</h2>
            <p>{normalizedArtistQuery ? "検索結果" : "まずは参加回数の多い10組を表示しています。"}</p>
          </div>
        </div>
        <div className="searchBox archiveEntitySearchBox">
          <span>検索</span>
          <input
            value={artistQuery}
            onChange={(event) => setArtistQuery(event.target.value)}
            placeholder="アーティスト名で絞り込む"
          />
        </div>
        <div className="archiveEntityList">
          {visibleArtists.map((artist) => (
            <button
              key={artist.label}
              className={selectedArtist?.label === artist.label ? "archiveEntityItem archiveEntityItemActive" : "archiveEntityItem"}
              type="button"
              onClick={() => onSelectArtist(artist.label)}
            >
              <strong>{artist.label}</strong>
              <span>{artist.count}回</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel archiveEntityDetailPanel">
        {selectedArtist ? (
          <>
            <div className="archiveSectionHeader">
              <div>
                <p className="eyebrow">Artist Detail</p>
                <h2>{selectedArtist.label}</h2>
              </div>
            </div>
            <div className="archiveEntityStats">
              <article className="archiveStat">
                <span>総ライブ回数</span>
                <strong>{selectedArtist.count}</strong>
              </article>
              <article className="archiveStat">
                <span>初めて見た日</span>
                <strong>{selectedArtist.firstDate || "-"}</strong>
              </article>
              <article className="archiveStat">
                <span>最後に見た日</span>
                <strong>{selectedArtist.lastDate || "-"}</strong>
              </article>
            </div>
            <div className="archiveMiniTrend">
              {(selectedArtist.years ?? []).map((item) => (
                <div key={item.label} className="archiveMiniTrendBar">
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
            <div className="archiveLinkedList">
              {selectedArtistEntries.map((entry) => (
                <button
                  key={entry.id}
                  className="archiveLinkedItem"
                  type="button"
                  onClick={() => onSelectEntry(entry.id)}
                >
                  <strong>{getLeadArtist(entry)}</strong>
                  <span>{entry.title}</span>
                  <small>
                    {entry.date} / {entry.venue}
                  </small>
                </button>
              ))}
            </div>
            {selectedArtist.entries.length > selectedArtistEntries.length ? (
              <button
                className="archiveEntityListHintButton"
                type="button"
                onClick={() => onBrowseArtistHistory(selectedArtist.label)}
              >
                最新10件を表示中です。タイムラインで続きを見る
              </button>
            ) : null}
          </>
        ) : null}
      </section>
      <section className="panel archiveSectionCard">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Artist Analytics</p>
            <h2>アーティスト分析</h2>
          <p>選択中アーティストの推移をここで見ます。</p>
          </div>
        </div>
        <div
          className="analyticsBoardGrid"
          style={{ gridTemplateRows: `repeat(${dashboardRowCount}, minmax(0, 1fr))` }}
        >
          {artistTiles.map((tile) => (
            <div
              key={tile.id}
              ref={(element) => {
                analyticsTileRefs.current[tile.id] = element;
              }}
              className={`analyticsBoardTile analyticsBoardTile-${resolvedAnalyticsTileHeights[tile.id]}`}
              style={{
                gridColumn: `${tile.colStart} / span ${tile.colSpan}`,
                gridRow: `${tile.rowStart} / span ${tile.rowSpan}`
              }}
            >
              {tileMap[tile.id]}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

type VenuesViewProps = {
  venues: EntityArchive[];
  selectedVenueLabel: string;
  onSelectVenue(venue: string): void;
  onSelectEntry(entryId: string): void;
  getLeadArtist(entry: LiveEntry): string;
  venueTiles: PositionedDashboardTile[];
  analyticsTileRefs: MutableRefObject<Partial<Record<AnalyticsTileId, HTMLDivElement | null>>>;
  resolvedAnalyticsTileHeights: Record<AnalyticsTileId, TileHeight>;
  tileMap: Record<AnalyticsTileId, ReactNode>;
  dashboardRowCount: number;
};

export function LiveLogVenuesView({
  venues,
  selectedVenueLabel,
  onSelectVenue,
  onSelectEntry,
  getLeadArtist,
  venueTiles,
  analyticsTileRefs,
  resolvedAnalyticsTileHeights,
  tileMap,
  dashboardRowCount
}: VenuesViewProps) {
  const selectedVenue = venues.find((item) => item.label === selectedVenueLabel) ?? venues[0] ?? null;

  return (
    <section className="archiveEntityLayout">
      <section className="panel archiveEntityListPanel">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Venues</p>
            <h2>会場</h2>
          </div>
        </div>
        <div className="archiveEntityList">
          {venues.map((venue) => (
            <button
              key={venue.label}
              className={selectedVenue?.label === venue.label ? "archiveEntityItem archiveEntityItemActive" : "archiveEntityItem"}
              type="button"
              onClick={() => onSelectVenue(venue.label)}
            >
              <strong>{venue.label}</strong>
              <span>{venue.count}回</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel archiveEntityDetailPanel">
        {selectedVenue ? (
          <>
            <div className="archiveSectionHeader">
              <div>
                <p className="eyebrow">Venue Detail</p>
                <h2>{selectedVenue.label}</h2>
              </div>
            </div>
            <div className="archiveEntityStats">
              <article className="archiveStat">
                <span>訪問回数</span>
                <strong>{selectedVenue.count}</strong>
              </article>
              <article className="archiveStat">
                <span>エリア</span>
                <strong>{selectedVenue.place || "-"}</strong>
              </article>
              <article className="archiveStat">
                <span>最後に行った日</span>
                <strong>{selectedVenue.lastDate || "-"}</strong>
              </article>
            </div>
            <div className="archiveLinkedList">
              {selectedVenue.entries.map((entry) => (
                <button
                  key={entry.id}
                  className="archiveLinkedItem"
                  type="button"
                  onClick={() => onSelectEntry(entry.id)}
                >
                  <strong>{getLeadArtist(entry)}</strong>
                  <span>{entry.title}</span>
                  <small>
                    {entry.date} / {entry.venue}
                  </small>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </section>
      <section className="panel archiveSectionCard">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Venue Analytics</p>
            <h2>会場分析</h2>
            <p>会場と地域の集計をここで見ます。</p>
          </div>
        </div>
        <div
          className="analyticsBoardGrid"
          style={{ gridTemplateRows: `repeat(${dashboardRowCount}, minmax(0, 1fr))` }}
        >
          {venueTiles.map((tile) => (
            <div
              key={tile.id}
              ref={(element) => {
                analyticsTileRefs.current[tile.id] = element;
              }}
              className={`analyticsBoardTile analyticsBoardTile-${resolvedAnalyticsTileHeights[tile.id]}`}
              style={{
                gridColumn: `${tile.colStart} / span ${tile.colSpan}`,
                gridRow: `${tile.rowStart} / span ${tile.rowSpan}`
              }}
            >
              {tileMap[tile.id]}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

type AddViewProps = {
  activeTool: ActiveTool;
  query: string;
  recordVisibilityFilter: RecordVisibilityFilter;
  filteredEntryCount: number;
  visibleSelectedCount: number;
  csvMessage: string;
  imageMessage: string;
  manualForm: ManualEntryInput;
  photoForm: PhotoUploadInput;
  bulkEdit: BulkEditInput;
  csvInputRef: RefObject<HTMLInputElement | null>;
  photoInputRef: RefObject<HTMLInputElement | null>;
  entries: LiveEntry[];
  imageService: ArchiveImageService;
  onToggleTool(tool: Exclude<ActiveTool, null>): void;
  onQueryChange(value: string): void;
  onRecordVisibilityFilterChange(value: RecordVisibilityFilter): void;
  onManualSubmit(event: FormEvent<HTMLFormElement>): void;
  onCsvImport(event: ChangeEvent<HTMLInputElement>): void;
  onPhotoImport(event: ChangeEvent<HTMLInputElement>): void;
  onUpdateForm<K extends keyof ManualEntryInput>(key: K, value: ManualEntryInput[K]): void;
  onUpdatePhotoForm<K extends keyof PhotoUploadInput>(
    key: K,
    value: PhotoUploadInput[K]
  ): void;
  onUpdateBulkEdit<K extends keyof BulkEditInput>(key: K, value: BulkEditInput[K]): void;
  onApplyBulkUpdate(): void;
  onDeleteSelectedEntries(): void;
  onBatchApply(entries: LiveEntry[] | ((current: LiveEntry[]) => LiveEntry[])): void;
  onLinkedToEntry(entryId: string): void;
  addTiles: PositionedDashboardTile[];
  analyticsTileRefs: MutableRefObject<Partial<Record<AnalyticsTileId, HTMLDivElement | null>>>;
  resolvedAnalyticsTileHeights: Record<AnalyticsTileId, TileHeight>;
  tileMap: Record<AnalyticsTileId, ReactNode>;
  dashboardRowCount: number;
};

export function LiveLogAddView({
  activeTool,
  query,
  recordVisibilityFilter,
  filteredEntryCount,
  visibleSelectedCount,
  csvMessage,
  imageMessage,
  manualForm,
  photoForm,
  bulkEdit,
  csvInputRef,
  photoInputRef,
  entries,
  imageService,
  onToggleTool,
  onQueryChange,
  onRecordVisibilityFilterChange,
  onManualSubmit,
  onCsvImport,
  onPhotoImport,
  onUpdateForm,
  onUpdatePhotoForm,
  onUpdateBulkEdit,
  onApplyBulkUpdate,
  onDeleteSelectedEntries,
  onBatchApply,
  onLinkedToEntry,
  addTiles,
  analyticsTileRefs,
  resolvedAnalyticsTileHeights,
  tileMap,
  dashboardRowCount
}: AddViewProps) {
  return (
    <section className="archiveAddLayout">
      <RecordToolsPanel
        activeTool={activeTool}
        onToggleTool={onToggleTool}
        query={query}
        onQueryChange={onQueryChange}
        recordVisibilityFilter={recordVisibilityFilter}
        onRecordVisibilityFilterChange={onRecordVisibilityFilterChange}
        filteredEntryCount={filteredEntryCount}
        visibleSelectedCount={visibleSelectedCount}
        csvMessage={csvMessage}
        imageMessage={imageMessage}
        manualForm={manualForm}
        photoForm={photoForm}
        bulkEdit={bulkEdit}
        csvInputRef={csvInputRef}
        photoInputRef={photoInputRef}
        onManualSubmit={onManualSubmit}
        onCsvImport={onCsvImport}
        onPhotoImport={onPhotoImport}
        onUpdateForm={onUpdateForm}
        onUpdatePhotoForm={onUpdatePhotoForm}
        onUpdateBulkEdit={onUpdateBulkEdit}
        onApplyBulkUpdate={onApplyBulkUpdate}
        onDeleteSelectedEntries={onDeleteSelectedEntries}
      />
      <BatchImportBoard
        entries={entries}
        imageService={imageService}
        onApply={onBatchApply}
        onLinkedToEntry={onLinkedToEntry}
      />
      <section className="panel archiveSectionCard">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Event Analytics</p>
            <h2>イベント追加まわりの分析</h2>
            <p>形式や入力の偏りを見ながら追加できます。</p>
          </div>
        </div>
        <div
          className="analyticsBoardGrid"
          style={{ gridTemplateRows: `repeat(${dashboardRowCount}, minmax(0, 1fr))` }}
        >
          {addTiles.map((tile) => (
            <div
              key={tile.id}
              ref={(element) => {
                analyticsTileRefs.current[tile.id] = element;
              }}
              className={`analyticsBoardTile analyticsBoardTile-${resolvedAnalyticsTileHeights[tile.id]}`}
              style={{
                gridColumn: `${tile.colStart} / span ${tile.colSpan}`,
                gridRow: `${tile.rowStart} / span ${tile.rowSpan}`
              }}
            >
              {tileMap[tile.id]}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
