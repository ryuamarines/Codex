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
  appendImagesToEntry,
  applyBulkEditToEntries,
  applyPhotoImportToEntries,
  createManualEntry,
  deleteEntriesById,
  importEntriesFromCsvContent,
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

type ActiveView = "records" | "analytics" | "yearly" | "batchImport";
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

export function LiveLogPage() {
  const [entries, setEntries] = useState<LiveEntry[]>(sampleEntries);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("analytics");
  const [selectedYear, setSelectedYear] = useState("");
  const [dateSortOrder, setDateSortOrder] = useState<"desc" | "asc">("desc");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [listDensity, setListDensity] = useState<ListDensity>("comfortable");
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [batchPreviewEntryId, setBatchPreviewEntryId] = useState("");
  const [localEntriesReady, setLocalEntriesReady] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");
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
  const batchPreviewEntry = useMemo(
    () => entries.find((entry) => entry.id === batchPreviewEntryId) ?? null,
    [entries, batchPreviewEntryId]
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
    if (activeView !== "batchImport") {
      setBatchPreviewEntryId("");
    }
  }, [activeView]);

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
    setActiveView("records");
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
      setActiveView("records");
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

      const nextEntries = appendImagesToEntry(entriesRef.current, entryId, nextImages);
      const nextEntry = nextEntries.find((entry) => entry.id === entryId);
      entriesRef.current = nextEntries;
      setEntries(nextEntries);
      if (nextEntry) {
        void persistEntryToCloud(nextEntries, nextEntry).catch(() => {
          setImageMessage("画像は追加しました。クラウド保存は自動で再確認します。");
        });
      }
      setActionNotice(`${files.length} 件の画像を追加しました。`);
      setImageMessage(`${files.length} 件の画像を追加しました。`);
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
      if (targetEntry) {
        void persistEntryToCloud(result.entries, targetEntry).catch(() => {
          setImageMessage("写真は登録しました。クラウド保存は自動で再確認します。");
        });
      }
      setSelectedEntryId(result.selectedEntryId);
      setHighlightedEntryId(result.selectedEntryId);

      setActionNotice("写真を登録しました。対象の記録を開いています。");
      setImageMessage("写真を登録しました。既存データがあれば紐づけ、なければ新規作成しています。");
      setActiveView("records");
      setIsDetailDrawerOpen(true);
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
    <main className="page">
      <header className="pageHeader">
        <div className="headerIntro">
          <p className="eyebrow">Live Log</p>
          <div className="titleRow">
            <h1>ライブ記録</h1>
            <button className="toolButton subtleToolButton" type="button" onClick={cycleThemeMode}>
              {getThemeModeLabel(themeMode)}
            </button>
          </div>
          <div className="headerStatusRow">
            {shareMessage ? <span className="statusBadge statusBadgeSoft">{shareMessage}</span> : null}
            {actionNotice ? <span className="statusBadge statusBadgeSuccess">{actionNotice}</span> : null}
          </div>
        </div>
        <div className="headerActions">
          <div className="headerCluster">
            <button
              className={activeView === "records" ? "tabButton activeTab" : "tabButton"}
              type="button"
              onClick={() => setActiveView("records")}
            >
              一覧
            </button>
            <button
              className={activeView === "analytics" ? "tabButton activeTab" : "tabButton"}
              type="button"
              onClick={() => setActiveView("analytics")}
            >
              集計
            </button>
            <button
              className={activeView === "yearly" ? "tabButton activeTab" : "tabButton"}
              type="button"
              onClick={() => setActiveView("yearly")}
            >
              年別まとめ
            </button>
            <button
              className={activeView === "batchImport" ? "tabButton activeTab" : "tabButton"}
              type="button"
              onClick={() => setActiveView("batchImport")}
            >
              画像整理
            </button>
            <button className="toolButton" type="button" onClick={handleCsvExport}>
              CSV書き出し
            </button>
          </div>
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

      {activeView === "records" ? (
        <section className="recordsLayout">
          <RecordDetailPanel
            selectedEntry={selectedEntry}
            detailPhotoInputRef={detailPhotoInputRef}
            variant="panel"
            onOpenPhotoPicker={() => detailPhotoInputRef.current?.click()}
            onEntryImageUpload={handleEntryImageUpload}
            onDeleteImage={handleEntryImageDelete}
            onRetryImageSync={handleRetryImageSync}
            onRetryEntryImageSync={handleRetryEntryImageSync}
            onUpdateEntryField={updateEntryField}
          />

          <section className="panel listPanel listPanelWide">
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

            <div className="columnChooser">
              <div className="columnChooserHeader">
                <span>一覧の表示項目</span>
                <div className="densityToggle">
                  <button
                    className={listDensity === "comfortable" ? "toolButton activeToolButton" : "toolButton"}
                    type="button"
                    onClick={() => setListDensity("comfortable")}
                  >
                    標準
                  </button>
                  <button
                    className={listDensity === "compact" ? "toolButton activeToolButton" : "toolButton"}
                    type="button"
                    onClick={() => setListDensity("compact")}
                  >
                    コンパクト
                  </button>
                </div>
              </div>
              <div className="columnButtons">
                {LIST_COLUMN_OPTIONS.map((column) => (
                  <button
                    key={column.key}
                    className={visibleListColumns.includes(column.key) ? "toolButton activeToolButton" : "toolButton"}
                    type="button"
                    onClick={() => toggleListColumn(column.key)}
                  >
                    {column.label}
                  </button>
                ))}
              </div>
            </div>

            <RecordListTable
              entries={filteredEntries}
              selectedEntryId={selectedEntryId}
              highlightedEntryId={highlightedEntryId}
              selectedEntryIds={selectedEntryIds}
              visibleSelectedCount={visibleSelectedCount}
              visibleListColumns={visibleListColumns}
              columnWidths={columnWidths}
              density={listDensity}
              dateSortOrder={dateSortOrder}
              onToggleVisibleEntries={toggleVisibleEntries}
              onToggleEntrySelection={toggleEntrySelection}
              onSelectEntry={handleSelectEntry}
              onToggleDateSort={() => setDateSortOrder((current) => (current === "desc" ? "asc" : "desc"))}
              onResizeStart={startColumnResize}
            />
          </section>
        </section>
      ) : activeView === "analytics" ? (
        <section className="analyticsSection">
          <section
            className="analyticsBoardGrid"
            style={{ gridTemplateRows: `repeat(${dashboardRowCount}, minmax(18px, auto))` }}
          >
            {positionedTiles.map((tile) => (
              <div
                key={tile.id}
                ref={(element) => {
                  analyticsTileRefs.current[tile.id] = element;
                }}
                className={`analyticsBoardTile analyticsBoardTile-${resolvedAnalyticsTileHeights[tile.id] ?? "standard"}`}
                style={{
                  gridColumn: `${tile.colStart} / span ${tile.colSpan}`,
                  gridRow: `${tile.rowStart} / span ${tile.rowSpan}`
                }}
              >
                {tileMap[tile.id]}
              </div>
            ))}
          </section>
        </section>
      ) : activeView === "yearly" ? (
        <section className="analyticsSection">
          <div ref={yearlySummaryRef}>
            <YearlySummaryPanel
              selectedYear={selectedYear}
              availableYears={availableYears}
              yearOverview={yearOverview}
              yearAggregates={yearAggregates}
              onYearChange={setSelectedYear}
              registerAggregateRef={(key, element) => {
                yearlyAggregateRefs.current[key] = element;
              }}
              renderAggregateActions={(key, label) => (
                <button className="toolButton" type="button" data-share-exclude="true" onClick={() => shareYearlyAggregate(key, label)}>
                  共有
                </button>
              )}
              actions={
                <button className="toolButton" type="button" data-share-exclude="true" onClick={shareYearlySummary}>
                  共有
                </button>
              }
            />
          </div>
        </section>
      ) : (
        <section className="analyticsSection">
          <BatchImportBoard
            entries={entries}
            imageService={imageService}
            onApply={setEntries}
            onLinkedToEntry={(entryId) => {
              setQuery("");
              setActiveTool(null);
              setSelectedEntryIds([]);
              setSelectedEntryId(entryId);
              setBatchPreviewEntryId(entryId);
            }}
          />
        </section>
      )}

      {activeView === "batchImport" && batchPreviewEntry ? (
        <RecordDetailPanel
          selectedEntry={batchPreviewEntry}
          detailPhotoInputRef={detailPhotoInputRef}
          variant="overlay"
          isOpen={Boolean(batchPreviewEntryId)}
          onOpenPhotoPicker={() => detailPhotoInputRef.current?.click()}
          onClose={() => setBatchPreviewEntryId("")}
          onEntryImageUpload={handleEntryImageUpload}
          onDeleteImage={handleEntryImageDelete}
          onRetryImageSync={handleRetryImageSync}
          onRetryEntryImageSync={handleRetryEntryImageSync}
          onUpdateEntryField={updateEntryField}
        />
      ) : null}

      {activeView === "records" && selectedEntry ? (
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

      <nav className="mobileBottomNav" aria-label="モバイルナビゲーション">
        <button
          className={activeView === "records" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setActiveView("records")}
        >
          一覧
        </button>
        <button
          className={activeView === "analytics" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setActiveView("analytics")}
        >
          集計
        </button>
        <button
          className={activeView === "yearly" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setActiveView("yearly")}
        >
          年別
        </button>
        <button
          className={activeView === "batchImport" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setActiveView("batchImport")}
        >
          画像
        </button>
        <button
          className={isDetailDrawerOpen ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => setIsDetailDrawerOpen((current) => !current)}
          disabled={!selectedEntry}
        >
          詳細
        </button>
      </nav>
    </main>
  );
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
