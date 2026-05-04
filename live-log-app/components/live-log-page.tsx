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
  createManualEntry,
  deleteEntriesById,
  importEntriesFromCsvContent,
  mergeImagesWithDedup,
  updateEntryFieldValue
} from "@/lib/live-entry-actions";
import {
  AggregateCard,
  ArtistYearStackedChartCard,
  SummaryTile,
  YearTrendHeroCard
} from "@/components/analytics-cards";
import { LiveLogPageContent } from "@/components/live-log-page-content";
import { LiveLogShell } from "@/components/live-log-shell";
import type { YearlyAggregateKey } from "@/components/yearly-summary-panel";
import {
  createAggregateSummary,
  createOverview,
  createTrendSummary,
  extractYear
} from "@/lib/live-analytics";
import {
  createArtistArchive,
  createAvailableYears,
  createSortedEntries,
  createTimelineGroups,
  createVenueArchive,
  createYearlyArchiveCards,
  filterEntriesForTimeline,
  formatDay,
  formatWeekday,
  getLeadArtist,
  type RecordVisibilityFilter
} from "@/lib/live-log-view-model";
import {
  buildShareSnapshotUrl,
  type LiveLogShareSnapshot
} from "@/lib/live-log-share-snapshot";
import {
  createAnalyticsSnapshot,
  createYearlyAggregateSnapshot,
  createYearlySnapshot
} from "@/lib/live-log-share-snapshot-builders";
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
import {
  saveRestorePoint
} from "@/lib/live-restore-points";
import { useLiveCloudSync } from "@/hooks/use-live-cloud-sync";
import type { LiveEntry } from "@/lib/types";

type PhotoUploadInput = PhotoImportInput;

type BulkEditInput = {
  place: string;
  venue: string;
  genre: string;
};

type ActiveView = "home" | "timeline" | "add" | "artists" | "venues" | "sync";
type ActiveTool = "csv" | "bulk" | null;
type TimelinePresentation = "cards" | "table";
type ListColumn = "venue" | "place" | "artists" | "year" | "genre" | "photos";
type TableColumn = "date" | "title" | ListColumn;
type DeleteUndoState = {
  previousEntries: LiveEntry[];
  deletedEntries: LiveEntry[];
};

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

const FIXED_TILE_HEIGHTS: Partial<Record<AnalyticsTileId, TileHeight>> = {};

const FIXED_TILE_SIZES: Partial<Record<AnalyticsTileId, TileSize>> = {};
const ARTIST_ANALYTICS_WIDTH_MIGRATION_KEY = "live-log-artist-analytics-wide-v2";

