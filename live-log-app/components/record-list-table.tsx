"use client";

type ListColumn = "venue" | "place" | "artists" | "year" | "genre" | "photos";
type TableColumn = "date" | "title" | ListColumn;

type TableEntry = {
  id: string;
  title: string;
  date: string;
  place: string;
  venue: string;
  artists: string[];
  genre: string;
  images: { id: string; storageStatus?: "cloud" | "local_pending" | "syncing" | "error"; driveWebUrl?: string }[];
};

type RecordListTableProps = {
  entries: TableEntry[];
  selectedEntryId: string;
  highlightedEntryId?: string;
  selectedEntryIds: string[];
  visibleSelectedCount: number;
  visibleListColumns: ListColumn[];
  columnWidths: Record<TableColumn, number>;
  density: "comfortable" | "compact";
  dateSortOrder: "desc" | "asc";
  onToggleVisibleEntries(checked: boolean): void;
  onToggleEntrySelection(entryId: string, checked: boolean): void;
  onSelectEntry(entryId: string): void;
  onToggleDateSort(): void;
  onResizeStart(column: TableColumn, clientX: number): void;
};

export function RecordListTable({
  entries,
  selectedEntryId,
  highlightedEntryId,
  selectedEntryIds,
  visibleSelectedCount,
  visibleListColumns,
  columnWidths,
  density,
  dateSortOrder,
  onToggleVisibleEntries,
  onToggleEntrySelection,
  onSelectEntry,
  onToggleDateSort,
  onResizeStart
}: RecordListTableProps) {
  return (
    <div className={`tableWrap tableWrap-${density}`}>
      <table className={`masterTable masterTable-${density}`}>
        <colgroup>
          <col style={{ width: "52px" }} />
          <col style={{ width: `${columnWidths.date}px` }} />
          <col style={{ width: `${columnWidths.title}px` }} />
          {visibleListColumns.includes("venue") ? <col style={{ width: `${columnWidths.venue}px` }} /> : null}
          {visibleListColumns.includes("place") ? <col style={{ width: `${columnWidths.place}px` }} /> : null}
          {visibleListColumns.includes("artists") ? <col style={{ width: `${columnWidths.artists}px` }} /> : null}
          {visibleListColumns.includes("year") ? <col style={{ width: `${columnWidths.year}px` }} /> : null}
          {visibleListColumns.includes("genre") ? <col style={{ width: `${columnWidths.genre}px` }} /> : null}
          {visibleListColumns.includes("photos") ? <col style={{ width: `${columnWidths.photos}px` }} /> : null}
        </colgroup>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={entries.length > 0 && visibleSelectedCount === entries.length}
                onChange={(event) => onToggleVisibleEntries(event.target.checked)}
              />
            </th>
            <ResizableHeader
              label={`日付 ${dateSortOrder === "desc" ? "↓" : "↑"}`}
              onLabelClick={onToggleDateSort}
              onResizeStart={(clientX) => onResizeStart("date", clientX)}
            />
            <ResizableHeader label="公演名" onResizeStart={(clientX) => onResizeStart("title", clientX)} />
            {visibleListColumns.includes("venue") ? (
              <ResizableHeader label="会場" onResizeStart={(clientX) => onResizeStart("venue", clientX)} />
            ) : null}
            {visibleListColumns.includes("place") ? (
              <ResizableHeader label="地域" onResizeStart={(clientX) => onResizeStart("place", clientX)} />
            ) : null}
            {visibleListColumns.includes("artists") ? (
              <ResizableHeader label="出演者" onResizeStart={(clientX) => onResizeStart("artists", clientX)} />
            ) : null}
            {visibleListColumns.includes("year") ? (
              <ResizableHeader label="年" onResizeStart={(clientX) => onResizeStart("year", clientX)} />
            ) : null}
            {visibleListColumns.includes("genre") ? (
              <ResizableHeader label="形式" onResizeStart={(clientX) => onResizeStart("genre", clientX)} />
            ) : null}
            {visibleListColumns.includes("photos") ? (
              <ResizableHeader label="写真" onResizeStart={(clientX) => onResizeStart("photos", clientX)} />
            ) : null}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={`${entry.id === selectedEntryId ? "activeRow" : ""} ${entry.id === highlightedEntryId ? "newlyAddedRow" : ""}`.trim()}
              onClick={() => onSelectEntry(entry.id)}
            >
              <td onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedEntryIds.includes(entry.id)}
                  onChange={(event) => onToggleEntrySelection(entry.id, event.target.checked)}
                />
              </td>
              <td>{entry.date}</td>
              <td>
                <strong>{entry.title}</strong>
              </td>
              {visibleListColumns.includes("venue") ? <td>{entry.venue}</td> : null}
              {visibleListColumns.includes("place") ? <td>{entry.place || "-"}</td> : null}
              {visibleListColumns.includes("artists") ? <td>{entry.artists.join(" / ")}</td> : null}
              {visibleListColumns.includes("year") ? <td>{extractYear(entry.date) || "-"}</td> : null}
              {visibleListColumns.includes("genre") ? <td>{entry.genre || "-"}</td> : null}
              {visibleListColumns.includes("photos") ? (
                <td>{formatPhotoSummary(entry.images)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResizableHeader({
  label,
  onResizeStart,
  onLabelClick
}: {
  label: string;
  onResizeStart(clientX: number): void;
  onLabelClick?(): void;
}) {
  return (
    <th className="resizableHeader">
      {onLabelClick ? (
        <button className="headerLabelButton" type="button" onClick={onLabelClick}>
          {label}
        </button>
      ) : (
        label
      )}
      <button
        className="resizeHandle"
        type="button"
        aria-label={`${label} の幅を変更`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onResizeStart(event.clientX);
        }}
      />
    </th>
  );
}

function extractYear(date: string) {
  return date.slice(0, 4);
}

function formatPhotoSummary(
  images: { id: string; storageStatus?: "cloud" | "local_pending" | "syncing" | "error"; driveWebUrl?: string }[]
) {
  const total = images.length;
  const unsynced = images.filter(
    (image) => image.storageStatus === "local_pending" || image.storageStatus === "error"
  ).length;
  const linked = images.filter((image) => image.driveWebUrl).length;

  if (total === 0) {
    return "0件";
  }

  if (unsynced > 0) {
    return `${total}件 / 未同期${unsynced}`;
  }

  if (linked > 0) {
    return `${total}件 / Drive`;
  }

  return `${total}件`;
}
