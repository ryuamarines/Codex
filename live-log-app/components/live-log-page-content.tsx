"use client";

import type { ChangeEvent, FormEvent, MutableRefObject, ReactNode, RefObject } from "react";
import { ArtistYearStackedChartCard, SummaryTile } from "@/components/analytics-cards";
import { CloudSyncPanel } from "@/components/cloud-sync-panel";
import { LiveLogArtistsView, LiveLogVenuesView } from "@/components/live-log-entity-views";
import { LiveLogHomeView } from "@/components/live-log-home-view";
import { RecordDetailPanel } from "@/components/record-detail-panel";
import { RecordUtilitiesPanel } from "@/components/record-tools-panel";
import { LiveLogAddView } from "@/components/live-log-views";
import { LiveLogTimelineView } from "@/components/live-log-timeline-view";
import type { YearlyAggregateKey } from "@/components/yearly-summary-panel";
import type { ArchiveImageService } from "@/lib/archive-image-service";
import type { AggregateBucket, TrendBucket } from "@/lib/live-analytics";
import type { AnalyticsTileId, PositionedDashboardTile, TileHeight, TileSize } from "@/lib/analytics-dashboard";
import type { LiveEntry } from "@/lib/types";

type ActiveView = "home" | "timeline" | "add" | "artists" | "venues" | "sync";
type ListDensity = "comfortable" | "compact";
type TimelinePresentation = "cards" | "table";
type ListColumn = "venue" | "place" | "artists" | "year" | "genre" | "photos";
type TableColumn = "date" | "title" | ListColumn;
type RecordVisibilityFilter = "all" | "withPhotos" | "withUnsyncedImages";
type ActiveTool = "csv" | "bulk" | null;

type ManualEntryInput = {
  title: string;
  date: string;
  place: string;
  venue: string;
  artistsText: string;
  genre: string;
  memo: string;
};

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

