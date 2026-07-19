"use client";

import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import {
  createBrowserLiveEntryRepository,
  exportEntriesToCsv,
  type LiveEntryRepository
} from "@/lib/live-entry-repository";
import {
  type ManualEntryInput
} from "@/lib/live-entry-utils";
import {
  applyOcrCandidatesToManualForm,
  mapAddPhotoTypeToBatchType,
  type AddImageReview,
  type AddPhotoType
} from "@/lib/live-add-flow";
import {
  extractCandidatesFromText,
  findEntryMatchesForCandidates
} from "@/lib/batch-image-import";
import { runImageOcr } from "@/lib/image-ocr-service";
import {
  inferImageType
} from "@/lib/live-import-utils";
import {
  applyBulkEditToEntries,
  createManualEntry,
  deleteEntriesById,
  importEntriesFromCsvContent,
  mergeImportedEntriesWithDedup,
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
  saveEntityNormalizationPreferences,
  saveListDensity,
  saveAnalyticsHeights,
  saveAnalyticsOrder,
  saveAnalyticsSizes,
  saveColumnWidths,
  saveThemeMode
} from "@/lib/live-ui-preferences";
import {
  EMPTY_ENTITY_NORMALIZATION_PREFERENCES,
  normalizeEntityPreferences,
  type EntityKind,
  type EntityNormalizationPreferences
} from "@/lib/live-name-normalization";
import {
  loadRestorePoints,
  saveRestorePoint
} from "@/lib/live-restore-points";
import { useLiveCloudSync } from "@/hooks/use-live-cloud-sync";
import type { LiveEntry } from "@/lib/types";

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

