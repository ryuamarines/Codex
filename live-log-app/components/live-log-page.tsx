"use client";

import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { sampleEntries } from "@/data/live-entries";
import {
  createLocalStorageLiveEntryRepository,
  exportEntriesToCsv,
  type LiveEntryRepository
} from "@/lib/live-entry-repository";
import {
  type ManualEntryInput
} from "@/lib/live-entry-utils";
import {
  inferImageType,
  type PhotoImportInput
} from "@/lib/live-import-utils";
import {
  applyBulkEditToEntries,
  applyPhotoImportToEntries,
  createManualEntry,
  deleteEntriesById,
  importEntriesFromCsvContent,
  mergeImagesWithDedup,
  updateEntryFieldValue
} from "@/lib/live-entry-actions";
import { BatchImportBoard } from "@/components/batch-import-board";
import {
  AggregateCard,
  ArtistYearStackedChartCard,
  ArtistYearTrendCard,
  SummaryTile,
  YearTrendHeroCard
} from "@/components/analytics-cards";
import { CloudSyncPanel } from "@/components/cloud-sync-panel";
import { RecordDetailPanel } from "@/components/record-detail-panel";
import { RecordListTable } from "@/components/record-list-table";
import { RecordToolsPanel } from "@/components/record-tools-panel";
import { YearlySummaryPanel, type YearlyAggregateKey } from "@/components/yearly-summary-panel";
import {
  createAggregateSummary,
  createOverview,
  createTrendSummary,
  extractYear
} from "@/lib/live-analytics";
import {
  createDashboardLayout,
  type AnalyticsTileId,
  type TileHeight,
  type TileSize
} from "@/lib/analytics-dashboard";
import {
  cycleTileHeightValue,
  getTileHeightLabel,
  moveTileOrder,
  toggleTileSizeValue
} from "@/lib/analytics-dashboard-controls";
import {
  DEFAULT_ANALYTICS_TILE_HEIGHTS,
  DEFAULT_ANALYTICS_TILE_ORDER,
  DEFAULT_ANALYTICS_TILE_SIZES,
  type ListDensity,
  type ThemeMode,
  loadUiPreferences,
  saveListDensity,
  saveAnalyticsHeights,
  saveAnalyticsOrder,
  saveAnalyticsSizes,
  saveColumnWidths,
  saveThemeMode
} from "@/lib/live-ui-preferences";
import { useLiveCloudSync } from "@/hooks/use-live-cloud-sync";
import { countRenderableImages, hasUnsyncedImages } from "@/lib/live-image-state";
import type { LiveEntry } from "@/lib/types";

type PhotoUploadInput = PhotoImportInput;

type BulkEditInput = {
  place: string;
  venue: string;
  genre: string;
};

type ActiveView = "home" | "timeline" | "add" | "artists" | "venues";
type ActiveTool = "create" | "csv" | "photo" | "bulk" | null;
type ListColumn = "venue" | "place" | "artists" | "year" | "genre" | "photos";
type TableColumn = "date" | "title" | ListColumn;
type RecordVisibilityFilter = "all" | "withPhotos" | "withUnsyncedImages";

const LIST_COLUMN_OPTIONS: Array<{ key: ListColumn; label: string }> = [
  { key: "venue", label: "会場" },
  { key: "place", label: "地域" },
  { key: "artists", label: "出演者" },
  { key: "year", label: "年" },
  { key: "genre", label: "形式" },
  { key: "photos", label: "写真" }
];

const DEFAULT_COLUMN_WIDTHS: Record<TableColumn, number> = {
  date: 132,
  title: 360,
  venue: 200,
  place: 140,
  artists: 280,
  year: 110,
  genre: 140,
  photos: 100
};

const FIXED_TILE_HEIGHTS: Partial<Record<AnalyticsTileId, TileHeight>> = {
  summary: "compact",
  genres: "compact"
};

const FIXED_TILE_SIZES: Partial<Record<AnalyticsTileId, TileSize>> = {
  summary: "wide"
};