type LiveLogPageContentProps = {
  activeView: ActiveView;
  selectedEntry: LiveEntry | null;
  isDetailDrawerOpen: boolean;
  detailPhotoInputRef: RefObject<HTMLInputElement | null>;
  selectedYear: string;
  availableYears: string[];
  currentYear: string;
  currentYearEntriesCount: number;
  currentMonthEntriesCount: number;
  imageCount: number;
  overview: { entryCount: number; artistCount: number; imageCount: number };
  recentEntries: LiveEntry[];
  topArtists: AggregateBucket[];
  yearlyArchiveCards: Array<{ year: string; count: number; topArtist: string }>;
  yearlySummaryRef: RefObject<HTMLDivElement | null>;
  yearOverview: { entryCount: number; artistCount: number; imageCount: number };
  yearAggregates: {
    focusArtists: AggregateBucket[];
    places: AggregateBucket[];
    venues: AggregateBucket[];
    genres: AggregateBucket[];
  };
  timelinePresentation: TimelinePresentation;
  listDensity: ListDensity;
  visibleListColumns: ListColumn[];
  query: string;
  timelineGroups: Array<{ monthKey: string; monthLabel: string; items: LiveEntry[] }>;
  timelineEntries: LiveEntry[];
  selectedEntryId: string;
  highlightedEntryId: string;
  selectedEntryIds: string[];
  visibleSelectedCount: number;
  columnWidths: Record<TableColumn, number>;
  dateSortOrder: "desc" | "asc";
  artistArchiveView: Array<{
    label: string;
    count: number;
    firstDate: string;
    lastDate: string;
    years?: TrendBucket[];
    entries: LiveEntry[];
  }>;
  selectedArtistLabel: string;
  venueArchiveView: Array<{
    label: string;
    count: number;
    firstDate: string;
    lastDate: string;
    place?: string;
    entries: LiveEntry[];
  }>;
  selectedVenueLabel: string;
  venueTiles: PositionedDashboardTile[];
  analyticsTileRefs: MutableRefObject<Partial<Record<AnalyticsTileId, HTMLDivElement | null>>>;
  resolvedAnalyticsTileHeights: Record<AnalyticsTileId, TileHeight>;
  resolvedAnalyticsTileSizes: Record<AnalyticsTileId, TileSize>;
  venueDashboardRowCount: number;
  trends: {
    byYear: TrendBucket[];
    artistYears: {
      years: string[];
      items: Array<{
        artist: string;
        countsByYear: Record<string, number>;
        total: number;
      }>;
    };
  };
  tileMap: Record<AnalyticsTileId, ReactNode>;
  activeTool: ActiveTool;
  recordVisibilityFilter: RecordVisibilityFilter;
  filteredEntryCount: number;
  csvMessage: string;
  imageMessage: string;
  manualForm: ManualEntryInput;
  photoForm: PhotoUploadInput;
  bulkEdit: BulkEditInput;
  placeOptions: string[];
  genreOptions: string[];
  driveFolderLabel: string;
  csvInputRef: RefObject<HTMLInputElement | null>;
  photoInputRef: RefObject<HTMLInputElement | null>;
  entries: LiveEntry[];
  imageService: ArchiveImageService;
  backupMessage: string;
  firebaseUserPresent: boolean;
  syncStatus: string;
  authMessage: string;
  lastSyncedAtLabel: string;
  hasDriveAccessToken: boolean;
  driveFolderId: string;
  driveSessionSavedAtLabel: string;
  isDriveAccessStale: boolean;
  renderYearlySummaryActions(): ReactNode;
  renderYearlyAggregateActions(key: YearlyAggregateKey, label: string): ReactNode;
  registerAggregateRef(key: YearlyAggregateKey, element: HTMLDivElement | null): void;
  createArtistTrendActions(): ReactNode;
  onSelectEntry(entryId: string): void;
  onSelectArtist(artist: string): void;
  onSelectVenue(venue: string): void;
  onSetActiveView(view: ActiveView): void;
  onSetSelectedYear(year: string): void;
  onSetQuery(value: string): void;
  onSetTimelinePresentation(value: TimelinePresentation): void;
  onSetListDensity(value: ListDensity): void;
  onToggleListColumn(column: ListColumn): void;
  onToggleVisibleEntries(checked: boolean): void;
  onToggleEntrySelection(entryId: string, checked: boolean): void;
  onToggleDateSort(): void;
  onResizeStart(column: TableColumn, clientX: number): void;
  onToggleTool(tool: Exclude<ActiveTool, null>): void;
  onSetRecordVisibilityFilter(value: RecordVisibilityFilter): void;
  onManualSubmit(event: FormEvent<HTMLFormElement>): void;
  onCsvImport(event: ChangeEvent<HTMLInputElement>): void;
  onPhotoImport(event: ChangeEvent<HTMLInputElement>): void;
  onUpdateForm<K extends keyof ManualEntryInput>(key: K, value: ManualEntryInput[K]): void;
  onUpdatePhotoForm<K extends keyof PhotoUploadInput>(key: K, value: PhotoUploadInput[K]): void;
  onUpdateBulkEdit<K extends keyof BulkEditInput>(key: K, value: BulkEditInput[K]): void;
  onApplyBulkUpdate(): void;
  onDeleteSelectedEntries(): void;
  onConfigureDriveFolder(value: string): void;
  onBatchApply(entries: LiveEntry[] | ((current: LiveEntry[]) => LiveEntry[])): void;
  onLinkedToEntry(entryId: string): void;
  onGoogleSignIn(): void;
  onGoogleSignOut(): void;
  onCloudLoad(): void;
  onSaveCurrentToCloud(): void;
  onOpenPhotoPicker(): void;
  onCloseDrawer(): void;
  onEntryImageUpload(entryId: string, event: ChangeEvent<HTMLInputElement>): void;
  onDeleteImage(entryId: string, imageId: string): void;
  onRetryImageSync(entryId: string, imageId: string): void;
  onRetryEntryImageSync(entryId: string): void;
  onDeleteEntry(entryId: string): void;
  onUpdateEntryField(entryId: string, field: keyof LiveEntry, value: string): void;
  formatDay(value: string): string;
  formatWeekday(value: string): string;
  getLeadArtist(entry: LiveEntry): string;
  onExportCsv(): void;
};