declare global {
  interface Window {
    liveLogEmergencyExport?: () => string;
  }
}

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
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [timelinePresentation, setTimelinePresentation] = useState<TimelinePresentation>("cards");
  const [selectedYear, setSelectedYear] = useState("");
  const [dateSortOrder, setDateSortOrder] = useState<"desc" | "asc">("desc");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [listDensity, setListDensity] = useState<ListDensity>("comfortable");
  const [entityNormalization, setEntityNormalization] = useState<EntityNormalizationPreferences>(
    EMPTY_ENTITY_NORMALIZATION_PREFERENCES
  );
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [localEntriesReady, setLocalEntriesReady] = useState(false);
  const [localEntriesUserId, setLocalEntriesUserId] = useState<string | null>(null);
  const [uiPreferencesReady, setUiPreferencesReady] = useState(false);
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
    "画像は選択されていません。"
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
  const [addImageReview, setAddImageReview] = useState<AddImageReview | null>(null);
  const [bulkEdit, setBulkEdit] = useState<BulkEditInput>({
    place: "",
    venue: "",
    genre: ""
  });
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const detailPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const addOcrAbortControllerRef = useRef<AbortController | null>(null);
  const addImagePreviewUrlRef = useRef("");
  const selectedAddPhotoTypeRef = useRef<AddPhotoType>("signboard");
  const analyticsTileRefs = useRef<Partial<Record<AnalyticsTileId, HTMLDivElement | null>>>({});
  const yearlySummaryRef = useRef<HTMLDivElement | null>(null);
  const yearlyAggregateRefs = useRef<Partial<Record<YearlyAggregateKey, HTMLDivElement | null>>>({});
  const entriesRef = useRef<LiveEntry[]>([]);
  const restorePointThrottleRef = useRef<Record<string, number>>({});
  const resizeStateRef = useRef<{ column: TableColumn; startX: number; startWidth: number } | null>(
    null
  );
  const repositoryRef = useRef<LiveEntryRepository | null>(null);
  const localScopeLoadingRef = useRef(false);
  const pendingEntryPersistTimeoutsRef = useRef<Record<string, number>>({});
  const [shareMessage, setShareMessage] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [deleteUndoState, setDeleteUndoState] = useState<DeleteUndoState | null>(null);
  const [highlightedEntryId, setHighlightedEntryId] = useState("");
  const {
    firebaseUser,
    firebaseAuthReady,
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
    localEntriesReady,
    localEntriesUserId
  });

  useEffect(() => {
    const savedPreferences = loadUiPreferences(window.localStorage);

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

    setEntityNormalization(savedPreferences.entityNormalization);
    setUiPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!firebaseAuthReady) {
      return;
    }

    let cancelled = false;
    const nextUserId = firebaseUser?.uid ?? "";
    const repository = createBrowserLiveEntryRepository(
      window.localStorage,
      firebaseUser?.uid
    );
    localScopeLoadingRef.current = true;
    setLocalEntriesReady(false);
    setLocalEntriesUserId(null);
    repositoryRef.current = repository;

    repository
      .load([])
      .then((loadedEntries) => {
        if (cancelled) {
          return;
        }

        entriesRef.current = loadedEntries;
        setEntries(loadedEntries);
        setLocalEntriesUserId(nextUserId);
        localScopeLoadingRef.current = false;
        setLocalEntriesReady(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        entriesRef.current = [];
        setEntries([]);
        setActionNotice("端末に保存された記録を読み込めませんでした。バックアップを確認してください。");
        setLocalEntriesUserId(nextUserId);
        localScopeLoadingRef.current = false;
        setLocalEntriesReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseAuthReady, firebaseUser?.uid]);

  useEffect(() => {
    entriesRef.current = entries;

    if (!localEntriesReady || localScopeLoadingRef.current) {
      return;
    }

    repositoryRef.current?.save(entries).catch(() => {
      setActionNotice(
        "端末への保存に失敗しました。写真を追加した直後は、この画面を閉じずに同期状態を確認してください。"
      );
    });
  }, [entries, localEntriesReady]);

  useEffect(() => {
    if (!localEntriesReady || typeof window === "undefined") {
      return;
    }

    window.liveLogEmergencyExport = () => {
      const payload = {
        generatedAt: new Date().toISOString(),
        entries: entriesRef.current,
        restorePoints: loadRestorePoints(window.localStorage, firebaseUser?.uid)
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `live-log-emergency-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      return json;
    };

    return () => {
      delete window.liveLogEmergencyExport;
    };
  }, [firebaseUser?.uid, localEntriesReady]);

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

  useEffect(() => {
    if (!uiPreferencesReady) {
      return;
    }

    saveEntityNormalizationPreferences(window.localStorage, entityNormalization);
  }, [entityNormalization, uiPreferencesReady]);

  const filteredEntries = useMemo(
    () => filterEntriesForTimeline(entries, query, dateSortOrder, recordVisibilityFilter, entityNormalization),
    [dateSortOrder, entries, entityNormalization, query, recordVisibilityFilter]
  );
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, selectedEntryId]
  );
  const visibleSelectedCount = selectedEntryIds.filter((id) =>
    filteredEntries.some((entry) => entry.id === id)
  ).length;
  const aggregates = useMemo(() => createAggregateSummary(entries, entityNormalization), [entries, entityNormalization]);
  const trends = useMemo(() => createTrendSummary(entries, entityNormalization), [entries, entityNormalization]);
  const overview = useMemo(() => createOverview(entries, entityNormalization), [entries, entityNormalization]);
  const availableYears = useMemo(() => createAvailableYears(entries), [entries]);
  const effectiveSelectedYear = selectedYear || availableYears[0] || "";
  const yearEntries = useMemo(
    () => entries.filter((entry) => extractYear(entry.date) === effectiveSelectedYear),
    [effectiveSelectedYear, entries]
  );
  const yearAggregates = useMemo(
    () => createAggregateSummary(yearEntries, entityNormalization),
    [entityNormalization, yearEntries]
  );
  const yearOverview = useMemo(() => createOverview(yearEntries, entityNormalization), [entityNormalization, yearEntries]);
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
    () => createYearlyArchiveCards(availableYears, sortedEntries, entityNormalization),
    [availableYears, entityNormalization, sortedEntries]
  );
  const timelineGroups = useMemo(
    () => createTimelineGroups(filteredEntries, effectiveSelectedYear),
    [effectiveSelectedYear, filteredEntries]
  );
  const timelineEntries = useMemo(
    () => filteredEntries.filter((entry) => extractYear(entry.date) === effectiveSelectedYear),
    [effectiveSelectedYear, filteredEntries]
  );
  const artistArchive = useMemo(
    () => createArtistArchive(sortedEntries, entityNormalization),
    [entityNormalization, sortedEntries]
  );
  const venueArchive = useMemo(
    () => createVenueArchive(sortedEntries, entityNormalization),
    [entityNormalization, sortedEntries]
  );
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
        aliases: item.aliases,
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
        aliases: item.aliases,
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
    if (!localEntriesReady) {
      return;
    }

    if (availableYears.length === 0) {
      setSelectedYear("");
      return;
    }

    if (!selectedYear || !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, localEntriesReady, selectedYear]);

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
    if (!localEntriesReady) {
      return;
    }

    if (timelineEntries.length === 0) {
      setSelectedEntryId("");
      setIsDetailDrawerOpen(false);
      return;
    }

    if (!timelineEntries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(timelineEntries[0].id);
    }
  }, [localEntriesReady, selectedEntryId, timelineEntries]);

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
      addOcrAbortControllerRef.current?.abort();
      if (addImagePreviewUrlRef.current) {
        URL.revokeObjectURL(addImagePreviewUrlRef.current);
        addImagePreviewUrlRef.current = "";
      }
    };
  }, []);

  function updateForm<K extends keyof ManualEntryInput>(key: K, value: ManualEntryInput[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
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
    saveRestorePoint(window.localStorage, label, targetEntries, firebaseUser?.uid);
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
    const nextEntry = entriesRef.current.find((entry) => entry.id === entryId);

    if (nextEntry) {
      setSelectedYear(extractYear(nextEntry.date));
    }

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

  async function captureAndHandleElementImage(
    element: HTMLElement,
    label: string,
    action: "share" | "save"
  ) {
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

      if (action === "share") {
        await shareImageBlob(blob, label);
        return;
      }

      saveImageBlob(blob, label);
    } catch (error) {
      if (isShareAbortError(error)) {
        return;
      }

      setShareMessage(
        action === "share"
          ? "画像を共有できませんでした。画像保存から投稿してください。"
          : "画像を保存できませんでした。"
      );
    } finally {
      element.classList.remove("shareCaptureTile");
      restoreScrollPositions(scrollPositions);
    }
  }

  async function shareImageBlob(blob: Blob, label: string) {
    const file = new File([blob], createShareImageFileName(), { type: "image/png" });

    if (
      typeof navigator.share === "function" &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file] });
      setShareMessage(`${label} を共有しました。`);
      return;
    }

    setShareMessage("このブラウザでは画像共有に対応していません。画像保存から投稿してください。");
  }

  function saveImageBlob(blob: Blob, label: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = createShareImageFileName();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShareMessage(`${label} をPNGで保存しました。`);
  }

  function createShareImageFileName() {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "");

    return `live-log-share-${timestamp}.png`;
  }

  async function shareAnalyticsTile(tileId: AnalyticsTileId, label: string) {
    const tileElement = analyticsTileRefs.current[tileId];

    if (!tileElement) {
      setShareMessage("共有画像を作れませんでした。");
      return;
    }

    await captureAndHandleElementImage(tileElement, label, "share");
  }

  async function saveAnalyticsTile(tileId: AnalyticsTileId, label: string) {
    const tileElement = analyticsTileRefs.current[tileId];

    if (!tileElement) {
      setShareMessage("保存画像を作れませんでした。");
      return;
    }

    await captureAndHandleElementImage(tileElement, label, "save");
  }

  async function shareYearlySummary() {
    const panelElement = yearlySummaryRef.current;

    if (!panelElement || !effectiveSelectedYear) {
      setShareMessage("共有画像を作れませんでした。");
      return;
    }

    await captureAndHandleElementImage(panelElement, `${effectiveSelectedYear}年別まとめ`, "share");
  }

  async function saveYearlySummary() {
    const panelElement = yearlySummaryRef.current;

    if (!panelElement || !effectiveSelectedYear) {
      setShareMessage("保存画像を作れませんでした。");
      return;
    }

    await captureAndHandleElementImage(panelElement, `${effectiveSelectedYear}年別まとめ`, "save");
  }

  async function shareYearlyAggregate(key: YearlyAggregateKey, label: string) {
    const element = yearlyAggregateRefs.current[key];

    if (!element) {
      setShareMessage("共有画像を作れませんでした。");
      return;
    }

    await captureAndHandleElementImage(element, label, "share");
  }

  async function saveYearlyAggregate(key: YearlyAggregateKey, label: string) {
    const element = yearlyAggregateRefs.current[key];

    if (!element) {
      setShareMessage("保存画像を作れませんでした。");
      return;
    }

    await captureAndHandleElementImage(element, label, "save");
  }

  function renderYearlySummaryActions() {
    return (
      <div className="tileActions" data-share-exclude="true">
        <button className="tileActionButton" type="button" onClick={() => void shareYearlySummary()}>
          共有
        </button>
        <button className="tileActionButton" type="button" onClick={() => void saveYearlySummary()}>
          保存
        </button>
      </div>
    );
  }

  function isShareAbortError(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError";
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
        <button
          className="tileActionButton"
          type="button"
          onClick={() => void saveYearlyAggregate(key, label)}
        >
          保存
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
        <button
          className="tileActionButton"
          type="button"
          onClick={() => saveAnalyticsTile(tileId, label)}
        >
          保存
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

  function openAddPhotoPicker(photoType: AddPhotoType) {
    selectedAddPhotoTypeRef.current = photoType;
    photoInputRef.current?.click();
  }

  function clearAddImageReview() {
    addOcrAbortControllerRef.current?.abort();
    addOcrAbortControllerRef.current = null;

    if (addImagePreviewUrlRef.current) {
      URL.revokeObjectURL(addImagePreviewUrlRef.current);
      addImagePreviewUrlRef.current = "";
    }

    setAddImageReview(null);
    setImageMessage("画像は選択されていません。");
  }

  async function analyzeAddImage(file: File, previewUrl: string, photoType: AddPhotoType) {
    addOcrAbortControllerRef.current?.abort();
    const controller = new AbortController();
    addOcrAbortControllerRef.current = controller;
    setAddImageReview({
      file,
      fileName: file.name,
      previewUrl,
      photoType,
      status: "processing",
      progress: 0,
      ocrConfidence: null,
      candidateConfidence: null
    });
    setImageMessage("画像を端末内で解析しています。");

    if (file.size > 8_000_000) {
      setAddImageReview((current) =>
        current
          ? {
              ...current,
              status: "error",
              error: "OCR は8MB以下の画像に対応しています。画像はそのまま記録へ追加できます。"
            }
          : current
      );
      setImageMessage("OCR対象サイズを超えています。必要項目を手入力してください。");
      return;
    }

    try {
      const batchImageType = mapAddPhotoTypeToBatchType(photoType);
      const result = await runImageOcr(file, batchImageType, {
        signal: controller.signal,
        timeoutMs: 45_000,
        onProgress(completed, total) {
          if (addOcrAbortControllerRef.current !== controller) {
            return;
          }

          setAddImageReview((current) =>
            current
              ? { ...current, progress: total > 0 ? completed / total : 0 }
              : current
          );
        }
      });

      if (addOcrAbortControllerRef.current !== controller) {
        return;
      }

      const candidates = extractCandidatesFromText(
        result.text,
        batchImageType,
        entriesRef.current,
        ""
      );
      const matchedEntry =
        photoType === "signboard"
          ? findEntryMatchesForCandidates(entriesRef.current, candidates)[0]
          : undefined;
      setManualForm((current) => applyOcrCandidatesToManualForm(current, candidates));
      setAddImageReview((current) =>
        current
          ? {
              ...current,
              status: "review",
              progress: 1,
              ocrConfidence: result.confidence,
              candidateConfidence: candidates.confidence,
              matchedEntryId: matchedEntry?.entryId,
              matchedEntryTitle: matchedEntry?.title,
              matchReason: matchedEntry?.reason,
              error: undefined
            }
          : current
      );
      setImageMessage("候補を入力欄へ反映しました。内容を確認して登録してください。");
    } catch (error) {
      if (controller.signal.aborted || addOcrAbortControllerRef.current !== controller) {
        return;
      }

      const message = error instanceof Error ? error.message : "OCR に失敗しました。";
      setAddImageReview((current) =>
        current ? { ...current, status: "error", progress: 0, error: message } : current
      );
      setImageMessage("画像は保持しています。必要項目を手入力して登録できます。");
    } finally {
      if (addOcrAbortControllerRef.current === controller) {
        addOcrAbortControllerRef.current = null;
      }
    }
  }

  function retryAddImageOcr() {
    if (!addImageReview || addImageReview.status === "processing" || addImageReview.status === "saving") {
      return;
    }

    void analyzeAddImage(
      addImageReview.file,
      addImageReview.previewUrl,
      addImageReview.photoType
    );
  }

  async function attachAddImageToMatchedEntry() {
    if (!addImageReview?.matchedEntryId || addImageReview.status === "saving") {
      return;
    }

    const matchedEntry = entriesRef.current.find(
      (entry) => entry.id === addImageReview.matchedEntryId
    );

    if (!matchedEntry) {
      setImageMessage("候補の記録が見つかりませんでした。新しい記録として確認してください。");
      return;
    }

    setAddImageReview((current) => (current ? { ...current, status: "saving" } : current));

    try {
      const image = await imageService.saveFile(
        addImageReview.file,
        addImageReview.photoType,
        addImageReview.fileName
      );
      const mergedImages = mergeImagesWithDedup(matchedEntry.images, [image]);

      if (mergedImages.addedCount > 0) {
        createRestorePoint("写真追加前");
      }

      const nextEntries = entriesRef.current.map((entry) =>
        entry.id === matchedEntry.id ? { ...entry, images: mergedImages.images } : entry
      );
      const nextEntry = nextEntries.find((entry) => entry.id === matchedEntry.id);
      entriesRef.current = nextEntries;
      setEntries(nextEntries);

      if (nextEntry && mergedImages.addedCount > 0) {
        void persistEntryToCloud(nextEntries, nextEntry).catch(() => {
          setActionNotice("写真は追加しました。クラウド保存は自動で再確認します。");
        });
      }

      setSelectedYear(extractYear(matchedEntry.date));
      setSelectedEntryId(matchedEntry.id);
      setHighlightedEntryId(matchedEntry.id);
      setActiveView("timeline");
      setIsDetailDrawerOpen(true);
      setActionNotice(
        mergedImages.addedCount > 0
          ? `「${matchedEntry.title}」に写真を追加しました。`
          : `「${matchedEntry.title}」には同じ写真が登録済みです。`
      );
      setManualForm({
        title: "",
        date: "",
        place: "",
        venue: "",
        artistsText: "",
        genre: "",
        memo: ""
      });
      clearAddImageReview();
    } catch (error) {
      const message = error instanceof Error ? error.message : "画像を追加できませんでした。";
      setAddImageReview((current) =>
        current ? { ...current, status: "error", error: message } : current
      );
      setImageMessage(message);
    }
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const createdEntry = createManualEntry(manualForm);

    if (!createdEntry || addImageReview?.status === "processing" || addImageReview?.status === "saving") {
      return;
    }

    let nextEntry = createdEntry;

    if (addImageReview) {
      setAddImageReview((current) => (current ? { ...current, status: "saving" } : current));

      try {
        const image = await imageService.saveFile(
          addImageReview.file,
          addImageReview.photoType,
          addImageReview.fileName
        );
        nextEntry = { ...createdEntry, images: [image] };
      } catch (error) {
        const message = error instanceof Error ? error.message : "画像を端末に保存できませんでした。";
        setAddImageReview((current) =>
          current ? { ...current, status: "error", error: message } : current
        );
        setImageMessage(message);
        return;
      }
    }

    createRestorePoint("追加前");
    const nextEntries = [nextEntry, ...entriesRef.current];
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    void persistEntryToCloud(nextEntries, nextEntry).catch(() => {
      setActionNotice("追加は反映しました。タイムラインで確認でき、クラウド保存は自動で再確認します。");
    });
    setSelectedYear(extractYear(nextEntry.date));
    setSelectedEntryId(nextEntry.id);
    setHighlightedEntryId(nextEntry.id);
    setDeleteUndoState(null);
    setActionNotice(
      addImageReview
        ? `「${nextEntry.title}」を写真付きで追加しました。タイムラインで確認できます。`
        : `「${nextEntry.title}」を追加しました。タイムラインで確認できます。`
    );
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
    clearAddImageReview();
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

      const mergeResult = mergeImportedEntriesWithDedup(entriesRef.current, result.entries);
      const nextEntries = mergeResult.entries;
      const importMessage =
        mergeResult.duplicateCount > 0
          ? `${mergeResult.addedCount} 件を取り込み、重複候補 ${mergeResult.duplicateCount} 件はスキップしました。`
          : result.message;

      if (mergeResult.addedCount > 0) {
        createRestorePoint("CSV取り込み前");
      }
      entriesRef.current = nextEntries;
      setEntries(nextEntries);
      setSelectedYear(nextEntries[0] ? extractYear(nextEntries[0].date) : "");
      setSelectedEntryId(nextEntries[0]?.id ?? "");
      if (mergeResult.addedCount > 0 && nextEntries[0]) {
        setHighlightedEntryId(nextEntries[0].id);
      }
      setActionNotice(importMessage);
      setActiveView("timeline");
      setIsDetailDrawerOpen(nextEntries.length > 0);
      setCsvMessage(importMessage);
      setActiveTool(null);
      if (mergeResult.addedCount > 0) {
        void handleSaveCurrentToCloud(nextEntries);
      }
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
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setImageMessage("画像ファイルを選んでください。");
      return;
    }

    addOcrAbortControllerRef.current?.abort();
    if (addImagePreviewUrlRef.current) {
      URL.revokeObjectURL(addImagePreviewUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    const photoType = selectedAddPhotoTypeRef.current;
    addImagePreviewUrlRef.current = previewUrl;
    void analyzeAddImage(file, previewUrl, photoType);
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

  function updateEntityAlias(kind: EntityKind, alias: string, canonicalName: string) {
    const normalizedAlias = alias.trim();
    const normalizedCanonicalName = canonicalName.trim();

    if (!normalizedAlias || !normalizedCanonicalName) {
      return;
    }

    setEntityNormalization((current) => {
      const normalizedCurrent = normalizeEntityPreferences(current);
      const key = kind === "artist" ? "artistAliases" : "venueAliases";

      return {
        ...normalizedCurrent,
        [key]: {
          ...normalizedCurrent[key],
          [normalizedAlias]: normalizedCanonicalName
        }
      };
    });
  }

  function separateEntityAlias(kind: EntityKind, alias: string) {
    updateEntityAlias(kind, alias, alias);
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
    const previousEntries = entriesRef.current;
    const nextEntries =
      typeof nextEntriesOrUpdater === "function"
        ? nextEntriesOrUpdater(previousEntries)
        : nextEntriesOrUpdater;

    createRestorePoint("画像ロット取り込み前", previousEntries);
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
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
        addImageReview={addImageReview}
        bulkEdit={bulkEdit}
        placeOptions={placeOptions}
        genreOptions={genreOptions}
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
        onAddEntityAlias={updateEntityAlias}
        onSeparateEntityAlias={separateEntityAlias}
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
        onOpenAddPhotoPicker={openAddPhotoPicker}
        onClearAddImageReview={clearAddImageReview}
        onRetryAddImageOcr={retryAddImageOcr}
        onAttachAddImageToMatch={attachAddImageToMatchedEntry}
        onUpdateForm={updateForm}
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
