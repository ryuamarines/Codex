"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RecordListTable } from "@/components/record-list-table";
import type { LiveEntry } from "@/lib/types";

type ListDensity = "comfortable" | "compact";
type TimelinePresentation = "cards" | "table";
type ListColumn = "venue" | "place" | "artists" | "year" | "genre" | "photos";
type TableColumn = "date" | "title" | ListColumn;

const LIST_COLUMN_OPTIONS: Array<{ key: ListColumn; label: string }> = [
  { key: "venue", label: "会場" },
  { key: "place", label: "地域" },
  { key: "artists", label: "出演者" },
  { key: "year", label: "年" },
  { key: "genre", label: "形式" },
  { key: "photos", label: "写真" }
];
const TIMELINE_PAGE_SIZE = 24;

type TimelineGroup = {
  monthKey: string;
  monthLabel: string;
  items: LiveEntry[];
};

type TimelineViewProps = {
  summaryContent?: ReactNode;
  detailContent?: ReactNode;
  utilityContent?: ReactNode;
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
};

export function LiveLogTimelineView({
  summaryContent,
  detailContent,
  utilityContent,
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
  getLeadArtist
}: TimelineViewProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(timelineEntries.length / TIMELINE_PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * TIMELINE_PAGE_SIZE;
  const visibleTimelineEntries = useMemo(
    () => timelineEntries.slice(pageStart, pageStart + TIMELINE_PAGE_SIZE),
    [pageStart, timelineEntries]
  );
  const visibleTimelineEntryIds = useMemo(
    () => new Set(visibleTimelineEntries.map((entry) => entry.id)),
    [visibleTimelineEntries]
  );
  const visibleTimelineGroups = useMemo(
    () =>
      timelineGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((entry) => visibleTimelineEntryIds.has(entry.id))
        }))
        .filter((group) => group.items.length > 0),
    [timelineGroups, visibleTimelineEntryIds]
  );

  useEffect(() => {
    setPageIndex(0);
  }, [query, selectedYear, timelinePresentation]);

  useEffect(() => {
    const selectedIndex = timelineEntries.findIndex((entry) => entry.id === selectedEntryId);

    if (selectedIndex >= 0) {
      setPageIndex(Math.floor(selectedIndex / TIMELINE_PAGE_SIZE));
    }
  }, [selectedEntryId, timelineEntries]);

  return (
    <section className="archiveTimelineLayout">
      <div className="archiveTimelineSummaryRow">{summaryContent}</div>
      <div className="archiveTimelineBodyGrid">
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
              {visibleTimelineGroups.map((group) => (
                <section key={group.monthKey} className="archiveMonthGroup">
                  <div className="archiveMonthHeading">
                    <strong>{group.monthLabel}</strong>
                    <span>{group.items.length}件</span>
                  </div>
                  <div className="archiveTimelineCards">
                    {group.items.map((entry) => (
                      <button
                        key={entry.id}
                        className={`archiveTimelineCard ${
                          selectedEntryId === entry.id ? "archiveTimelineCardActive" : ""
                        } ${highlightedEntryId === entry.id ? "archiveTimelineCardNew" : ""}`.trim()}
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
              entries={visibleTimelineEntries}
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
          {timelineEntries.length > 0 ? (
            <nav className="timelinePagination" aria-label="タイムラインのページ">
              <button
                type="button"
                aria-label="前のページ"
                title="前のページ"
                disabled={safePageIndex === 0}
                onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              >
                ←
              </button>
              <span>
                {pageStart + 1}–{Math.min(pageStart + TIMELINE_PAGE_SIZE, timelineEntries.length)} / {timelineEntries.length}件
              </span>
              <button
                type="button"
                aria-label="次のページ"
                title="次のページ"
                disabled={safePageIndex >= pageCount - 1}
                onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
              >
                →
              </button>
            </nav>
          ) : (
            <p className="timelineEmptyState">この年に一致する記録はありません。</p>
          )}
        </section>
        <div className="archiveTimelineDetailColumn">{detailContent}</div>
      </div>
      {utilityContent ? <div className="archiveTimelineUtilityRow">{utilityContent}</div> : null}
    </section>
  );
}