export function LiveLogPageContent(props: LiveLogPageContentProps) {
  const {
    activeView,
    selectedEntry,
    isDetailDrawerOpen,
    detailPhotoInputRef,
    selectedYear,
    availableYears,
    currentYear,
    currentYearEntriesCount,
    currentMonthEntriesCount,
    imageCount,
    overview,
    recentEntries,
    topArtists,
    yearlyArchiveCards,
    yearlySummaryRef,
    yearOverview,
    yearAggregates,
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
    artistArchiveView,
    selectedArtistLabel,
    venueArchiveView,
    selectedVenueLabel,
    venueTiles,
    analyticsTileRefs,
    resolvedAnalyticsTileHeights,
    resolvedAnalyticsTileSizes,
    venueDashboardRowCount,
    trends,
    tileMap,
    activeTool,
    recordVisibilityFilter,
    filteredEntryCount,
    csvMessage,
    imageMessage,
    manualForm,
    photoForm,
    bulkEdit,
    placeOptions,
    genreOptions,
    driveFolderLabel,
    csvInputRef,
    photoInputRef,
    entries,
    imageService,
    backupMessage,
    firebaseUserPresent,
    syncStatus,
    authMessage,
    lastSyncedAtLabel,
    hasDriveAccessToken,
    driveFolderId,
    driveSessionSavedAtLabel,
    isDriveAccessStale,
    renderYearlySummaryActions,
    renderYearlyAggregateActions,
    registerAggregateRef,
    createArtistTrendActions,
    onSelectEntry,
    onSelectArtist,
    onSelectVenue,
    onSetActiveView,
    onSetSelectedYear,
    onSetQuery,
    onSetTimelinePresentation,
    onSetListDensity,
    onToggleListColumn,
    onToggleVisibleEntries,
    onToggleEntrySelection,
    onToggleDateSort,
    onResizeStart,
    onToggleTool,
    onSetRecordVisibilityFilter,
    onManualSubmit,
    onCsvImport,
    onPhotoImport,
    onUpdateForm,
    onUpdatePhotoForm,
    onUpdateBulkEdit,
    onApplyBulkUpdate,
    onDeleteSelectedEntries,
    onConfigureDriveFolder,
    onBatchApply,
    onLinkedToEntry,
    onGoogleSignIn,
    onGoogleSignOut,
    onCloudLoad,
    onSaveCurrentToCloud,
    onOpenPhotoPicker,
    onCloseDrawer,
    onEntryImageUpload,
    onDeleteImage,
    onRetryImageSync,
    onRetryEntryImageSync,
    onDeleteEntry,
    onUpdateEntryField,
    formatDay,
    formatWeekday,
    getLeadArtist,
    onExportCsv
  } = props;

  return (
    <>
      {activeView === "home" ? (
        <LiveLogHomeView
          currentYear={currentYear}
          currentYearEntriesCount={currentYearEntriesCount}
          currentMonthEntriesCount={currentMonthEntriesCount}
          imageCount={imageCount}
          recentEntries={recentEntries}
          topArtists={topArtists}
          yearlyArchiveCards={yearlyArchiveCards}
          yearlySummaryRef={yearlySummaryRef}
          selectedYear={selectedYear}
          availableYears={availableYears}
          yearOverview={yearOverview}
          yearAggregates={yearAggregates}
          onSelectEntry={(entryId) => {
            onSelectEntry(entryId);
            onSetActiveView("timeline");
          }}
          onShowTimeline={() => onSetActiveView("timeline")}
          onShowArtists={() => onSetActiveView("artists")}
          onSelectArtist={(artist) => {
            onSelectArtist(artist);
            onSetActiveView("artists");
          }}
          onSelectYear={(year) => {
            onSetSelectedYear(year);
            onSetActiveView("timeline");
          }}
          renderYearlySummaryActions={renderYearlySummaryActions}
          renderYearlyAggregateActions={renderYearlyAggregateActions}
          registerAggregateRef={registerAggregateRef}
        />
      ) : activeView === "sync" ? (
        <section className="archiveHomeLayout">
          <CloudSyncPanel
            isLoggedIn={firebaseUserPresent}
            syncStatus={syncStatus}
            authMessage={authMessage}
            lastSyncedAtLabel={lastSyncedAtLabel}
            hasDriveAccessToken={hasDriveAccessToken}
            driveFolderId={driveFolderId}
            driveSessionSavedAtLabel={driveSessionSavedAtLabel}
            isDriveAccessStale={isDriveAccessStale}
            onGoogleSignIn={onGoogleSignIn}
            onGoogleSignOut={onGoogleSignOut}
            onConfigureDriveFolder={onConfigureDriveFolder}
            onSaveCurrentToCloud={onSaveCurrentToCloud}
            onCloudLoad={onCloudLoad}
          />
          <section className="panel archiveSectionCard">
            <div className="archiveSectionHeader">
              <div>
                <p className="eyebrow">Backup</p>
                <h2>ローカルのバックアップ</h2>
                <p>{backupMessage}</p>
              </div>
              <button className="toolButton" type="button" onClick={onExportCsv}>
                CSVを書き出す
              </button>
            </div>
          </section>
        </section>
      ) : activeView === "timeline" ? (
        <LiveLogTimelineView
          summaryContent={
            <div className="archiveTimelineSummaryCard">
              <SummaryTile overview={overview} backupMessage={backupMessage} height="compact" />
            </div>
          }
          detailContent={
            <>
              {selectedEntry ? (
                <RecordDetailPanel
                  selectedEntry={selectedEntry}
                  detailPhotoInputRef={detailPhotoInputRef}
                  variant="panel"
                  isOpen
                  onOpenPhotoPicker={onOpenPhotoPicker}
                  onEntryImageUpload={onEntryImageUpload}
                  onDeleteImage={onDeleteImage}
                  onRetryImageSync={onRetryImageSync}
                  onRetryEntryImageSync={onRetryEntryImageSync}
                  onDeleteEntry={onDeleteEntry}
                  onUpdateEntryField={onUpdateEntryField}
                />
              ) : (
                <section className="panel archiveEntityDetailPanel archiveTimelineEmptyDetail">
                  <div className="archiveSectionHeader">
                    <div>
                      <p className="eyebrow">Detail</p>
                      <h2>ライブ詳細</h2>
                      <p>タイムラインから記録を選ぶと、ここで修正や削除ができます。</p>
                    </div>
                  </div>
                </section>
              )}
              <div className="archiveTimelineYearTrendCard">{tileMap.yearTrend}</div>
            </>
          }
          utilityContent={
            <RecordUtilitiesPanel
              activeTool={activeTool}
              onToggleTool={onToggleTool}
              query={query}
              onQueryChange={onSetQuery}
              recordVisibilityFilter={recordVisibilityFilter}
              onRecordVisibilityFilterChange={onSetRecordVisibilityFilter}
              filteredEntryCount={filteredEntryCount}
              visibleSelectedCount={visibleSelectedCount}
              csvMessage={csvMessage}
              bulkEdit={bulkEdit}
              csvInputRef={csvInputRef}
              onCsvImport={onCsvImport}
              onUpdateBulkEdit={onUpdateBulkEdit}
              onApplyBulkUpdate={onApplyBulkUpdate}
              onDeleteSelectedEntries={onDeleteSelectedEntries}
            />
          }
          selectedYear={selectedYear}
          availableYears={availableYears}
          timelinePresentation={timelinePresentation}
          listDensity={listDensity}
          visibleListColumns={visibleListColumns}
          query={query}
          timelineGroups={timelineGroups}
          timelineEntries={timelineEntries}
          selectedEntryId={selectedEntryId}
          highlightedEntryId={highlightedEntryId}
          selectedEntryIds={selectedEntryIds}
          visibleSelectedCount={visibleSelectedCount}
          columnWidths={columnWidths}
          dateSortOrder={dateSortOrder}
          onQueryChange={onSetQuery}
          onSelectYear={onSetSelectedYear}
          onSelectEntry={onSelectEntry}
          onSetTimelinePresentation={onSetTimelinePresentation}
          onSetListDensity={onSetListDensity}
          onToggleListColumn={onToggleListColumn}
          onToggleVisibleEntries={onToggleVisibleEntries}
          onToggleEntrySelection={onToggleEntrySelection}
          onToggleDateSort={onToggleDateSort}
          onResizeStart={onResizeStart}
          formatDay={formatDay}
          formatWeekday={formatWeekday}
          getLeadArtist={getLeadArtist}
        />
      ) : activeView === "artists" ? (
        <LiveLogArtistsView
          artists={artistArchiveView}
          selectedArtistLabel={selectedArtistLabel}
          onSelectArtist={onSelectArtist}
          onSelectEntry={(entryId) => {
            onSelectEntry(entryId);
            onSetActiveView("timeline");
          }}
          onBrowseArtistHistory={(artist, year) => {
            onSetQuery(artist);
            if (year) {
              onSetSelectedYear(year);
            }
            onSetActiveView("timeline");
          }}
          getLeadArtist={getLeadArtist}
          analyticsTileRefs={analyticsTileRefs}
          resolvedAnalyticsTileHeights={resolvedAnalyticsTileHeights}
          renderArtistTrendTile={(focusedArtistLabel) => (
            <ArtistYearStackedChartCard
              title="アーティスト別 推移グラフ"
              years={trends.artistYears.years}
              items={trends.artistYears.items}
              focusedArtistLabel={focusedArtistLabel}
              height={resolvedAnalyticsTileHeights.artistYearStackedChart}
              size={resolvedAnalyticsTileSizes.artistYearStackedChart}
              actions={createArtistTrendActions()}
            />
          )}
        />
      ) : activeView === "venues" ? (
        <LiveLogVenuesView
          venues={venueArchiveView}
          selectedVenueLabel={selectedVenueLabel}
          onSelectVenue={onSelectVenue}
          onSelectEntry={(entryId) => {
            onSelectEntry(entryId);
            onSetActiveView("timeline");
          }}
          getLeadArtist={getLeadArtist}
          venueTiles={venueTiles}
          analyticsTileRefs={analyticsTileRefs}
          resolvedAnalyticsTileHeights={resolvedAnalyticsTileHeights}
          tileMap={tileMap}
          dashboardRowCount={venueDashboardRowCount}
        />
      ) : (
        <LiveLogAddView
          imageMessage={imageMessage}
          manualForm={manualForm}
          photoForm={photoForm}
          placeOptions={placeOptions}
          genreOptions={genreOptions}
          driveFolderLabel={driveFolderLabel}
          photoInputRef={photoInputRef}
          entries={entries}
          imageService={imageService}
          onManualSubmit={onManualSubmit}
          onPhotoImport={onPhotoImport}
          onUpdateForm={onUpdateForm}
          onUpdatePhotoForm={onUpdatePhotoForm}
          onConfigureDriveFolder={() => onSetActiveView("sync")}
          onBatchApply={onBatchApply}
          onLinkedToEntry={(entryId) => {
            onSetQuery("");
            onSelectEntry(entryId);
          }}
        />
      )}

      {selectedEntry && activeView !== "timeline" && activeView !== "add" ? (
        <RecordDetailPanel
          selectedEntry={selectedEntry}
          detailPhotoInputRef={detailPhotoInputRef}
          variant="drawer"
          isOpen={isDetailDrawerOpen}
          onOpenPhotoPicker={onOpenPhotoPicker}
          onClose={onCloseDrawer}
          onEntryImageUpload={onEntryImageUpload}
          onDeleteImage={onDeleteImage}
          onRetryImageSync={onRetryImageSync}
          onRetryEntryImageSync={onRetryEntryImageSync}
          onDeleteEntry={onDeleteEntry}
          onUpdateEntryField={onUpdateEntryField}
        />
      ) : null}
    </>
  );
}