function matches(entry: LiveEntry, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return [
    entry.title,
    entry.date,
    entry.place,
    entry.venue,
    entry.artists.join(" "),
    extractYear(entry.date),
    entry.genre,
    entry.memo
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function getLeadArtist(entry: LiveEntry) {
  return entry.artists.find((artist) => artist.trim()) ?? "未設定";
}

export function LiveLogPage() {
  const [entries, setEntries] = useState<LiveEntry[]>(sampleEntries);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [selectedYear, setSelectedYear] = useState("");
  const [dateSortOrder, setDateSortOrder] = useState<"desc" | "asc">("desc");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [listDensity, setListDensity] = useState<ListDensity>("comfortable");
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [localEntriesReady, setLocalEntriesReady] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");
  const [selectedArtistName, setSelectedArtistName] = useState("");
  const [selectedVenueName, setSelectedVenueName] = useState("");
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [recordVisibilityFilter, setRecordVisibilityFilter] = useState<RecordVisibilityFilter>("all");
  const [visibleListColumns, setVisibleListColumns] = useState<ListColumn[]>([
    "venue",
    "artists",
    "photos"
  ]);
  const [columnWidths, setColumnWidths] = useState<Record<TableColumn, number>>(DEFAULT_COLUMN_WIDTHS);
  const [analyticsTileOrder, setAnalyticsTileOrder] = useState<AnalyticsTileId[]>(DEFAULT_ANALYTICS_TILE_ORDER);
  const [analyticsTileSizes, setAnalyticsTileSizes] =
    useState<Record<AnalyticsTileId, TileSize>>(DEFAULT_ANALYTICS_TILE_SIZES);
  const [analyticsTileHeights, setAnalyticsTileHeights] =
    useState<Record<AnalyticsTileId, TileHeight>>(DEFAULT_ANALYTICS_TILE_HEIGHTS);
  const [csvMessage, setCsvMessage] = useState(
    "CSV は `日付,公演,出演者,場所,会場,ジャンル` または `date,event_title,venue,venues_raw,area,artists,event_type,notes` で読み込めます。"
  );
  const [imageMessage, setImageMessage] = useState(
    "写真は必要なときだけ取り込み欄から登録できます。"
  );
  const [backupMessage, setBackupMessage] = useState(
    "CSV 書き出しで、元の取り込み形式に合わせてバックアップできます。"
  );
  const [manualForm, setManualForm] = useState<ManualEntryInput>({
    title: "",
    date: "",
    place: "",
    venue: "",
    artistsText: "",
    genre: "",
    memo: ""
  });
  const [photoForm, setPhotoForm] = useState<PhotoUploadInput>({
    title: "",
    date: "",
    place: "",
    venue: "",
    artistsText: "",
    genre: "",
    memo: "",
    photoType: "signboard"
  });
  const [bulkEdit, setBulkEdit] = useState<BulkEditInput>({
    place: "",
    venue: "",
    genre: ""
  });
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const detailPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const analyticsTileRefs = useRef<Partial<Record<AnalyticsTileId, HTMLDivElement | null>>>({});
  const yearlySummaryRef = useRef<HTMLDivElement | null>(null);
  const yearlyAggregateRefs = useRef<Partial<Record<YearlyAggregateKey, HTMLDivElement | null>>>({});
  const entriesRef = useRef<LiveEntry[]>(sampleEntries);
  const resizeStateRef = useRef<{ column: TableColumn; startX: number; startWidth: number } | null>(
    null
  );
  const repositoryRef = useRef<LiveEntryRepository | null>(null);
  const pendingEntryPersistTimeoutsRef = useRef<Record<string, number>>({});
  const [shareMessage, setShareMessage] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [highlightedEntryId, setHighlightedEntryId] = useState("");
  const {
    firebaseUser,
    authMessage,
    syncStatus,
    lastSyncedAtLabel,
    imageService,
    driveFolderId,
    driveSessionSavedAtLabel,
    isDriveAccessStale,
    hasDriveAccessToken,
    handleGoogleSignIn,
    handleGoogleSignOut,
    handleCloudLoad,
    handleForceCloudReplace,
    handleSaveCurrentToCloud,
    handleDeleteImage,
    handleRetryImageSync,
    handleRetryEntryImageSync,
    handleConfigureDriveFolder,
    persistEntryToCloud,
    persistEntriesToCloud,
    deleteEntryFromCloud
  } = useLiveCloudSync({
    entries,
    setEntries,
    localEntriesReady
  });

  useEffect(() => {
    repositoryRef.current = createLocalStorageLiveEntryRepository(window.localStorage);
    const savedPreferences = loadUiPreferences(window.localStorage);
    repositoryRef.current
      .load(sampleEntries)
      .then((loadedEntries) => {
        setEntries(loadedEntries);
        setLocalEntriesReady(true);
      })
      .catch(() => {
        setEntries(sampleEntries);
        setLocalEntriesReady(true);
      });

    if (savedPreferences.columnWidths) {
      setColumnWidths((current) => ({ ...current, ...savedPreferences.columnWidths }));
    }

    if (savedPreferences.analyticsOrder) {
      setAnalyticsTileOrder(savedPreferences.analyticsOrder);
    }

    if (savedPreferences.analyticsSizes) {
      setAnalyticsTileSizes((current) => ({ ...current, ...savedPreferences.analyticsSizes }));
    }

    if (savedPreferences.analyticsHeights) {
      setAnalyticsTileHeights((current) => ({ ...current, ...savedPreferences.analyticsHeights }));
    }

    if (savedPreferences.themeMode) {
      setThemeMode(savedPreferences.themeMode);
    }

    if (savedPreferences.listDensity) {
      setListDensity(savedPreferences.listDensity);
    }
  }, []);

  useEffect(() => {
    repositoryRef.current?.save(entries).catch(() => undefined);
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    saveColumnWidths(window.localStorage, columnWidths);
  }, [columnWidths]);

  useEffect(() => {
    saveAnalyticsOrder(window.localStorage, analyticsTileOrder);
  }, [analyticsTileOrder]);

  useEffect(() => {
    saveAnalyticsSizes(window.localStorage, analyticsTileSizes);
  }, [analyticsTileSizes]);

  useEffect(() => {
    saveAnalyticsHeights(window.localStorage, analyticsTileHeights);
  }, [analyticsTileHeights]);

  const resolvedAnalyticsTileHeights = useMemo(
    () => ({ ...analyticsTileHeights, ...FIXED_TILE_HEIGHTS }),
    [analyticsTileHeights]
  );
  const resolvedAnalyticsTileSizes = useMemo(
    () => ({ ...analyticsTileSizes, ...FIXED_TILE_SIZES }),
    [analyticsTileSizes]
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme =
        themeMode === "system" ? (mediaQuery.matches ? "dark" : "light") : themeMode;
      document.documentElement.dataset.theme = resolvedTheme;
    };

    applyTheme();
    saveThemeMode(window.localStorage, themeMode);

    if (themeMode !== "system") {
      return;
    }

    const handleChange = () => applyTheme();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [themeMode]);

  useEffect(() => {
    saveListDensity(window.localStorage, listDensity);
  }, [listDensity]);

  const filteredEntries = useMemo(() => {
    const next = entries.filter((entry) => {
      if (!matches(entry, query)) {
        return false;
      }

      if (recordVisibilityFilter === "withPhotos") {
        return countRenderableImages(entry.images) > 0;
      }

      if (recordVisibilityFilter === "withUnsyncedImages") {
        return hasUnsyncedImages(entry.images);
      }

      return true;
    });

    next.sort((left, right) => {
      const diff = parseDateValue(left.date) - parseDateValue(right.date);
      return dateSortOrder === "asc" ? diff : -diff;
    });

    return next;
  }, [entries, query, dateSortOrder, recordVisibilityFilter]);
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, selectedEntryId]
  );
  const visibleSelectedCount = selectedEntryIds.filter((id) =>
    filteredEntries.some((entry) => entry.id === id)
  ).length;
  const aggregates = useMemo(() => createAggregateSummary(entries), [entries]);
  const trends = useMemo(() => createTrendSummary(entries), [entries]);
  const overview = useMemo(() => createOverview(entries), [entries]);
  const availableYears = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => extractYear(entry.date)).filter(Boolean))).sort((left, right) =>
        right.localeCompare(left, "ja")
      ),
    [entries]
  );
  const yearEntries = useMemo(
    () => entries.filter((entry) => extractYear(entry.date) === selectedYear),
    [entries, selectedYear]
  );
  const yearAggregates = useMemo(() => createAggregateSummary(yearEntries), [yearEntries]);
  const yearOverview = useMemo(() => createOverview(yearEntries), [yearEntries]);
  const sortedEntries = useMemo(() => {
    const next = [...entries];
    next.sort((left, right) => parseDateValue(right.date) - parseDateValue(left.date));
    return next;
  }, [entries]);
  const currentYear = availableYears[0] ?? "";
  const currentMonthKey = useMemo(
    () =>
      new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit"
      })
        .format(new Date())
        .replace(/\//g, "-"),
    []
  );
  const currentYearEntries = useMemo(
    () => sortedEntries.filter((entry) => extractYear(entry.date) === currentYear),
    [currentYear, sortedEntries]
  );
  const currentMonthEntries = useMemo(
    () => sortedEntries.filter((entry) => entry.date.startsWith(currentMonthKey)),
    [currentMonthKey, sortedEntries]
  );
  const recentEntries = useMemo(() => sortedEntries.slice(0, 3), [sortedEntries]);
  const yearlyArchiveCards = useMemo(
    () =>
      availableYears.slice(0, 4).map((year) => {
        const items = sortedEntries.filter((entry) => extractYear(entry.date) === year);
        const topArtist = createAggregateSummary(items).focusArtists[0]?.label ?? "記録なし";
        return {
          year,
          count: items.length,
          topArtist
        };
      }),
    [availableYears, sortedEntries]
  );
  const timelineGroups = useMemo(() => {
    const groups = new Map<string, LiveEntry[]>();

    for (const entry of filteredEntries) {
      if (extractYear(entry.date) !== selectedYear) {
        continue;
      }

      const monthKey = entry.date.slice(0, 7);
      const bucket = groups.get(monthKey) ?? [];
      bucket.push(entry);
      groups.set(monthKey, bucket);
    }

    return Array.from(groups.entries())
      .sort((left, right) => right[0].localeCompare(left[0], "ja"))
      .map(([monthKey, items]) => ({
        monthKey,
        monthLabel: formatMonthLabel(monthKey),
        items: items.sort((left, right) => parseDateValue(right.date) - parseDateValue(left.date))
      }));
  }, [filteredEntries, selectedYear]);
  const artistArchive = useMemo(() => {
    const countsByArtist = new Map<string, LiveEntry[]>();

    for (const entry of sortedEntries) {
      const artists = entry.artists.length > 0 ? entry.artists : ["未設定"];

      for (const artist of artists) {
        const key = artist.trim() || "未設定";
        const bucket = countsByArtist.get(key) ?? [];
        bucket.push(entry);
        countsByArtist.set(key, bucket);
      }
    }

    return Array.from(countsByArtist.entries())
      .map(([artist, items]) => ({
        artist,
        entries: items,
        count: items.length,
        firstDate: items[items.length - 1]?.date ?? "",
        lastDate: items[0]?.date ?? "",
        years: createTrendSummary(items).byYear
      }))
      .sort((left, right) => right.count - left.count || left.artist.localeCompare(right.artist, "ja"));
  }, [sortedEntries]);
  const venueArchive = useMemo(() => {
    const countsByVenue = new Map<string, LiveEntry[]>();

    for (const entry of sortedEntries) {
      const key = entry.venue.trim() || "未設定";
      const bucket = countsByVenue.get(key) ?? [];
      bucket.push(entry);
      countsByVenue.set(key, bucket);
    }

    return Array.from(countsByVenue.entries())
      .map(([venue, items]) => ({
        venue,
        entries: items,
        count: items.length,
        place: items[0]?.place ?? "",
        lastDate: items[0]?.date ?? "",
        firstDate: items[items.length - 1]?.date ?? ""
      }))
      .sort((left, right) => right.count - left.count || left.venue.localeCompare(right.venue, "ja"));
  }, [sortedEntries]);
  const selectedArtistArchive = useMemo(
    () => artistArchive.find((item) => item.artist === selectedArtistName) ?? artistArchive[0] ?? null,
    [artistArchive, selectedArtistName]
  );
  const selectedVenueArchive = useMemo(
    () => venueArchive.find((item) => item.venue === selectedVenueName) ?? venueArchive[0] ?? null,
    [selectedVenueName, venueArchive]
  );

  useEffect(() => {
    if (availableYears.length === 0) {
      setSelectedYear("");
      return;
    }

    if (!selectedYear || !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  useEffect(() => {
    if (artistArchive.length === 0) {
      setSelectedArtistName("");
      return;
    }

    if (!selectedArtistName || !artistArchive.some((item) => item.artist === selectedArtistName)) {
      setSelectedArtistName(artistArchive[0].artist);
    }
  }, [artistArchive, selectedArtistName]);

  useEffect(() => {
    if (venueArchive.length === 0) {
      setSelectedVenueName("");
      return;
    }

    if (!selectedVenueName || !venueArchive.some((item) => item.venue === selectedVenueName)) {
      setSelectedVenueName(venueArchive[0].venue);
    }
  }, [selectedVenueName, venueArchive]);

  useEffect(() => {
    if (filteredEntries.length === 0) {
      setSelectedEntryId("");
      setIsDetailDrawerOpen(false);
      return;
    }

    if (!filteredEntries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(filteredEntries[0].id);
    }
  }, [filteredEntries, selectedEntryId]);

  useEffect(() => {
    if (!actionNotice && !highlightedEntryId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActionNotice("");
      setHighlightedEntryId("");
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [actionNotice, highlightedEntryId]);

  useEffect(() => {
    return () => {
      Object.values(pendingEntryPersistTimeoutsRef.current).forEach((timeoutId) =>
        window.clearTimeout(timeoutId)
      );
      pendingEntryPersistTimeoutsRef.current = {};
    };
  }, []);

  function updateForm<K extends keyof ManualEntryInput>(key: K, value: ManualEntryInput[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  function updatePhotoForm<K extends keyof PhotoUploadInput>(key: K, value: PhotoUploadInput[K]) {
    setPhotoForm((current) => ({ ...current, [key]: value }));
  }

  function updateBulkEdit<K extends keyof BulkEditInput>(key: K, value: BulkEditInput[K]) {
    setBulkEdit((current) => ({ ...current, [key]: value }));
  }

  function toggleTool(tool: Exclude<ActiveTool, null>) {
    setActiveTool((current) => (current === tool ? null : tool));
  }

  function toggleListColumn(column: ListColumn) {
    setVisibleListColumns((current) =>
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column]
    );
  }

  function cycleThemeMode() {
    setThemeMode((current) =>
      current === "system" ? "light" : current === "light" ? "dark" : "system"
    );
  }

  function getThemeModeLabel(mode: ThemeMode) {
    if (mode === "system") {
      return "表示: システム";
    }

    if (mode === "light") {
      return "表示: ライト";
    }

    return "表示: ダーク";
  }

  function handleSelectEntry(entryId: string) {
    setSelectedEntryId(entryId);
    setIsDetailDrawerOpen(true);
  }

  function startColumnResize(column: TableColumn, clientX: number) {
    resizeStateRef.current = {
      column,
      startX: clientX,
      startWidth: columnWidths[column]
    };

    const handlePointerMove = (event: PointerEvent) => {
      const current = resizeStateRef.current;

      if (!current) {
        return;
      }

      const nextWidth = Math.max(90, Math.min(640, current.startWidth + (event.clientX - current.startX)));
      setColumnWidths((prev) => ({ ...prev, [current.column]: nextWidth }));
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function moveAnalyticsTile(tileId: AnalyticsTileId, direction: -1 | 1) {
    setAnalyticsTileOrder((current) => moveTileOrder(current, tileId, direction));
  }

  function toggleAnalyticsTileSize(tileId: AnalyticsTileId) {
    if (FIXED_TILE_SIZES[tileId]) {
      return;
    }

    setAnalyticsTileSizes((current) => toggleTileSizeValue(current, tileId));
  }

  function cycleAnalyticsTileHeight(tileId: AnalyticsTileId) {
    if (FIXED_TILE_HEIGHTS[tileId]) {
      return;
    }

    setAnalyticsTileHeights((current) => cycleTileHeightValue(current, tileId));
  }

  function snapshotScrollPositions(root: HTMLElement) {
    const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];

    return elements
      .filter((element) => element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight)
      .map((element) => ({
        element,
        left: element.scrollLeft,
        top: element.scrollTop
      }));
  }

  function restoreScrollPositions(
    positions: Array<{ element: HTMLElement; left: number; top: number }>
  ) {
    const apply = () => {
      positions.forEach(({ element, left, top }) => {
        element.scrollLeft = left;
        element.scrollTop = top;
      });
    };

    apply();
    requestAnimationFrame(apply);
  }

  async function captureAndShareElement(element: HTMLElement, label: string) {
    const scrollPositions = snapshotScrollPositions(element);

    try {
      element.classList.add("shareCaptureTile");
      const panel = element.querySelector(".panel");
      const backgroundColor =
        panel instanceof HTMLElement ? window.getComputedStyle(panel).backgroundColor : window.getComputedStyle(element).backgroundColor;
      const blob = await toBlob(element, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor,
        filter: (node) =>
          !(node instanceof HTMLElement && node.dataset.shareExclude === "true")
      });

      if (!blob) {
        setShareMessage("共有画像を作れませんでした。");
        return;
      }

      const file = new File([blob], `${label}.png`, { type: "image/png" });

      if (
        typeof navigator.share === "function" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: label,
          text: `${label} を共有`
        });
        setShareMessage(`${label} を共有しました。`);
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${label}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      setShareMessage(`${label} をPNGで保存しました。`);
    } catch {
      setShareMessage("共有画像を作れませんでした。");
    } finally {
      element.classList.remove("shareCaptureTile");
      restoreScrollPositions(scrollPositions);
    }
  }

  async function shareAnalyticsTile(tileId: AnalyticsTileId, label: string) {
    const tileElement = analyticsTileRefs.current[tileId];

    if (!tileElement) {
      setShareMessage("共有画像を作れませんでした。");
      return;
    }

    await captureAndShareElement(tileElement, label);
  }

  async function shareYearlySummary() {
    const panelElement = yearlySummaryRef.current;

    if (!panelElement || !selectedYear) {
      setShareMessage("共有画像を作れませんでした。");
      return;
    }

    await captureAndShareElement(panelElement, `${selectedYear}年別まとめ`);
  }

  async function shareYearlyAggregate(key: YearlyAggregateKey, label: string) {
    const element = yearlyAggregateRefs.current[key];

    if (!element) {
      setShareMessage("共有画像を作れませんでした。");
      return;
    }

    await captureAndShareElement(element, label);
  }

  function renderYearlySummaryActions() {
    return (
      <div className="tileActions" data-share-exclude="true">
        <button className="tileActionButton" type="button" onClick={() => void shareYearlySummary()}>
          共有
        </button>
      </div>
    );
  }

  function renderYearlyAggregateActions(key: YearlyAggregateKey, label: string) {
    return (
      <div className="tileActions" data-share-exclude="true">
        <button
          className="tileActionButton"
          type="button"
          onClick={() => void shareYearlyAggregate(key, label)}
        >
          共有
        </button>
      </div>
    );
  }

  function createTileActions(tileId: AnalyticsTileId, label: string) {
    const index = analyticsTileOrder.indexOf(tileId);
    const isFirst = index <= 0;
    const isLast = index === analyticsTileOrder.length - 1;
    const isWide = resolvedAnalyticsTileSizes[tileId] === "wide";
    const height = resolvedAnalyticsTileHeights[tileId] ?? "standard";
    const heightLabel = getTileHeightLabel(height);
    const isHeightFixed = Boolean(FIXED_TILE_HEIGHTS[tileId]);
    const isSizeFixed = Boolean(FIXED_TILE_SIZES[tileId]);

    return (
      <div className="tileActions" data-share-exclude="true">
        <button
          className="tileActionButton"
          type="button"
          onClick={() => moveAnalyticsTile(tileId, -1)}
          disabled={isFirst}
          aria-label={`${label} を前へ移動`}
        >
          ↑
        </button>
        <button
          className="tileActionButton"
          type="button"
          onClick={() => moveAnalyticsTile(tileId, 1)}
          disabled={isLast}
          aria-label={`${label} を後ろへ移動`}
        >
          ↓
        </button>
        {!isSizeFixed ? (
          <button
            className="tileActionButton tileSizeButton"
            type="button"
            onClick={() => toggleAnalyticsTileSize(tileId)}
          >
            {isWide ? "標準幅" : "ワイド"}
          </button>
        ) : null}
        <button
          className="tileActionButton"
          type="button"
          onClick={() => shareAnalyticsTile(tileId, label)}
        >
          共有
        </button>
        {!isHeightFixed ? (
          <button
            className="tileActionButton"
            type="button"
            onClick={() => cycleAnalyticsTileHeight(tileId)}
          >
            {heightLabel}
          </button>
        ) : null}
      </div>
    );
  }

  function handleCsvExport() {
    const csv = exportEntriesToCsv(entries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `live-log-export-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMessage("元のインポート形式に合わせた CSV を書き出しました。");
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextEntry = createManualEntry(manualForm);

    if (!nextEntry) {
      return;
    }

    const nextEntries = [nextEntry, ...entriesRef.current];
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    void persistEntryToCloud(nextEntries, nextEntry).catch(() => {
      setActionNotice("追加は反映しました。クラウド保存は自動で再確認します。");
    });
    setSelectedEntryId(nextEntry.id);
    setHighlightedEntryId(nextEntry.id);
    setActionNotice(`「${nextEntry.title}」を追加しました。`);
    setActiveView("timeline");
    setIsDetailDrawerOpen(true);
    setActiveTool(null);
    setManualForm({
      title: "",
      date: "",
      place: "",
      venue: "",
      artistsText: "",
      genre: "",
      memo: ""
    });
  }

  async function handleCsvImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const result = importEntriesFromCsvContent(content);

      if (result.entries.length === 0) {
        setCsvMessage(result.message);
        return;
      }

      const nextEntries = [...result.entries, ...entriesRef.current];
      entriesRef.current = nextEntries;
      setEntries(nextEntries);
      setSelectedEntryId(result.entries[0]?.id ?? "");
      if (result.entries[0]) {
        setHighlightedEntryId(result.entries[0].id);
      }
      setActionNotice(result.message);
      setActiveView("timeline");
      setIsDetailDrawerOpen(true);
      setCsvMessage(result.message);
      setActiveTool(null);
      void handleSaveCurrentToCloud(nextEntries);
      event.target.value = "";
    } catch {
      setCsvMessage("CSV の読み込みに失敗しました。UTF-8 の CSV を確認してください。");
    }
  }

  async function handleEntryImageUpload(entryId: string, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    try {
      const nextImages = await Promise.all(
        files.map(async (file) =>
          imageService.saveFile(
            file,
            inferImageType(file.name),
            file.name
          )
        )
      );

      const currentEntry = entriesRef.current.find((entry) => entry.id === entryId);

      if (!currentEntry) {
        setImageMessage("画像の追加先が見つかりませんでした。");
        event.target.value = "";
        return;
      }

      const mergedImages = mergeImagesWithDedup(currentEntry.images, nextImages);
      const nextEntries = entriesRef.current.map((entry) =>
        entry.id === entryId ? { ...entry, images: mergedImages.images } : entry
      );
      const nextEntry = nextEntries.find((entry) => entry.id === entryId);
      entriesRef.current = nextEntries;
      setEntries(nextEntries);
      if (nextEntry && mergedImages.addedCount > 0) {
        void persistEntryToCloud(nextEntries, nextEntry).catch(() => {
          setImageMessage("画像は追加しました。クラウド保存は自動で再確認します。");
        });
      }
      const uploadMessage =
        mergedImages.addedCount === 0
          ? "同じ画像はすでに登録済みのため追加していません。"
          : mergedImages.duplicateCount > 0
            ? `${mergedImages.addedCount} 件の画像を追加し、重複 ${mergedImages.duplicateCount} 件はスキップしました。`
            : `${mergedImages.addedCount} 件の画像を追加しました。`;
      setActionNotice(uploadMessage);
      setImageMessage(uploadMessage);
      event.target.value = "";
    } catch {
      setImageMessage("画像の読み込みに失敗しました。別の画像で試してください。");
    }
  }

  async function handlePhotoImport(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    if (!photoForm.title || !photoForm.date) {
      setImageMessage("写真取り込みでは少なくとも公演名と日付を入れてください。");
      event.target.value = "";
      return;
    }

    try {
      const nextImages = await Promise.all(
        files.map(async (file) =>
          imageService.saveFile(
            file,
            photoForm.photoType,
            file.name
          )
        )
      );

      const result = applyPhotoImportToEntries(entriesRef.current, photoForm, nextImages);
      const targetEntry = result.entries.find((entry) => entry.id === result.selectedEntryId);
      entriesRef.current = result.entries;
      setEntries(result.entries);
      if (targetEntry && result.addedCount > 0) {
        void persistEntryToCloud(result.entries, targetEntry).catch(() => {
          setImageMessage("写真は登録しました。クラウド保存は自動で再確認します。");
        });
      }
      setSelectedEntryId(result.selectedEntryId);
      setHighlightedEntryId(result.selectedEntryId);

      const importMessage =
        result.addedCount === 0
          ? "同じ写真はすでに登録済みのため追加していません。"
          : result.duplicateCount > 0
            ? `写真を ${result.addedCount} 件追加し、重複 ${result.duplicateCount} 件はスキップしました。`
            : "写真を登録しました。既存データがあれば紐づけ、なければ新規作成しています。";
      setActionNotice(importMessage);
      setImageMessage(importMessage);
      setActiveView("timeline");
      setIsDetailDrawerOpen(false);
      setActiveTool(null);
      event.target.value = "";
    } catch {
      setImageMessage("写真取り込みに失敗しました。別の画像で試してください。");
    }
  }

  function updateEntryField(
    entryId: string,
    key: keyof Omit<LiveEntry, "id" | "images">,
    value: string
  ) {
    const nextEntries = updateEntryFieldValue(entriesRef.current, entryId, key, value);
    const nextEntry = nextEntries.find((entry) => entry.id === entryId);
    entriesRef.current = nextEntries;
    setEntries(nextEntries);

    const currentTimeoutId = pendingEntryPersistTimeoutsRef.current[entryId];
    if (currentTimeoutId) {
      window.clearTimeout(currentTimeoutId);
    }

    if (!nextEntry) {
      return;
    }

    pendingEntryPersistTimeoutsRef.current[entryId] = window.setTimeout(() => {
      delete pendingEntryPersistTimeoutsRef.current[entryId];
      void persistEntryToCloud(nextEntries, nextEntry).catch((error) => {
        setActionNotice(
          error instanceof Error
            ? error.message
            : "修正は反映しました。クラウド保存は自動で再確認します。"
        );
      });
    }, 700);
  }

  function handleEntryImageDelete(entryId: string, imageId: string) {
    void handleDeleteImage(entryId, imageId);
  }

  function toggleEntrySelection(entryId: string, checked: boolean) {
    setSelectedEntryIds((current) =>
      checked ? Array.from(new Set([...current, entryId])) : current.filter((id) => id !== entryId)
    );
  }

  function toggleVisibleEntries(checked: boolean) {
    if (checked) {
      setSelectedEntryIds(Array.from(new Set(filteredEntries.map((entry) => entry.id))));
      return;
    }

    setSelectedEntryIds([]);
  }

  function applyBulkUpdate() {
    const nextEntries = applyBulkEditToEntries(entriesRef.current, selectedEntryIds, bulkEdit);

    if (nextEntries === entries) {
      return;
    }

    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    void persistEntriesToCloud(nextEntries).catch(() => {
      setActionNotice("一括修正は反映しました。クラウド保存は自動で再確認します。");
    });

    setBulkEdit({
      place: "",
      venue: "",
      genre: ""
    });
  }

  function deleteSelectedEntries() {
    if (selectedEntryIds.length === 0) {
      return;
    }

    const nextEntries = deleteEntriesById(entriesRef.current, selectedEntryIds);
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    if (selectedEntryIds.length === 1) {
      void deleteEntryFromCloud(nextEntries, selectedEntryIds[0]).catch(() => {
        setActionNotice("削除は反映しました。クラウド保存は自動で再確認します。");
      });
    } else {
      void persistEntriesToCloud(nextEntries).catch(() => {
        setActionNotice("削除は反映しました。クラウド保存は自動で再確認します。");
      });
    }
    setSelectedEntryIds([]);
  }

  const positionedTiles = createDashboardLayout(
    analyticsTileOrder,
    resolvedAnalyticsTileSizes,
    resolvedAnalyticsTileHeights
  );
  const dashboardRowCount = Math.max(...positionedTiles.map((tile) => tile.rowStart + tile.rowSpan - 1), 1);

  const tileMap = {
    yearTrend: (
      <YearTrendHeroCard
        items={trends.byYear}
        height={resolvedAnalyticsTileHeights.yearTrend}
        actions={createTileActions("yearTrend", "年別推移")}
      />
    ),
    summary: (
      <SummaryTile
        overview={overview}
        backupMessage={backupMessage}
        height={resolvedAnalyticsTileHeights.summary}
        actions={createTileActions("summary", "件数サマリ")}
      />
    ),
    genres: (
      <AggregateCard
        title="イベント形式"
        items={aggregates.genres}
        height={resolvedAnalyticsTileHeights.genres}
        actions={createTileActions("genres", "イベント形式")}
      />
    ),
    artists: (
      <AggregateCard
        title="アーティスト別 TOP10"
        items={aggregates.focusArtists}
        height={resolvedAnalyticsTileHeights.artists}
        actions={createTileActions("artists", "アーティスト別 TOP10")}
      />
    ),
    artistYearStackedChart: (
      <ArtistYearStackedChartCard
        title="アーティスト別 推移グラフ"
        years={trends.artistYears.years}
        items={trends.artistYears.items}
        height={resolvedAnalyticsTileHeights.artistYearStackedChart}
        size={resolvedAnalyticsTileSizes.artistYearStackedChart}
        actions={createTileActions("artistYearStackedChart", "アーティスト別 推移グラフ")}
      />
    ),
    venues: (
      <AggregateCard
        title="会場 TOP10"
        items={aggregates.venues}
        height={resolvedAnalyticsTileHeights.venues}
        actions={createTileActions("venues", "会場 TOP10")}
      />
    ),
    places: (
      <AggregateCard
        title="地域 TOP10"
        items={aggregates.places}
        height={resolvedAnalyticsTileHeights.places}
        actions={createTileActions("places", "地域 TOP10")}
      />
    ),
    artistYears: (
      <ArtistYearTrendCard
        years={trends.artistYears.years}
        items={trends.artistYears.items}
        height={resolvedAnalyticsTileHeights.artistYears}
        actions={createTileActions("artistYears", "アーティスト別 年別推移")}
      />
    )
  } satisfies Record<AnalyticsTileId, ReactNode>;

  return (
    <main className="archiveAppShell">
      <aside className="archiveSidebar">
        <div className="archiveSidebarBrand">
          <strong>LIVELOG</strong>
          <span>Your Live Archive</span>
        </div>
        <nav className="archiveSidebarNav" aria-label="メインナビゲーション">
          <button
            className={activeView === "home" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => setActiveView("home")}
          >
            ホーム
          </button>
          <button
            className={activeView === "timeline" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => setActiveView("timeline")}
          >
            タイムライン
          </button>
          <button
            className={activeView === "add" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => setActiveView("add")}
          >
            イベント
          </button>
          <button
            className={activeView === "artists" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => setActiveView("artists")}
          >
            アーティスト
          </button>
          <button
            className={activeView === "venues" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => setActiveView("venues")}
          >
            会場
          </button>
        </nav>
        <div className="archiveSidebarFooter">
          <button className="archiveSidebarGhostButton" type="button" onClick={handleCsvExport}>
            CSV書き出し
          </button>
          <button className="archiveSidebarGhostButton" type="button" onClick={cycleThemeMode}>
            {getThemeModeLabel(themeMode)}
          </button>
        </div>
      </aside>

      <section className="archiveMainCanvas">
        <header className="archiveMainHeader">
          <div className="archiveMainHeading">
            <h1>{activeView === "home" ? "ホーム" : activeView === "timeline" ? "タイムライン" : activeView === "artists" ? "アーティスト" : activeView === "venues" ? "会場" : "イベント追加"}</h1>
            <p>
              {activeView === "home"
                ? "積み重ねたライブ記録を静かに辿るホーム"
                : activeView === "timeline"
                  ? "年と月ごとにライブの軌跡を見返す"
                  : activeView === "artists"
                    ? "アーティストとの関係性を見返す"
                    : activeView === "venues"
                      ? "会場との関係性を見返す"
                      : "記録を追加・整理する"}
            </p>
          </div>
          <div className="archiveMainMeta">
            {shareMessage ? <span className="statusBadge statusBadgeSoft">{shareMessage}</span> : null}
            {actionNotice ? <span className="statusBadge statusBadgeSuccess">{actionNotice}</span> : null}
          </div>
        </header>

        <CloudSyncPanel
          isLoggedIn={Boolean(firebaseUser)}
          syncStatus={syncStatus}
          authMessage={authMessage}
          lastSyncedAtLabel={lastSyncedAtLabel}
          hasDriveAccessToken={hasDriveAccessToken}
          driveFolderId={driveFolderId}
          driveSessionSavedAtLabel={driveSessionSavedAtLabel}
          isDriveAccessStale={isDriveAccessStale}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onConfigureDriveFolder={handleConfigureDriveFolder}
          onSaveCurrentToCloud={() => {
            void handleSaveCurrentToCloud();
          }}
          onCloudLoad={handleCloudLoad}
          onForceCloudReplace={handleForceCloudReplace}
        />

      {activeView === "home" ? (
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
                <strong>{currentYearEntries.length}</strong>
              </article>
              <article className="archiveStat">
                <span>今月の本数</span>
                <strong>{currentMonthEntries.length}</strong>
              </article>
              <article className="archiveStat">
                <span>記録した写真</span>
                <strong>{overview.imageCount}</strong>
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
                <button className="toolButton" type="button" onClick={() => setActiveView("timeline")}>
                  タイムラインへ
                </button>
              </div>
              <div className="archiveRecentList">
                {recentEntries.map((entry) => (
                  <button
                    key={entry.id}
                    className="archiveRecentItem"
                    type="button"
                    onClick={() => handleSelectEntry(entry.id)}
                  >
                    <div className="archiveRecentDate">
                      <strong>{entry.date.slice(5).replace("-", ".")}</strong>
                      <span>{extractYear(entry.date)}</span>
                    </div>
                    <div className="archiveRecentBody">
                      <strong>{getLeadArtist(entry)}</strong>
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
                <button className="toolButton" type="button" onClick={() => setActiveView("artists")}>
                  すべて見る
                </button>
              </div>
              <div className="archiveRankList">
                {aggregates.focusArtists.slice(0, 5).map((artist, index) => (
                  <button
                    key={artist.label}
                    className="archiveRankItem"
                    type="button"
                    onClick={() => {
                      setSelectedArtistName(artist.label);
                      setActiveView("artists");
                    }}
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
                  onClick={() => {
                    setSelectedYear(item.year);
                    setActiveView("timeline");
                  }}
                >
                  <span>{item.year}</span>
                  <strong>{item.count}本</strong>
                  <small>よく見た: {item.topArtist}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="archiveOverviewGrid">
            <ArtistYearStackedChartCard
              title="アーティスト推移"
              years={trends.artistYears.years}
              items={trends.artistYears.items}
              height="standard"
              size="wide"
            />
            <ArtistYearTrendCard
              years={trends.artistYears.years}
              items={trends.artistYears.items}
              height="standard"
            />
          </section>

          <section className="panel archiveSectionCard">
            <div className="archiveSectionHeader">
              <div>
                <p className="eyebrow">Analytics</p>
                <h2>分析を並べ替える</h2>
                <p>サイズ、位置、共有をここで調整できます。</p>
              </div>
            </div>
            <div
              className="analyticsBoardGrid"
              style={{ gridTemplateRows: `repeat(${dashboardRowCount}, minmax(0, 1fr))` }}
            >
              {positionedTiles.map((tile) => (
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

          <div ref={yearlySummaryRef}>
            <YearlySummaryPanel
              selectedYear={selectedYear}
              availableYears={availableYears}
              yearOverview={yearOverview}
              yearAggregates={yearAggregates}
              onYearChange={setSelectedYear}
              actions={renderYearlySummaryActions()}
              registerAggregateRef={(key, element) => {
                yearlyAggregateRefs.current[key] = element;
              }}
              renderAggregateActions={renderYearlyAggregateActions}
            />
          </div>
        </section>
      ) : activeView === "timeline" ? (
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
                      onClick={() => setSelectedYear(year)}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="searchBox">
              <span>検索</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="公演名 / 会場 / アーティスト" />
            </div>
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
                        onClick={() => handleSelectEntry(entry.id)}
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
          </section>
        </section>
      ) : activeView === "artists" ? (
        <section className="archiveEntityLayout">
          <section className="panel archiveEntityListPanel">
            <div className="archiveSectionHeader">
              <div>
                <p className="eyebrow">Artists</p>
                <h2>アーティスト</h2>
              </div>
            </div>
            <div className="archiveEntityList">
              {artistArchive.map((artist) => (
                <button
                  key={artist.artist}
                  className={selectedArtistArchive?.artist === artist.artist ? "archiveEntityItem archiveEntityItemActive" : "archiveEntityItem"}
                  type="button"
                  onClick={() => setSelectedArtistName(artist.artist)}
                >
                  <strong>{artist.artist}</strong>
                  <span>{artist.count}回</span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel archiveEntityDetailPanel">
            {selectedArtistArchive ? (
              <>
                <div className="archiveSectionHeader">
                  <div>
                    <p className="eyebrow">Artist Detail</p>
                    <h2>{selectedArtistArchive.artist}</h2>
                  </div>
                </div>
                <div className="archiveEntityStats">
                  <article className="archiveStat"><span>総ライブ回数</span><strong>{selectedArtistArchive.count}</strong></article>
                  <article className="archiveStat"><span>初めて見た日</span><strong>{selectedArtistArchive.firstDate || "-"}</strong></article>
                  <article className="archiveStat"><span>最後に見た日</span><strong>{selectedArtistArchive.lastDate || "-"}</strong></article>
                </div>
                <div className="archiveMiniTrend">
                  {selectedArtistArchive.years.map((item) => (
                    <div key={item.label} className="archiveMiniTrendBar">
                      <span>{item.label}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
                <div className="archiveLinkedList">
                  {selectedArtistArchive.entries.map((entry) => (
                    <button key={entry.id} className="archiveLinkedItem" type="button" onClick={() => handleSelectEntry(entry.id)}>
                      <strong>{getLeadArtist(entry)}</strong>
                      <span>{entry.title}</span>
                      <small>{entry.date} / {entry.venue}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </section>
      ) : activeView === "venues" ? (
        <section className="archiveEntityLayout">
          <section className="panel archiveEntityListPanel">
            <div className="archiveSectionHeader">
              <div>
                <p className="eyebrow">Venues</p>
                <h2>会場</h2>
              </div>
            </div>
            <div className="archiveEntityList">
              {venueArchive.map((venue) => (
                <button
                  key={venue.venue}
                  className={selectedVenueArchive?.venue === venue.venue ? "archiveEntityItem archiveEntityItemActive" : "archiveEntityItem"}
                  type="button"
                  onClick={() => setSelectedVenueName(venue.venue)}
                >
                  <strong>{venue.venue}</strong>
                  <span>{venue.count}回</span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel archiveEntityDetailPanel">
            {selectedVenueArchive ? (
              <>
                <div className="archiveSectionHeader">
                  <div>
                    <p className="eyebrow">Venue Detail</p>
                    <h2>{selectedVenueArchive.venue}</h2>
                  </div>
                </div>
                <div className="archiveEntityStats">
                  <article className="archiveStat"><span>訪問回数</span><strong>{selectedVenueArchive.count}</strong></article>
                  <article className="archiveStat"><span>エリア</span><strong>{selectedVenueArchive.place || "-"}</strong></article>
                  <article className="archiveStat"><span>最後に行った日</span><strong>{selectedVenueArchive.lastDate || "-"}</strong></article>
                </div>
                <div className="archiveLinkedList">
                  {selectedVenueArchive.entries.map((entry) => (
                    <button key={entry.id} className="archiveLinkedItem" type="button" onClick={() => handleSelectEntry(entry.id)}>
                      <strong>{getLeadArtist(entry)}</strong>
                      <span>{entry.title}</span>
                      <small>{entry.date} / {entry.venue}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </section>
      ) : (
        <section className="archiveAddLayout">
          <RecordToolsPanel
            activeTool={activeTool}
            onToggleTool={toggleTool}
            query={query}
            onQueryChange={setQuery}
            recordVisibilityFilter={recordVisibilityFilter}
            onRecordVisibilityFilterChange={setRecordVisibilityFilter}
            filteredEntryCount={filteredEntries.length}
            visibleSelectedCount={visibleSelectedCount}
            csvMessage={csvMessage}
            imageMessage={imageMessage}
            manualForm={manualForm}
            photoForm={photoForm}
            bulkEdit={bulkEdit}
            csvInputRef={csvInputRef}
            photoInputRef={photoInputRef}
            onManualSubmit={handleManualSubmit}
            onCsvImport={handleCsvImport}
            onPhotoImport={handlePhotoImport}
            onUpdateForm={updateForm}
            onUpdatePhotoForm={updatePhotoForm}
            onUpdateBulkEdit={updateBulkEdit}
            onApplyBulkUpdate={applyBulkUpdate}
            onDeleteSelectedEntries={deleteSelectedEntries}
          />
          <BatchImportBoard
            entries={entries}
            imageService={imageService}
            onApply={setEntries}
            onLinkedToEntry={(entryId) => {
              setQuery("");
              setActiveTool(null);
              setSelectedEntryIds([]);
              setSelectedEntryId(entryId);
            }}
          />
        </section>
      )}

      {selectedEntry && activeView !== "add" ? (
        <RecordDetailPanel
          selectedEntry={selectedEntry}
          detailPhotoInputRef={detailPhotoInputRef}
          variant="drawer"
          isOpen={isDetailDrawerOpen}
          onOpenPhotoPicker={() => detailPhotoInputRef.current?.click()}
          onClose={() => setIsDetailDrawerOpen(false)}
          onEntryImageUpload={handleEntryImageUpload}
          onDeleteImage={handleEntryImageDelete}
          onRetryImageSync={handleRetryImageSync}
          onRetryEntryImageSync={handleRetryEntryImageSync}
          onUpdateEntryField={updateEntryField}
        />
      ) : null}

      </section>

      <nav className="mobileBottomNav" aria-label="モバイルナビゲーション">
        <button
          className={activeView === "home" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setActiveView("home")}
        >
          ホーム
        </button>
        <button
          className={activeView === "timeline" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setActiveView("timeline")}
        >
          タイムライン
        </button>
        <button
          className={activeView === "add" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setActiveView("add")}
        >
          追加
        </button>
        <button
          className={activeView === "artists" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setActiveView("artists")}
        >
          アーティスト
        </button>
        <button
          className={activeView === "venues" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setActiveView("venues")}
        >
          会場
        </button>
      </nav>
    </main>
  );
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");

  if (!year || !month) {
    return value;
  }

  return `${Number(month)}月`;
}

function formatDay(value: string) {
  const matched = value.match(/\d{4}-(\d{2})-(\d{2})/);
  return matched ? matched[2] : value.slice(-2);
}

function formatWeekday(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(parsed).toUpperCase();
}

function parseDateValue(value: string) {
  const normalized = value.trim().replace(/\//g, "-");
  const parsed = Date.parse(normalized);

  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const matched = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);

  if (!matched) {
    return 0;
  }

  const [, year, month, day] = matched;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}