export function LiveLogPage() {
  const [entries, setEntries] = useState<LiveEntry[]>(sampleEntries);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [timelinePresentation, setTimelinePresentation] = useState<TimelinePresentation>("cards");
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
  const restorePointThrottleRef = useRef<Record<string, number>>({});
  const resizeStateRef = useRef<{ column: TableColumn; startX: number; startWidth: number } | null>(
    null
  );
  const repositoryRef = useRef<LiveEntryRepository | null>(null);
  const pendingEntryPersistTimeoutsRef = useRef<Record<string, number>>({});
  const [shareMessage, setShareMessage] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [deleteUndoState, setDeleteUndoState] = useState<DeleteUndoState | null>(null);
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
    if (typeof window === "undefined") {
      return;
    }

    if (window.localStorage.getItem(ARTIST_ANALYTICS_WIDTH_MIGRATION_KEY) === "done") {
      return;
    }

    setAnalyticsTileSizes((current) => ({
      ...current,
      artistYearStackedChart: "wide"
    }));
    window.localStorage.setItem(ARTIST_ANALYTICS_WIDTH_MIGRATION_KEY, "done");
  }, []);

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

  const filteredEntries = useMemo(
    () => filterEntriesForTimeline(entries, query, dateSortOrder, recordVisibilityFilter),
    [dateSortOrder, entries, query, recordVisibilityFilter]
  );
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
  const availableYears = useMemo(() => createAvailableYears(entries), [entries]);
  const effectiveSelectedYear = selectedYear || availableYears[0] || "";
  const yearEntries = useMemo(
    () => entries.filter((entry) => extractYear(entry.date) === effectiveSelectedYear),
    [effectiveSelectedYear, entries]
  );
  const yearAggregates = useMemo(() => createAggregateSummary(yearEntries), [yearEntries]);
  const yearOverview = useMemo(() => createOverview(yearEntries), [yearEntries]);
  const sortedEntries = useMemo(() => createSortedEntries(entries), [entries]);
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
    () => createYearlyArchiveCards(availableYears, sortedEntries),
    [availableYears, sortedEntries]
  );
  const timelineGroups = useMemo(
    () => createTimelineGroups(filteredEntries, effectiveSelectedYear),
    [effectiveSelectedYear, filteredEntries]
  );
  const timelineEntries = useMemo(
    () => filteredEntries.filter((entry) => extractYear(entry.date) === effectiveSelectedYear),
    [effectiveSelectedYear, filteredEntries]
  );
  const artistArchive = useMemo(() => createArtistArchive(sortedEntries), [sortedEntries]);
  const venueArchive = useMemo(() => createVenueArchive(sortedEntries), [sortedEntries]);
  const selectedArtistArchive = useMemo(
    () => artistArchive.find((item) => item.artist === selectedArtistName) ?? artistArchive[0] ?? null,
    [artistArchive, selectedArtistName]
  );
  const selectedVenueArchive = useMemo(
    () => venueArchive.find((item) => item.venue === selectedVenueName) ?? venueArchive[0] ?? null,
    [selectedVenueName, venueArchive]
  );
  const artistArchiveView = useMemo(
    () =>
      artistArchive.map((item) => ({
        label: item.artist,
        count: item.count,
        firstDate: item.firstDate,
        lastDate: item.lastDate,
        years: item.years,
        entries: item.entries
      })),
    [artistArchive]
  );
  const venueArchiveView = useMemo(
    () =>
      venueArchive.map((item) => ({
        label: item.venue,
        count: item.count,
        firstDate: item.firstDate,
        lastDate: item.lastDate,
        place: item.place,
        entries: item.entries
      })),
    [venueArchive]
  );
  const placeOptions = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => entry.place.trim()).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right, "ja")
      ),
    [entries]
  );
  const genreOptions = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => entry.genre.trim()).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right, "ja")
      ),
    [entries]
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
    if ((!actionNotice || deleteUndoState) && !highlightedEntryId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActionNotice("");
      setHighlightedEntryId("");
      setDeleteUndoState(null);
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [actionNotice, deleteUndoState, highlightedEntryId]);

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

  function createRestorePoint(label: string, targetEntries = entriesRef.current, throttleMs = 0) {
    if (typeof window === "undefined") {
      return;
    }

    const now = Date.now();
    const lastSavedAt = restorePointThrottleRef.current[label] ?? 0;

    if (throttleMs > 0 && now - lastSavedAt < throttleMs) {
      return;
    }

    restorePointThrottleRef.current[label] = now;
    saveRestorePoint(window.localStorage, label, targetEntries);
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

  async function shareSnapshotLink(snapshot: LiveLogShareSnapshot, label: string) {
    try {
      const url = buildShareSnapshotUrl(window.location.origin, snapshot);

      if (typeof navigator.share === "function") {
        await navigator.share({
          title: label,
          text: `${label} を共有`,
          url
        });
        setShareMessage(`${label} の共有URLを開きました。`);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMessage(`${label} の共有URLをコピーしました。`);
        return;
      }

      setShareMessage("このブラウザでは共有URLをコピーできませんでした。");
    } catch {
      setShareMessage("共有URLを作れませんでした。");
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

    if (!panelElement || !effectiveSelectedYear) {
      setShareMessage("共有画像を作れませんでした。");
      return;
    }

    await captureAndShareElement(panelElement, `${effectiveSelectedYear}年別まとめ`);
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
          PNG
        </button>
        <button
          className="tileActionButton"
          type="button"
          onClick={() => {
            if (effectiveSelectedYear) {
              void shareSnapshotLink(
                createYearlySnapshot(effectiveSelectedYear, yearOverview, yearAggregates),
                `${effectiveSelectedYear}年別まとめ`
              );
            }
          }}
        >
          URL
        </button>
      </div>
    );
  }

  function renderYearlyAggregateActions(key: YearlyAggregateKey, label: string) {
    const items = yearAggregates[key];

    return (
      <div className="tileActions" data-share-exclude="true">
        <button
          className="tileActionButton"
          type="button"
          onClick={() => void shareYearlyAggregate(key, label)}
        >
          PNG
        </button>
        <button
          className="tileActionButton"
          type="button"
          onClick={() => void shareSnapshotLink(createYearlyAggregateSnapshot(effectiveSelectedYear, label, items), label)}
        >
          URL
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
          PNG
        </button>
        <button
          className="tileActionButton"
          type="button"
          onClick={() =>
            void shareSnapshotLink(
              createAnalyticsSnapshot(tileId, label, overview, trends, aggregates),
              label
            )
          }
        >
          URL
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

    createRestorePoint("追加前");
    const nextEntries = [nextEntry, ...entriesRef.current];
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    void persistEntryToCloud(nextEntries, nextEntry).catch(() => {
      setActionNotice("追加は反映しました。タイムラインで確認でき、クラウド保存は自動で再確認します。");
    });
    setSelectedEntryId(nextEntry.id);
    setHighlightedEntryId(nextEntry.id);
    setDeleteUndoState(null);
    setActionNotice(`「${nextEntry.title}」を追加しました。タイムラインで確認できます。`);
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

      createRestorePoint("CSV取り込み前");
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

      if (mergedImages.addedCount > 0) {
        createRestorePoint("写真追加前");
      }

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

      const nextEntry = createManualEntry(manualForm);

      if (!nextEntry) {
        setImageMessage("日付・公演名・会場を入れてから写真を追加してください。");
        event.target.value = "";
        return;
      }

      createRestorePoint("写真付き追加前");
      const entryWithImages = { ...nextEntry, images: nextImages };
      const nextEntries = [entryWithImages, ...entriesRef.current];
      entriesRef.current = nextEntries;
      setEntries(nextEntries);
      if (nextImages.length > 0) {
        void persistEntryToCloud(nextEntries, entryWithImages).catch(() => {
          setImageMessage("写真付きの記録は追加しました。タイムラインで確認でき、クラウド保存は自動で再確認します。");
        });
      }
      setSelectedEntryId(entryWithImages.id);
      setHighlightedEntryId(entryWithImages.id);
      setActiveView("timeline");
      setIsDetailDrawerOpen(true);
      const importMessage =
        nextImages.length === 1
          ? `「${entryWithImages.title}」を作成して写真を追加しました。タイムラインで確認できます。`
          : `「${entryWithImages.title}」を作成して写真を ${nextImages.length} 件追加しました。タイムラインで確認できます。`;
      setActionNotice(importMessage);
      setImageMessage(importMessage);
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
    createRestorePoint("修正前", entriesRef.current, 10_000);
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

  function rememberDeletedEntries(previousEntries: LiveEntry[], deletedIds: string[]) {
    const deletedEntries = previousEntries.filter((entry) => deletedIds.includes(entry.id));

    if (deletedEntries.length === 0) {
      setDeleteUndoState(null);
      return;
    }

    setDeleteUndoState({
      previousEntries,
      deletedEntries
    });
  }

  function restoreDeletedEntries() {
    if (!deleteUndoState) {
      return;
    }

    const deletedById = new Map(deleteUndoState.deletedEntries.map((entry) => [entry.id, entry]));
    const currentById = new Map(entriesRef.current.map((entry) => [entry.id, entry]));
    const restoredEntries = deleteUndoState.previousEntries
      .map((entry) => currentById.get(entry.id) ?? deletedById.get(entry.id))
      .filter((entry): entry is LiveEntry => Boolean(entry));
    const restoredIds = new Set(restoredEntries.map((entry) => entry.id));
    const nextEntries = [
      ...restoredEntries,
      ...entriesRef.current.filter((entry) => !restoredIds.has(entry.id))
    ];

    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    setSelectedEntryId(deleteUndoState.deletedEntries[0]?.id ?? nextEntries[0]?.id ?? "");
    setHighlightedEntryId(deleteUndoState.deletedEntries[0]?.id ?? "");
    setActionNotice("削除を取り消しました。");
    setDeleteUndoState(null);
    void persistEntriesToCloud(nextEntries).catch(() => {
      setActionNotice("削除は取り消しました。クラウド保存は自動で再確認します。");
    });
  }

  function applyBulkUpdate() {
    const nextEntries = applyBulkEditToEntries(entriesRef.current, selectedEntryIds, bulkEdit);

    if (nextEntries === entries) {
      return;
    }

    createRestorePoint("一括修正前");
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

    const previousEntries = entriesRef.current;
    const deletedIds = [...selectedEntryIds];
    const nextEntries = deleteEntriesById(previousEntries, deletedIds);
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    rememberDeletedEntries(previousEntries, deletedIds);
    createRestorePoint("一括削除前", previousEntries);
    if (deletedIds.length === 1) {
      void deleteEntryFromCloud(nextEntries, deletedIds[0]).catch(() => {
        setActionNotice("削除は反映しました。クラウド保存は自動で再確認します。");
      });
    } else {
      void persistEntriesToCloud(nextEntries).catch(() => {
        setActionNotice("削除は反映しました。クラウド保存は自動で再確認します。");
      });
    }
    setSelectedEntryIds([]);
    setActionNotice(`${deletedIds.length}件を削除しました。`);
  }

  function deleteSingleEntry(entryId: string) {
    const previousEntries = entriesRef.current;
    const nextEntries = deleteEntriesById(previousEntries, [entryId]);
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    rememberDeletedEntries(previousEntries, [entryId]);
    createRestorePoint("削除前", previousEntries);
    void deleteEntryFromCloud(nextEntries, entryId).catch(() => {
      setActionNotice("削除は反映しました。クラウド保存は自動で再確認します。");
    });
    setSelectedEntryIds((current) => current.filter((id) => id !== entryId));
    if (selectedEntryId === entryId) {
      setSelectedEntryId(nextEntries[0]?.id ?? "");
      setIsDetailDrawerOpen(nextEntries.length > 0);
    }
    setActionNotice("1件を削除しました。");
  }

  function handleBatchApply(nextEntriesOrUpdater: LiveEntry[] | ((current: LiveEntry[]) => LiveEntry[])) {
    const nextEntries =
      typeof nextEntriesOrUpdater === "function"
        ? nextEntriesOrUpdater(entriesRef.current)
        : nextEntriesOrUpdater;

    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    createRestorePoint("画像ロット取り込み前");
    void persistEntriesToCloud(nextEntries).catch(() => {
      setActionNotice("画像ロット取り込みは反映しました。クラウド保存は自動で再確認します。");
    });
  }

  const venueTileIds = new Set<AnalyticsTileId>(["venues", "places"]);
  const createScopedTiles = (allowedIds: Set<AnalyticsTileId>) =>
    createDashboardLayout(
      analyticsTileOrder.filter((tileId) => allowedIds.has(tileId)),
      resolvedAnalyticsTileSizes,
      resolvedAnalyticsTileHeights
    );
  const venueTiles = createScopedTiles(venueTileIds);
  const venueDashboardRowCount = Math.max(...venueTiles.map((tile) => tile.rowStart + tile.rowSpan - 1), 1);

  const tileMap = {
    yearTrend: (
      <YearTrendHeroCard
        items={trends.byYear}
        height="compact"
      />
    ),
    summary: (
      <SummaryTile
        overview={overview}
        backupMessage={backupMessage}
        height={resolvedAnalyticsTileHeights.summary}
        actions={createTileActions("summary", "記録の概要")}
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
    )
  } satisfies Record<AnalyticsTileId, ReactNode>;

  return (
    <LiveLogShell
      activeView={activeView}
      shareMessage={shareMessage}
      actionNotice={actionNotice}
      actionNoticeAction={deleteUndoState ? { label: "元に戻す", onClick: restoreDeletedEntries } : undefined}
      themeModeLabel={getThemeModeLabel(themeMode)}
      onSelectView={setActiveView}
      onExportCsv={handleCsvExport}
      onCycleThemeMode={cycleThemeMode}
    >
      <LiveLogPageContent
        activeView={activeView}
        selectedEntry={selectedEntry}
        isDetailDrawerOpen={isDetailDrawerOpen}
        detailPhotoInputRef={detailPhotoInputRef}
        selectedYear={effectiveSelectedYear}
        availableYears={availableYears}
        currentYear={currentYear}
        currentYearEntriesCount={currentYearEntries.length}
        currentMonthEntriesCount={currentMonthEntries.length}
        imageCount={overview.imageCount}
        overview={overview}
        recentEntries={recentEntries}
        topArtists={aggregates.focusArtists}
        yearlyArchiveCards={yearlyArchiveCards}
        yearlySummaryRef={yearlySummaryRef}
        yearOverview={yearOverview}
        yearAggregates={yearAggregates}
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
        artistArchiveView={artistArchiveView}
        selectedArtistLabel={selectedArtistArchive?.artist ?? ""}
        venueArchiveView={venueArchiveView}
        selectedVenueLabel={selectedVenueArchive?.venue ?? ""}
        venueTiles={venueTiles}
        analyticsTileRefs={analyticsTileRefs}
        resolvedAnalyticsTileHeights={resolvedAnalyticsTileHeights}
        resolvedAnalyticsTileSizes={resolvedAnalyticsTileSizes}
        venueDashboardRowCount={venueDashboardRowCount}
        trends={trends}
        tileMap={tileMap}
        activeTool={activeTool}
        recordVisibilityFilter={recordVisibilityFilter}
        filteredEntryCount={filteredEntries.length}
        csvMessage={csvMessage}
        imageMessage={imageMessage}
        manualForm={manualForm}
        photoForm={photoForm}
        bulkEdit={bulkEdit}
        placeOptions={placeOptions}
        genreOptions={genreOptions}
        driveFolderLabel={driveFolderId ? "保存先設定済み" : "まだ保存先が設定されていません"}
        csvInputRef={csvInputRef}
        photoInputRef={photoInputRef}
        entries={entries}
        imageService={imageService}
        backupMessage={backupMessage}
        firebaseUserPresent={Boolean(firebaseUser)}
        syncStatus={syncStatus}
        authMessage={authMessage}
        lastSyncedAtLabel={lastSyncedAtLabel}
        hasDriveAccessToken={hasDriveAccessToken}
        driveFolderId={driveFolderId}
        driveSessionSavedAtLabel={driveSessionSavedAtLabel}
        isDriveAccessStale={isDriveAccessStale}
        renderYearlySummaryActions={renderYearlySummaryActions}
        renderYearlyAggregateActions={renderYearlyAggregateActions}
        registerAggregateRef={(key, element) => {
          yearlyAggregateRefs.current[key] = element;
        }}
        createArtistTrendActions={() =>
          createTileActions("artistYearStackedChart", "アーティスト別 推移グラフ")
        }
        onSelectEntry={handleSelectEntry}
        onSelectArtist={setSelectedArtistName}
        onSelectVenue={setSelectedVenueName}
        onSetActiveView={setActiveView}
        onSetSelectedYear={setSelectedYear}
        onSetQuery={setQuery}
        onSetTimelinePresentation={setTimelinePresentation}
        onSetListDensity={setListDensity}
        onToggleListColumn={toggleListColumn}
        onToggleVisibleEntries={toggleVisibleEntries}
        onToggleEntrySelection={toggleEntrySelection}
        onToggleDateSort={() => setDateSortOrder((current) => (current === "desc" ? "asc" : "desc"))}
        onResizeStart={startColumnResize}
        onToggleTool={toggleTool}
        onSetRecordVisibilityFilter={setRecordVisibilityFilter}
        onManualSubmit={handleManualSubmit}
        onCsvImport={handleCsvImport}
        onPhotoImport={handlePhotoImport}
        onUpdateForm={updateForm}
        onUpdatePhotoForm={updatePhotoForm}
        onUpdateBulkEdit={updateBulkEdit}
        onApplyBulkUpdate={applyBulkUpdate}
        onDeleteSelectedEntries={deleteSelectedEntries}
        onConfigureDriveFolder={handleConfigureDriveFolder}
        onBatchApply={handleBatchApply}
        onLinkedToEntry={(entryId) => {
          setQuery("");
          setActiveTool(null);
          setSelectedEntryIds([]);
          setSelectedEntryId(entryId);
        }}
        onGoogleSignIn={handleGoogleSignIn}
        onGoogleSignOut={handleGoogleSignOut}
        onCloudLoad={() => {
          createRestorePoint("クラウド同期前");
          void handleCloudLoad();
        }}
        onSaveCurrentToCloud={() => {
          void handleSaveCurrentToCloud();
        }}
        onOpenPhotoPicker={() => detailPhotoInputRef.current?.click()}
        onCloseDrawer={() => setIsDetailDrawerOpen(false)}
        onEntryImageUpload={handleEntryImageUpload}
        onDeleteImage={handleEntryImageDelete}
        onRetryImageSync={handleRetryImageSync}
        onRetryEntryImageSync={handleRetryEntryImageSync}
        onDeleteEntry={deleteSingleEntry}
        onUpdateEntryField={updateEntryField}
        formatDay={formatDay}
        formatWeekday={formatWeekday}
        getLeadArtist={getLeadArtist}
        onExportCsv={handleCsvExport}
      />
    </LiveLogShell>
  );
}
