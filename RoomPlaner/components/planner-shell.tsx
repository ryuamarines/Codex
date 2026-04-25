"use client";

import dynamic from "next/dynamic";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { sampleProject } from "@/data/sample-project";
import {
  distance,
  getDoorSwingPolygon,
  getRotatedRectPoints,
  getWindowSegment,
  getZoneRect,
  mmToPx,
  nearestWallPoint,
  projectOffsetOnWall,
  pxToMm
} from "@/lib/geometry";
import { getSelectedObjectDescriptor, updateDoorField } from "@/lib/inspector";
import {
  addDoor,
  addFurnitureFromRect,
  addWindow,
  addZoneFromRect,
  duplicateFurniture,
  insertRoomVertex,
  removeSelectedObject,
  setBackground,
  setRoom,
  setScale,
  translateRoom,
  updateDoorPlacement,
  updateFurniturePosition,
  updateRoomVertex,
  updateSelectedFieldOnProject,
  updateWindowPlacement,
  updateZonePosition
} from "@/lib/project-operations";
import {
  appendFurnitureFromMigration,
  appendOpeningsFromMigration,
  mmPointsToCanvas,
  parseFurnitureRows,
  parseOpeningRows,
  parseOrthogonalWallPath
} from "@/lib/planner5d-migration";
import { exportProjectCsv, importProjectCsv } from "@/lib/project-csv";
import { usePlannerProject } from "@/lib/use-planner-project";
import { useRoomPlanerCloud } from "@/lib/use-roomplaner-cloud";
import { usePlannerUi } from "@/lib/use-planner-ui";
import type {
  BackgroundImage,
  CollisionIssue,
  DoorOpenDirection,
  DoorSwing,
  FurnitureKind,
  PlannerMode,
  PlannerProject,
  Point,
  SelectionItem
} from "@/lib/types";

const PlannerCanvas = dynamic(
  () => import("@/components/planner-canvas").then((module) => module.PlannerCanvas),
  { ssr: false }
);

const FURNITURE_LIBRARY: Array<{
  kind: FurnitureKind;
  name: string;
  widthMm: number;
  depthMm: number;
}> = [
  { kind: "bed", name: "ベッド", widthMm: 1000, depthMm: 2100 },
  { kind: "desk", name: "デスク", widthMm: 1400, depthMm: 650 },
  { kind: "table", name: "テーブル", widthMm: 900, depthMm: 900 },
  { kind: "chair", name: "チェア", widthMm: 520, depthMm: 520 },
  { kind: "sofa", name: "ソファ", widthMm: 1600, depthMm: 850 },
  { kind: "wardrobe", name: "ワードローブ", widthMm: 900, depthMm: 450 },
  { kind: "cabinet", name: "キャビネット", widthMm: 1200, depthMm: 420 },
  { kind: "shelf", name: "シェルフ", widthMm: 900, depthMm: 300 },
  { kind: "appliance", name: "家電", widthMm: 700, depthMm: 650 },
  { kind: "rug", name: "ラグ", widthMm: 1600, depthMm: 1200 },
  { kind: "plant", name: "植物", widthMm: 500, depthMm: 500 },
  { kind: "generic", name: "汎用家具", widthMm: 1200, depthMm: 600 }
];

export function PlannerShell() {
  const {
    project,
    issues,
    undoStack,
    redoStack,
    updateProject,
    applyProjectUpdate,
    replaceProject,
    importProjectJson,
    exportProjectJson,
    undo,
    redo,
    clearPersistedProject
  } = usePlannerProject();
  const {
    mode,
    setMode,
    selection,
    selectedItems,
    draftRoomPoints,
    setDraftRoomPoints,
    scaleDraft,
    setScaleDraft,
    draftPlacement,
    setDraftPlacement,
    scaleDistanceMm,
    setScaleDistanceMm,
    viewport,
    setViewport,
    snapEnabled,
    setSnapEnabled,
    snapSizePx,
    setSnapSizePx,
    clearSelection,
    selectSingle,
    toggleSelection,
    resetTransientUi
  } = usePlannerUi();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement | null>(null);
  const [migrationWallPath, setMigrationWallPath] = useState("right 4200\ndown 2600\nleft 1800\ndown 1200\nleft 2400\nup 3800");
  const [migrationFurnitureCsv, setMigrationFurnitureCsv] = useState(
    "name,width,depth,x,y,rotation\nBed,1400,2000,2900,2800,90\nDesk,1200,600,900,800,0"
  );
  const [migrationOpeningsCsv, setMigrationOpeningsCsv] = useState(
    "type,wallIndex,offsetMm,widthMm,swing,openDirection,note\nwindow,0,900,1600,,,main window\ndoor,4,500,800,counterclockwise,inward,entry"
  );
  const [migrationOriginX, setMigrationOriginX] = useState("180");
  const [migrationOriginY, setMigrationOriginY] = useState("180");
  const [migrationMessage, setMigrationMessage] = useState("");
  const [showMigrationAssistant, setShowMigrationAssistant] = useState(false);
  const [objectSearch, setObjectSearch] = useState("");
  const [selectedFurniturePreset, setSelectedFurniturePreset] = useState(FURNITURE_LIBRARY[0]);
  const selectedObject = useMemo(() => getSelectedObjectDescriptor(project, selection), [project, selection]);
  const setupActions: Array<{ mode: PlannerMode; label: string; disabled?: boolean }> = [
    { mode: "set-scale", label: "スケール設定" },
    { mode: "trace-room", label: "壁をトレース" },
    { mode: "add-window", label: "窓を追加", disabled: !project.room },
    { mode: "add-door", label: "扉を追加", disabled: !project.room },
    { mode: "add-zone", label: "窓前制約ゾーン" },
    { mode: "add-furniture", label: "家具を追加" }
  ];
  const issueMessages = useMemo(() => {
    if (selectedItems.length === 0) return issues.slice(0, 4).map((issue) => issue.message);
    return issues
      .filter((issue) => selectedItems.some((item) => item.id === issue.id && item.type === issue.type))
      .map((issue) => issue.message);
  }, [issues, selectedItems]);
  const issueSummary = useMemo(() => summarizeIssues(issues), [issues]);
  const objectIndex = useMemo(() => buildObjectIndex(project, issues), [project, issues]);
  const filteredObjectGroups = useMemo(
    () => groupIndexedObjects(
      objectIndex.filter((item) => item.label.toLowerCase().includes(objectSearch.trim().toLowerCase()))
    ),
    [objectIndex, objectSearch]
  );

  const loadProjectState = (nextProject: PlannerProject) => {
    replaceProject(nextProject);
    resetTransientUi();
  };

  const {
    firebaseUser,
    cloudMessage,
    cloudBusy,
    cloudHydrating,
    firebaseConfigured,
    signIn,
    signOut,
    saveProjectToCloud,
    loadProjectFromCloud
  } = useRoomPlanerCloud({
    project,
    loadProjectState,
    parseProject: importProjectJson
  });

  const handleUndo = () => {
    undo();
    resetTransientUi();
  };

  const handleRedo = () => {
    redo();
    resetTransientUi();
  };

  const fitViewportToBounds = (bounds: Bounds | null) => {
    if (!bounds) return;
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const padding = 80;
    const scale = Math.max(
      0.35,
      Math.min(
        3.5,
        Math.min(
          (project.canvas.width - padding * 2) / width,
          (project.canvas.height - padding * 2) / height
        )
      )
    );

    setViewport({
      scale,
      x: -bounds.minX * scale + (project.canvas.width - width * scale) / 2,
      y: -bounds.minY * scale + (project.canvas.height - height * scale) / 2
    });
  };

  const fitToRoom = () => fitViewportToBounds(getRoomBounds(project));
  const fitToBackground = () => fitViewportToBounds(getBackgroundBounds(project));
  const fitToAll = () => fitViewportToBounds(getAllProjectBounds(project));
  const fitToSelection = (item: SelectionItem | null = selection) =>
    fitViewportToBounds(item ? getSelectionBounds(project, item) : null);
  const migrationOrigin = {
    x: Number(migrationOriginX) || 180,
    y: Number(migrationOriginY) || 180
  };

  const snapPoint = (point: Point) => {
    if (!snapEnabled || snapSizePx <= 1) return point;
    return {
      x: Math.round(point.x / snapSizePx) * snapSizePx,
      y: Math.round(point.y / snapSizePx) * snapSizePx
    };
  };

  const handleCanvasClick = (point: Point) => {
    const nextPoint = snapPoint(point);
    if (mode === "trace-room") {
      setDraftRoomPoints((current) => [...current, nextPoint]);
      return;
    }

    if (mode === "set-scale") {
      setScaleDraft((current) => (current.length >= 2 ? [nextPoint] : [...current, nextPoint]));
      return;
    }

    if ((mode === "add-window" || mode === "add-door") && project.room) {
      const snapped = nearestWallPoint(project.room.points, nextPoint);
      if (!snapped) return;
      const defaultWidthMm = mode === "add-window" ? 1500 : 800;
      const objectWidthPx = mmToPx(defaultWidthMm, project.scalePxPerMm);
      const wallLength = snapped.length;
      const offset = Math.max(0, Math.min(wallLength - objectWidthPx, snapped.length * snapped.projection - objectWidthPx / 2));

      if (mode === "add-window") {
        const result = addWindow(project, snapped.index, offset, defaultWidthMm);
        replaceProject(result.nextProject);
        selectSingle({ type: "window", id: result.createdId });
      } else {
        const result = addDoor(project, snapped.index, offset, defaultWidthMm);
        replaceProject(result.nextProject);
        selectSingle({ type: "door", id: result.createdId });
      }

      setMode("select");
    }
  };

  const handleCanvasPointerDown = (point: Point) => {
    const nextPoint = snapPoint(point);
    if (mode === "add-furniture") {
      setDraftPlacement({ kind: "furniture", start: nextPoint, end: nextPoint });
    }
    if (mode === "add-zone") {
      setDraftPlacement({ kind: "zone", start: nextPoint, end: nextPoint });
    }
  };

  const handleCanvasMove = (point: Point) => {
    if (!draftPlacement) return;
    if (
      (mode === "add-furniture" && draftPlacement.kind === "furniture") ||
      (mode === "add-zone" && draftPlacement.kind === "zone")
    ) {
      setDraftPlacement((current) => (current ? { ...current, end: snapPoint(point) } : current));
    }
  };

  const handleCanvasPointerUp = (point: Point) => {
    const nextPoint = snapPoint(point);
    if (!draftPlacement) return;

    if (mode === "add-furniture" && draftPlacement.kind === "furniture") {
      const result = addFurnitureFromRect(project, draftPlacement.start, nextPoint);
      replaceProject({
        ...result.nextProject,
        furniture: result.nextProject.furniture.map((item) =>
          item.id === result.createdId
            ? {
                ...item,
                name: selectedFurniturePreset.name,
                kind: selectedFurniturePreset.kind
              }
            : item
        )
      });
      selectSingle({ type: "furniture", id: result.createdId });
      setDraftPlacement(null);
      setMode("select");
      return;
    }

    if (mode === "add-zone" && draftPlacement.kind === "zone") {
      const result = addZoneFromRect(project, draftPlacement.start, nextPoint);
      replaceProject(result.nextProject);
      selectSingle({ type: "zone", id: result.createdId });
      setDraftPlacement(null);
      setMode("select");
    }
  };

  const completeRoomTrace = () => {
    if (draftRoomPoints.length < 3) return;
    const result = setRoom(project, draftRoomPoints);
    replaceProject(result.nextProject);
    setDraftRoomPoints([]);
    setMode("select");
    selectSingle({ type: "room", id: result.roomId });
  };

  const applyScale = () => {
    if (scaleDraft.length !== 2) return;
    const measuredMm = Number(scaleDistanceMm);
    if (!Number.isFinite(measuredMm) || measuredMm <= 0) return;
    const measuredPx = distance(scaleDraft[0], scaleDraft[1]);
    if (measuredPx <= 0) return;
    replaceProject(setScale(project, measuredPx / measuredMm));
    setScaleDraft([]);
    setMode("select");
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadBackgroundDataUrl(String(reader.result ?? ""));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const loadBackgroundDataUrl = (dataUrl: string) => {
    const image = new window.Image();
    image.onload = () => {
      const background: BackgroundImage = {
        dataUrl,
        visible: true,
        opacity: 0.64,
        locked: true,
        width: image.width,
        height: image.height
      };

      replaceProject(
        setBackground(project, background, {
          width: Math.max(project.canvas.width, image.width),
          height: Math.max(project.canvas.height, image.height)
        })
      );
    };
    image.src = dataUrl;
  };

  const loadBundledPlanner5dSample = async () => {
    const response = await fetch("/import-samples/planner5d-room.png");
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onload = () => {
      loadBackgroundDataUrl(String(reader.result ?? ""));
    };
    reader.readAsDataURL(blob);
  };

  const exportProject = () => {
    const blob = new Blob([exportProjectCsv(project)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name || "RoomPlaner-project"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importProject = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = importProjectCsv(String(reader.result ?? ""));
        loadProjectState(parsed);
      } catch {
        window.alert("CSV の読み込みに失敗しました。RoomPlaner の書き出しCSVを選んでください。");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const importLegacyJsonProject = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = importProjectJson(String(reader.result ?? ""));
        loadProjectState(parsed);
      } catch {
        window.alert("JSON の読み込みに失敗しました。旧 RoomPlaner の書き出しJSONを選んでください。");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const importRoomFromPlanner5dPath = () => {
    try {
      const pointsMm = parseOrthogonalWallPath(migrationWallPath);
      const pointsPx = mmPointsToCanvas(pointsMm, project.scalePxPerMm, migrationOrigin);
      const result = setRoom(project, pointsPx);
      replaceProject(result.nextProject);
      selectSingle({ type: "room", id: result.roomId });
      setMode("select");
      setMigrationMessage(`壁パスから ${pointsPx.length} 点の部屋形状を生成しました。`);
    } catch (error) {
      setMigrationMessage(error instanceof Error ? error.message : "壁パスの読み込みに失敗しました。");
    }
  };

  const importFurnitureFromPlanner5d = () => {
    try {
      const rows = parseFurnitureRows(migrationFurnitureCsv);
      replaceProject(appendFurnitureFromMigration(project, rows, project.scalePxPerMm, migrationOrigin));
      setMigrationMessage(`${rows.length} 件の家具を追加しました。`);
    } catch (error) {
      setMigrationMessage(error instanceof Error ? error.message : "家具CSVの読み込みに失敗しました。");
    }
  };

  const importOpeningsFromPlanner5d = () => {
    try {
      const rows = parseOpeningRows(migrationOpeningsCsv);
      replaceProject(appendOpeningsFromMigration(project, rows, project.scalePxPerMm));
      setMigrationMessage(`${rows.length} 件の窓/扉を追加しました。`);
    } catch (error) {
      setMigrationMessage(error instanceof Error ? error.message : "開口CSVの読み込みに失敗しました。");
    }
  };

  const updateSelectedField = (field: string, value: string | number) => {
    if (!selection) return;
    updateProject((current) =>
      updateSelectedFieldOnProject(current, selection, field, value, updateDoorField)
    );
  };

  const moveWallObject = (
    type: "window" | "door",
    id: string,
    point: Point,
    recordHistory = true
  ) => {
    if (!project.room) return;
    const placement = projectOffsetOnWall(project.room.points, point);
    if (!placement) return;

    const updater = (current: PlannerProject) => {
      if (!current.room) return current;
      const edge = nearestWallPoint(current.room.points, point);

      if (type === "window") {
        const item = current.windows.find((entry) => entry.id === id);
        if (!item) return current;
        const widthPx = mmToPx(item.widthMm, current.scalePxPerMm);
        const maxOffset = Math.max(0, (edge?.length ?? 0) - widthPx);
        const nextOffset = Math.max(0, Math.min(maxOffset, placement.offset - widthPx / 2));
        return updateWindowPlacement(current, id, placement.wallIndex, nextOffset);
      }

      const item = current.doors.find((entry) => entry.id === id);
      if (!item) return current;
      const widthPx = mmToPx(item.widthMm, current.scalePxPerMm);
      const maxOffset = Math.max(0, (edge?.length ?? 0) - widthPx);
      const nextOffset = Math.max(
        0,
        Math.min(
          maxOffset,
          item.swing === "clockwise" ? placement.offset - widthPx : placement.offset
        )
      );

      return updateDoorPlacement(current, id, placement.wallIndex, nextOffset);
    };

    applyProjectUpdate(updater, { recordHistory });
  };

  const moveRoomVertex = (index: number, point: Point, recordHistory = true) => {
    const nextPoint = snapPoint(point);
    applyProjectUpdate(
      (current) => updateRoomVertex(current, index, nextPoint),
      { recordHistory }
    );
  };

  const moveRoom = (delta: Point, recordHistory = true) => {
    applyProjectUpdate((current) => translateRoom(current, delta), { recordHistory });
  };

  const addRoomVertex = (edgeIndex: number, point: Point) => {
    applyProjectUpdate((current) => insertRoomVertex(current, edgeIndex, snapPoint(point)));
  };

  const moveZone = (id: string, point: Point, recordHistory = true) => {
    const nextPoint = snapPoint(point);
    applyProjectUpdate(
      (current) => updateZonePosition(current, id, nextPoint),
      { recordHistory }
    );
  };

  const removeSelected = () => {
    if (selectedItems.length === 0) return;
    updateProject((current) =>
      selectedItems.reduce((nextProject, item) => removeSelectedObject(nextProject, item), current)
    );
    clearSelection();
  };

  const clearCurrentDraft = () => {
    setDraftRoomPoints([]);
    setScaleDraft([]);
    setDraftPlacement(null);
  };

  const moveSelectionToCanvasCenter = (item: SelectionItem | null = selection) => {
    if (!item) return;
    const target = getSelectionBounds(project, item);
    if (!target) return;
    const targetCenter = {
      x: (target.minX + target.maxX) / 2,
      y: (target.minY + target.maxY) / 2
    };
    const canvasCenter = {
      x: project.canvas.width / 2,
      y: project.canvas.height / 2
    };
    const delta = {
      x: canvasCenter.x - targetCenter.x,
      y: canvasCenter.y - targetCenter.y
    };

    updateProject((current) => {
      switch (item.type) {
        case "furniture": {
          const source = current.furniture.find((entry) => entry.id === item.id);
          if (!source) return current;
          return updateFurniturePosition(current, item.id, {
            x: source.x + delta.x,
            y: source.y + delta.y
          });
        }
        case "zone": {
          const source = current.zones.find((entry) => entry.id === item.id);
          if (!source) return current;
          return updateZonePosition(current, item.id, {
            x: source.x + delta.x,
            y: source.y + delta.y
          });
        }
        case "room":
          return translateRoom(current, delta);
        default:
          return current;
      }
    });

  };

  const duplicateSelectedFurniture = () => {
    if (selection?.type !== "furniture") return;
    const source = project.furniture.find((item) => item.id === selection.id);
    if (!source) return;
    const result = duplicateFurniture(project, selection.id, snapPoint({ x: source.x + 40, y: source.y + 40 }));
    replaceProject(result.nextProject);
    if (result.createdId) {
      selectSingle({ type: "furniture", id: result.createdId });
    }
  };

  const rotateSelectedFurniture = (delta: number) => {
    if (selection?.type !== "furniture") return;
    updateProject((current) => ({
      ...current,
      furniture: current.furniture.map((item) =>
        item.id === selection.id
          ? { ...item, rotation: normalizeRotation(item.rotation + delta) }
          : item
      )
    }));
  };

  const setSelectedFurnitureKind = (kind: FurnitureKind) => {
    if (selection?.type !== "furniture") return;
    updateProject((current) => ({
      ...current,
      furniture: current.furniture.map((item) => (item.id === selection.id ? { ...item, kind } : item))
    }));
  };

  const toggleSelectedDoorSwing = () => {
    if (selection?.type !== "door") return;
    updateProject((current) => ({
      ...current,
      doors: current.doors.map((item) =>
        item.id === selection.id
          ? { ...item, swing: (item.swing === "clockwise" ? "counterclockwise" : "clockwise") as DoorSwing }
          : item
      )
    }));
  };

  const toggleSelectedDoorOpenDirection = () => {
    if (selection?.type !== "door") return;
    updateProject((current) => ({
      ...current,
      doors: current.doors.map((item) =>
        item.id === selection.id
          ? {
              ...item,
              openDirection: (item.openDirection === "inward" ? "outward" : "inward") as DoorOpenDirection
            }
          : item
      )
    }));
  };

  const resizeSelectedFurniture = (widthMm: number, depthMm: number) => {
    if (selection?.type !== "furniture") return;
    updateProject((current) => ({
      ...current,
      furniture: current.furniture.map((item) =>
        item.id === selection.id ? { ...item, widthMm, depthMm } : item
      )
    }));
  };

  const resizeSelectedZone = (widthMm: number, depthMm: number) => {
    if (selection?.type !== "zone") return;
    updateProject((current) => ({
      ...current,
      zones: current.zones.map((item) =>
        item.id === selection.id ? { ...item, widthMm, depthMm } : item
      )
    }));
  };

  const nudgeSelection = (deltaX: number, deltaY: number) => {
    if (selectedItems.length === 0) return;
    updateProject((current) =>
      selectedItems.reduce((nextProject, item) => {
        if (item.type === "furniture") {
          const target = nextProject.furniture.find((entry) => entry.id === item.id);
          if (!target) return nextProject;
          return updateFurniturePosition(
            nextProject,
            item.id,
            snapPoint({ x: target.x + deltaX, y: target.y + deltaY })
          );
        }

        if (item.type === "zone") {
          const target = nextProject.zones.find((entry) => entry.id === item.id);
          if (!target) return nextProject;
          return updateZonePosition(
            nextProject,
            item.id,
            snapPoint({ x: target.x + deltaX, y: target.y + deltaY })
          );
        }

        return nextProject;
      }, current)
    );
  };

  useEffect(() => {
    if (mode !== "add-furniture" && mode !== "add-zone") {
      setDraftPlacement(null);
    }
  }, [mode, setDraftPlacement]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (isTypingTarget) {
        return;
      }

      const withMeta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (withMeta && key === "z" && event.shiftKey) {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (withMeta && key === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (withMeta && key === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (withMeta && key === "d" && selection?.type === "furniture") {
        event.preventDefault();
        duplicateSelectedFurniture();
        return;
      }

      if (key === "q" && selection?.type === "furniture") {
        event.preventDefault();
        rotateSelectedFurniture(-15);
        return;
      }

      if (key === "e" && selection?.type === "furniture") {
        event.preventDefault();
        rotateSelectedFurniture(15);
        return;
      }

      if (withMeta && key === "0") {
        event.preventDefault();
        setViewport({ x: 0, y: 0, scale: 1 });
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedItems.some((item) => item.type !== "room")
      ) {
        event.preventDefault();
        removeSelected();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setMode("select");
        clearCurrentDraft();
        clearSelection();
        return;
      }

      const step = event.shiftKey ? snapSizePx * 2 : snapEnabled ? snapSizePx : 10;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeSelection(0, -step);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeSelection(0, step);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeSelection(-step, 0);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeSelection(step, 0);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selection,
    selectedItems,
    handleRedo,
    handleUndo,
    duplicateSelectedFurniture,
    rotateSelectedFurniture,
    setSelectedFurnitureKind,
    removeSelected,
    setMode,
    setDraftRoomPoints,
    setScaleDraft,
    clearSelection,
    setDraftPlacement,
    clearCurrentDraft,
    snapEnabled,
    snapSizePx
  ]);

  return (
    <main className="min-h-screen p-5 text-slate-900 md:p-6">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
        <header className="panel flex flex-col gap-4 p-5">
          <div>
            <div className="panel-title">RoomPlaner</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">RoomPlaner</h1>
            <input
              className="input mt-3 max-w-md"
              value={project.name}
              onChange={(event) =>
                updateProject((current) => ({
                  ...current,
                  name: event.target.value
                }))
              }
              placeholder="プロジェクト名"
            />
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              間取り図を下敷きにしながら、自由形状の部屋、窓、扉、制約ゾーン、家具を 2D 上で配置し、
              干渉を即時確認できます。
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Mode: {modeDescriptionShort(mode)}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Objects: {objectIndex.length}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Warnings: {issues.length}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Zoom: {Math.round(viewport.scale * 100)}%</span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importProject} />
            <input
              ref={importJsonInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={importLegacyJsonProject}
            />
            <button className="button-soft" onClick={() => importInputRef.current?.click()}>
              CSV を読み込む
            </button>
            <button className="button-soft" onClick={() => importJsonInputRef.current?.click()}>
              旧JSONを読み込む
            </button>
            <button className="button-soft" onClick={exportProject}>
              CSV を書き出す
            </button>
            <button className="button-soft" onClick={handleUndo} disabled={undoStack.length === 0}>
              Undo
            </button>
            <button className="button-soft" onClick={handleRedo} disabled={redoStack.length === 0}>
              Redo
            </button>
            <button
              className="button-soft"
              onClick={() => {
                loadProjectState(sampleProject);
                setMode("select");
                clearPersistedProject();
              }}
            >
              サンプルに戻す
            </button>
            <button
              className="button-soft"
              onClick={() => {
                const emptyProject: PlannerProject = {
                  ...sampleProject,
                  id: `project-${Date.now()}`,
                  name: "新規プロジェクト",
                  background: null,
                  room: null,
                  windows: [],
                  zones: [],
                  doors: [],
                  furniture: [],
                  scalePxPerMm: 0.1
                };
                loadProjectState(emptyProject);
                setMode("select");
              }}
            >
              新規プロジェクト
            </button>
          </div>
        </header>

        <div className="grid gap-4 min-[1900px]:grid-cols-[280px_minmax(0,1fr)] min-[2600px]:grid-cols-[280px_minmax(0,1fr)_330px]">
          <aside className="panel h-fit p-4 min-[1900px]:sticky min-[1900px]:top-4">
            <div className="panel-title">Add / Setup</div>
            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">アカウント / クラウド</div>
                  <div className="mt-2 text-sm text-slate-600">
                    {firebaseUser ? `ログイン中: ${firebaseUser.displayName || firebaseUser.email || firebaseUser.uid}` : "未ログイン"}
                  </div>
                </div>
                <div
                  className={
                    firebaseUser
                      ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                      : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500"
                  }
                >
                  {firebaseUser ? "ONLINE" : "OFFLINE"}
                </div>
              </div>
              <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs leading-5 text-slate-500">
                旧JSONを読み込んでから Firestore に保存すると、公開URL側で自分のデータとして持てます。
              </div>
              {cloudMessage ? (
                <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">{cloudMessage}</div>
              ) : null}
              {cloudHydrating ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                  Firestore の保存内容を確認しています。読込中でもログアウトはできます。
                </div>
              ) : null}
              <div className="mt-3 grid gap-2">
                {firebaseUser ? (
                  <>
                    <button className="button-soft w-full" onClick={loadProjectFromCloud} disabled={cloudBusy}>
                      Firestore から読込
                    </button>
                    <button className="button-soft w-full" onClick={saveProjectToCloud} disabled={cloudBusy}>
                      Firestore に保存
                    </button>
                    <button className="button-danger w-full" onClick={signOut} disabled={cloudBusy}>
                      ログアウト
                    </button>
                  </>
                ) : (
                  <button className="button-strong w-full" onClick={signIn} disabled={!firebaseConfigured || cloudBusy}>
                    Googleでログイン
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <label className="button-soft cursor-pointer text-center">
                背景画像を読み込む
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleImageUpload} />
              </label>
              <button className="button-soft" onClick={loadBundledPlanner5dSample}>
                添付画像を背景に使う
              </button>
              {setupActions.map((action) => (
                <button
                  key={action.mode}
                  className={mode === action.mode ? "button-strong" : "button-soft"}
                  onClick={() => setMode(action.mode)}
                  disabled={action.disabled}
                >
                  {action.label}
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">家具ライブラリ</div>
                <div className="text-xs text-slate-500">クリックで選択して配置</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {FURNITURE_LIBRARY.map((preset) => {
                  const active = selectedFurniturePreset.kind === preset.kind && selectedFurniturePreset.name === preset.name;
                  return (
                    <button
                      key={`${preset.kind}-${preset.name}`}
                      className={active ? "rounded-2xl border border-slate-900 bg-white p-3 text-left shadow-sm" : "rounded-2xl border border-slate-200 bg-white p-3 text-left"}
                      onClick={() => {
                        setSelectedFurniturePreset(preset);
                        setMode("add-furniture");
                      }}
                    >
                      <div className="text-sm font-semibold text-slate-900">{preset.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {preset.widthMm} x {preset.depthMm} mm
                      </div>
                      <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {preset.kind}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">現在の操作</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{modeDescription(mode)}</p>
              {mode === "trace-room" ? (
                <div className="mt-3 flex gap-2">
                  <button className="button-strong" onClick={completeRoomTrace} disabled={draftRoomPoints.length < 3}>
                    トレース完了
                  </button>
                  <button className="button-soft" onClick={() => setDraftRoomPoints([])}>
                    クリア
                  </button>
                </div>
              ) : null}
              {mode === "set-scale" ? (
                <div className="mt-3 space-y-2">
                  <input
                    className="input"
                    type="number"
                    value={scaleDistanceMm}
                    onChange={(event) => setScaleDistanceMm(event.target.value)}
                    placeholder="実寸 mm"
                  />
                  <button className="button-strong w-full" onClick={applyScale} disabled={scaleDraft.length !== 2}>
                    スケールを適用
                  </button>
                </div>
              ) : null}
              {draftPlacement ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-600">
                  1点目を記録済みです。2点目で確定します。迷ったら下の `下書きをキャンセル` で取り消せます。
                </div>
              ) : null}
              {mode === "select" && project.room ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-600">
                  部屋輪郭を選ぶと、中央ハンドルで部屋全体を安全に動かせます。辺の中央ハンドルを押すと頂点を追加できます。
                </div>
              ) : null}
              {(mode === "add-furniture" || mode === "add-zone") ? (
                <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-3 text-sm leading-6 text-cyan-900">
                  1回目のクリックで始点、2回目のクリックで終点を決めると、背景に合わせた矩形サイズで生成できます。
                </div>
              ) : null}
              {(draftRoomPoints.length > 0 || scaleDraft.length > 0 || draftPlacement) ? (
                <button className="mt-3 button-soft w-full" onClick={clearCurrentDraft}>
                  下書きをキャンセル
                </button>
              ) : null}
              {selectedItems.length > 0 ? (
                <button className="mt-3 button-soft w-full" onClick={clearSelection}>
                  選択を解除
                </button>
              ) : null}
              {mode !== "select" ? (
                <button className="mt-3 button-soft w-full" onClick={() => setMode("select")}>
                  選択モードに戻る
                </button>
              ) : null}
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">プロジェクト概要</div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <div>部屋輪郭: {project.room ? `${project.room.points.length} 点` : "未設定"}</div>
                <div>窓: {project.windows.length}</div>
                <div>扉: {project.doors.length}</div>
                <div>制約ゾーン: {project.zones.length}</div>
                <div>家具: {project.furniture.length}</div>
                <div>警告: {issues.length}</div>
                <div>背景画像: {project.background ? `${project.background.width} x ${project.background.height}` : "未設定"}</div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">警告内訳</div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <div>家具同士: {issueSummary.furnitureOverlap}</div>
                <div>壁はみ出し: {issueSummary.wallOverflow}</div>
                <div>扉可動域: {issueSummary.doorSwing}</div>
                <div>窓前制約: {issueSummary.windowZone}</div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">スナップ</div>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <label className="flex items-center justify-between gap-3">
                  <span>グリッドスナップ</span>
                  <input
                    type="checkbox"
                    checked={snapEnabled}
                    onChange={(event) => setSnapEnabled(event.target.checked)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block">刻み {snapSizePx}px</span>
                  <input
                    className="w-full accent-cyan-600"
                    type="range"
                    min="10"
                    max="100"
                    step="10"
                    value={snapSizePx}
                    onChange={(event) => setSnapSizePx(Number(event.target.value))}
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">Planner5D 移行アシスタント</div>
                <button className="button-soft" onClick={() => setShowMigrationAssistant((current) => !current)}>
                  {showMigrationAssistant ? "閉じる" : "開く"}
                </button>
              </div>
              {showMigrationAssistant ? (
                <>
                  <div className="mt-2 text-sm leading-6 text-slate-600">
                    DXF などの有料 export を使わず、Planner5D 画面で見える寸法を貼り付けてこちらへ移すための補助です。
                    スクリーンショットは既存の背景画像読込を使い、ここでは寸法データを半手動で流し込みます。
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Origin X
                      </span>
                      <input className="input" value={migrationOriginX} onChange={(event) => setMigrationOriginX(event.target.value)} />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Origin Y
                      </span>
                      <input className="input" value={migrationOriginY} onChange={(event) => setMigrationOriginY(event.target.value)} />
                    </label>
                  </div>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      壁パス
                    </span>
                    <textarea
                      className="input min-h-36"
                      value={migrationWallPath}
                      onChange={(event) => setMigrationWallPath(event.target.value)}
                    />
                  </label>
                  <div className="mt-2 text-xs text-slate-500">
                    例: `right 4200`, `down 2600`, `left 1800` のように 1 行 1 辺。直交部屋を想定します。
                  </div>
                  <button className="mt-3 button-soft w-full" onClick={importRoomFromPlanner5dPath}>
                    壁パスから部屋を生成
                  </button>

                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      家具 CSV / TSV
                    </span>
                    <textarea
                      className="input min-h-36"
                      value={migrationFurnitureCsv}
                      onChange={(event) => setMigrationFurnitureCsv(event.target.value)}
                    />
                  </label>
                  <div className="mt-2 text-xs text-slate-500">
                    形式: `name,width,depth,x,y,rotation`。`x,y` は origin からの中心座標 mm です。
                  </div>
                  <button className="mt-3 button-soft w-full" onClick={importFurnitureFromPlanner5d}>
                    家具CSVを追加
                  </button>

                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      窓 / 扉 CSV / TSV
                    </span>
                    <textarea
                      className="input min-h-32"
                      value={migrationOpeningsCsv}
                      onChange={(event) => setMigrationOpeningsCsv(event.target.value)}
                    />
                  </label>
                  <div className="mt-2 text-xs text-slate-500">
                    形式: `type,wallIndex,offsetMm,widthMm,swing,openDirection,note`。古い `type,wallIndex,offsetMm,widthMm,swing,note` も読めます。
                  </div>
                  <button className="mt-3 button-soft w-full" onClick={importOpeningsFromPlanner5d}>
                    窓 / 扉CSVを追加
                  </button>
                </>
              ) : (
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  必要なときだけ開けるようにして、通常編集の邪魔を減らしました。
                </div>
              )}

              {migrationMessage ? (
                <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-3 text-sm text-cyan-800">
                  {migrationMessage}
                </div>
              ) : null}
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">ショートカット</div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <div>`空白ドラッグ`: パン</div>
                <div>`Cmd/Ctrl + Z`: Undo</div>
                <div>`Cmd/Ctrl + Shift + Z`: Redo</div>
                <div>`Cmd/Ctrl + D`: 家具複製</div>
                <div>`Q / E`: 家具を 15 度回転</div>
                <div>`Cmd/Ctrl + 0`: 表示リセット</div>
                <div>`Arrow`: 選択オブジェクトを微移動</div>
                <div>`Shift + Arrow`: 大きめに移動</div>
                <div>`Delete / Backspace`: 選択削除</div>
                <div>`Escape`: 選択モードに戻る</div>
              </div>
            </div>
          </aside>

          <section className="min-h-[780px] min-w-0 space-y-3">
            <div className="panel flex flex-wrap items-center gap-2 p-3">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Canvas Tools</span>
              <button className={mode === "select" ? "button-strong" : "button-soft"} onClick={() => setMode("select")}>
                選択
              </button>
              {setupActions.map((action) => (
                <button
                  key={`canvas-${action.mode}`}
                  className={mode === action.mode ? "button-strong" : "button-soft"}
                  onClick={() => setMode(action.mode)}
                  disabled={action.disabled}
                >
                  {action.label}
                </button>
              ))}
              <div className="ml-auto flex flex-wrap gap-2">
                <button className="button-soft" onClick={fitToAll}>
                  全体表示
                </button>
                <button className="button-soft" onClick={fitToBackground} disabled={!project.background}>
                  背景表示
                </button>
                <button className="button-soft" onClick={fitToRoom} disabled={!project.room}>
                  部屋表示
                </button>
              </div>
            </div>
            <PlannerCanvas
              project={project}
              issues={issues}
              draftRoomPoints={draftRoomPoints}
              mode={mode}
              selection={selection}
              selectedItems={selectedItems}
              scaleDraft={scaleDraft}
              draftPlacement={draftPlacement}
              viewport={viewport}
              onCanvasClick={handleCanvasClick}
              onCanvasPointerDown={handleCanvasPointerDown}
              onCanvasMove={handleCanvasMove}
              onCanvasPointerUp={handleCanvasPointerUp}
              onSelect={(nextSelection, additive) => {
                if (additive) {
                  toggleSelection(nextSelection);
                } else {
                  selectSingle(nextSelection);
                }
              }}
              onMoveFurniture={(id, x, y) =>
                updateProject((current) => updateFurniturePosition(current, id, snapPoint({ x, y })))
              }
              onPreviewRoomVertexMove={(index, point) => moveRoomVertex(index, point, false)}
              onCommitRoomVertexMove={moveRoomVertex}
              onCommitRoomMove={moveRoom}
              onInsertRoomVertex={addRoomVertex}
              onPreviewZoneMove={(id, point) => moveZone(id, point, false)}
              onCommitZoneMove={moveZone}
              onPreviewWallObjectMove={(type, id, point) => moveWallObject(type, id, snapPoint(point), false)}
              onCommitWallObjectMove={(type, id, point) => moveWallObject(type, id, snapPoint(point), true)}
              onViewportChange={setViewport}
              onRotateSelectedFurniture={rotateSelectedFurniture}
              onDuplicateSelectedFurniture={duplicateSelectedFurniture}
              onDeleteSelection={removeSelected}
              onCenterSelection={() => fitToSelection()}
              onSetSelectedFurnitureKind={setSelectedFurnitureKind}
              onToggleSelectedDoorSwing={toggleSelectedDoorSwing}
              onToggleSelectedDoorOpenDirection={toggleSelectedDoorOpenDirection}
              onResizeSelectedFurniture={resizeSelectedFurniture}
              onResizeSelectedZone={resizeSelectedZone}
            />
          </section>

          <aside className="panel h-fit p-4 min-[1900px]:col-span-2 min-[2600px]:col-span-1 min-[2600px]:sticky min-[2600px]:top-4">
            <div className="panel-title">Inspector</div>

            {project.background ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">背景画像</div>
                <div className="mt-3 space-y-3 text-sm text-slate-600">
                  <label className="flex items-center justify-between gap-3">
                    <span>表示</span>
                    <input
                      type="checkbox"
                      checked={project.background.visible}
                      onChange={(event) =>
                        updateProject((current) => ({
                          ...current,
                          background: current.background
                            ? { ...current.background, visible: event.target.checked }
                            : null
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>ロック</span>
                    <input
                      type="checkbox"
                      checked={project.background.locked}
                      onChange={(event) =>
                        updateProject((current) => ({
                          ...current,
                          background: current.background
                            ? { ...current.background, locked: event.target.checked }
                            : null
                        }))
                      }
                    />
                  </label>
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs leading-5 text-slate-500">
                    背景がロック中なら誤って画像を掴みにくくなります。通常はロック推奨です。
                  </div>
                  <label className="block">
                    <span className="mb-2 block">透明度 {project.background.opacity.toFixed(2)}</span>
                    <input
                      className="w-full accent-cyan-600"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={project.background.opacity}
                      onChange={(event) =>
                        updateProject((current) => ({
                          ...current,
                          background: current.background
                            ? { ...current.background, opacity: Number(event.target.value) }
                            : null
                        }))
                      }
                    />
                  </label>
                  <button
                    className="button-danger w-full"
                    onClick={() =>
                      updateProject((current) => ({
                        ...current,
                        background: null
                      }))
                    }
                  >
                    背景画像を削除
                  </button>
                </div>
              </div>
            ) : null}

            {project.room ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">床表示</div>
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs leading-5 text-slate-500">
                  背景画像と比較したいときは床を薄くしてください。0 にすると床模様をほぼ消せます。
                </div>
                <label className="mt-4 block">
                  <span className="mb-2 block text-sm text-slate-600">床の透明度 {project.floorOpacity.toFixed(2)}</span>
                  <input
                    className="w-full accent-cyan-600"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={project.floorOpacity}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        floorOpacity: Number(event.target.value)
                      }))
                    }
                  />
                </label>
              </div>
            ) : null}

            {selectedItems.length > 1 ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">複数選択</div>
                <div className="mt-1 text-sm text-slate-500">{selectedItems.length} 件を選択中</div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  Shift+クリックで追加選択できます。家具と制約ゾーンは矢印キーでまとめて移動できます。
                </div>
                {issueMessages.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <div className="font-semibold">警告</div>
                    <div className="mt-2 space-y-2">
                      {issueMessages.slice(0, 6).map((message, index) => (
                        <div key={`${message}-${index}`}>{message}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <button className="button-soft w-full" onClick={clearSelection}>
                    選択解除
                  </button>
                  <button className="button-danger w-full" onClick={removeSelected}>
                    選択中を削除
                  </button>
                </div>
              </div>
            ) : selectedObject ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">選択中オブジェクト</div>
                <div className="mt-1 text-sm text-slate-500">{selectedObject.label}</div>
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                  選択中の内容は右パネルで数値修正、キャンバス側では位置調整ができます。
                </div>

                <div className="mt-4 space-y-3">
                  {selectedObject.fields.map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {field.label}
                      </span>
                      {field.type === "select" ? (
                        <select
                          className="input"
                          value={String(field.value)}
                          onChange={(event) => updateSelectedField(field.key, event.target.value)}
                        >
                          {field.options!.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input"
                          type={field.type}
                          value={String(field.value)}
                          onChange={(event) =>
                            updateSelectedField(
                              field.key,
                              field.type === "number" ? Number(event.target.value) : event.target.value
                            )
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>

                {issueMessages.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <div className="font-semibold">警告</div>
                    <div className="mt-2 space-y-2">
                      {issueMessages.map((message, index) => (
                        <div key={`${message}-${index}`}>{message}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    干渉は検出されていません。
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button className="button-soft w-full" onClick={() => fitToSelection()}>
                    表示
                  </button>
                  <button
                    className="button-soft w-full"
                    onClick={() => moveSelectionToCanvasCenter()}
                    disabled={!selection || (selection.type !== "room" && selection.type !== "furniture" && selection.type !== "zone")}
                  >
                    呼び戻す
                  </button>
                </div>

                {selection?.type !== "room" ? (
                  <div className="mt-4 flex gap-2">
                    {selection?.type === "furniture" ? (
                      <button className="button-soft w-full" onClick={duplicateSelectedFurniture}>
                        家具を複製
                      </button>
                    ) : null}
                    <button className="button-danger w-full" onClick={removeSelected}>
                      選択中を削除
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                右パネルでは選択中オブジェクトの幅、位置、回転、メモ、開き方向などを調整できます。
              </div>
            )}

            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">スケール情報</div>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <div>現在の縮尺: 1px = {pxToMm(1, project.scalePxPerMm).toFixed(1)} mm</div>
                <div>家具 1000mm 幅 = {mmToPx(1000, project.scalePxPerMm).toFixed(1)} px</div>
                <div>表示倍率: {Math.round(viewport.scale * 100)}%</div>
                <div>スナップ: {snapEnabled ? `${snapSizePx}px` : "オフ"}</div>
                <div>検索対象: {objectIndex.length} オブジェクト</div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="button-soft w-full" onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}>
                  表示をリセット
                </button>
                <button
                  className="button-soft w-full"
                  onClick={() => setViewport((current) => ({ ...current, scale: Math.max(0.35, current.scale / 1.2) }))}
                >
                  縮小
                </button>
                <button
                  className="button-soft w-full"
                  onClick={() => setViewport((current) => ({ ...current, scale: Math.min(3, current.scale * 1.2) }))}
                >
                  拡大
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="button-soft w-full" onClick={fitToAll}>
                  全体を表示
                </button>
                <button className="button-soft w-full" onClick={fitToRoom} disabled={!project.room}>
                  部屋に合わせる
                </button>
                <button className="button-soft w-full" onClick={fitToBackground} disabled={!project.background}>
                  背景に合わせる
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="button-soft w-full" onClick={() => fitToSelection()} disabled={!selection}>
                  選択を表示
                </button>
                <button
                  className="button-soft w-full"
                  onClick={() => moveSelectionToCanvasCenter()}
                  disabled={!selection || (selection.type !== "room" && selection.type !== "furniture" && selection.type !== "zone")}
                >
                  中央へ戻す
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">オブジェクト一覧</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                見失ったときはここから選択して、表示範囲へ呼び戻せます。
              </div>
              <input
                className="input mt-3"
                value={objectSearch}
                onChange={(event) => setObjectSearch(event.target.value)}
                placeholder="オブジェクト名で検索"
              />
              {objectSearch ? (
                <button className="mt-2 button-soft w-full" onClick={() => setObjectSearch("")}>
                  検索をクリア
                </button>
              ) : null}
              <div className="mt-3 space-y-4">
                {filteredObjectGroups.length > 0 ? filteredObjectGroups.map((group) => (
                  <div key={group.label}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {group.label} {group.items.length}
                    </div>
                    <div className="max-h-72 space-y-2 overflow-auto pr-1">
                      {group.items.map((item) => (
                        <div
                          key={`${item.type}-${item.id}`}
                          className={`rounded-2xl border bg-white px-3 py-3 ${
                            selection?.type === item.type && selection.id === item.id
                              ? "border-cyan-300 ring-2 ring-cyan-100"
                              : "border-slate-200"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                            <div className="flex flex-wrap justify-end gap-1">
                              {item.issueCount > 0 ? (
                                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                                  警告 {item.issueCount}
                                </span>
                              ) : null}
                              {item.outsideCanvas ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                                  画面外
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              className="button-soft w-full"
                              onClick={() => {
                                const nextSelection = { type: item.type, id: item.id } as SelectionItem;
                                selectSingle(nextSelection);
                                fitToSelection(nextSelection);
                              }}
                            >
                              表示
                            </button>
                            <button
                              className="button-soft w-full"
                              onClick={() => {
                                const nextSelection = { type: item.type, id: item.id } as SelectionItem;
                                selectSingle(nextSelection);
                              }}
                            >
                              選択
                            </button>
                            <button
                              className="button-soft w-full"
                              disabled={!item.canRecenter}
                              onClick={() => {
                                const nextSelection = { type: item.type, id: item.id } as SelectionItem;
                                selectSingle(nextSelection);
                                moveSelectionToCanvasCenter(nextSelection);
                              }}
                            >
                              呼び戻す
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                    条件に合うオブジェクトがありません。
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">警告一覧 ({issues.length})</div>
              <div className="mt-3 space-y-2">
                {issues.length > 0 ? (
                  issues.slice(0, 8).map((issue, index) => (
                    <button
                      key={`${issue.id}-${issue.kind}-${index}`}
                      className="block w-full rounded-2xl border border-rose-200 bg-white px-3 py-3 text-left text-sm text-slate-700 transition hover:border-rose-300 hover:bg-rose-50"
                      onClick={() => selectSingle({ type: issue.type, id: issue.id })}
                    >
                      <div className="font-semibold text-rose-700">{issueKindLabel(issue)}</div>
                      <div className="mt-1">{issue.message}</div>
                      <div className="mt-2 text-xs text-slate-500">クリックで対象を選択します</div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
                    現在は干渉がありません。
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function modeDescription(mode: PlannerMode) {
  switch (mode) {
    case "trace-room":
      return "キャンバス上を点打ちして部屋の輪郭を作ります。3点以上で完了できます。作成後は選択モードで輪郭移動、頂点ドラッグ、辺からの頂点追加ができます。";
    case "add-window":
      return "壁の近くをクリックすると窓を配置します。右のパネルで幅やメモを調整できます。";
    case "add-door":
      return "壁の近くをクリックすると扉を配置します。開き方向も後から変更できます。";
    case "add-zone":
      return "背景上でドラッグして、矩形サイズつきの窓前制約ゾーンを追加できます。";
    case "add-furniture":
      return "背景上でドラッグして、矩形サイズつきの家具を追加できます。";
    case "set-scale":
      return "背景画像上などで2点をクリックし、その実寸を mm で入力して縮尺を決めます。";
    default:
      return "家具のドラッグ移動や各オブジェクトの選択・編集ができます。";
  }
}

function modeDescriptionShort(mode: PlannerMode) {
  switch (mode) {
    case "trace-room":
      return "壁トレース";
    case "add-window":
      return "窓追加";
    case "add-door":
      return "扉追加";
    case "add-zone":
      return "制約ゾーン";
    case "add-furniture":
      return "家具追加";
    case "set-scale":
      return "スケール";
    default:
      return "選択";
  }
}

function issueKindLabel(issue: CollisionIssue) {
  switch (issue.kind) {
    case "furniture-overlap":
      return "家具同士の重なり";
    case "wall-overflow":
      return "壁はみ出し";
    case "door-swing":
      return "扉可動域との干渉";
    case "window-zone":
      return "窓前制約ゾーンとの干渉";
    default:
      return "警告";
  }
}

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function getRoomBounds(project: PlannerProject): Bounds | null {
  if (!project.room || project.room.points.length === 0) return null;
  const xs = project.room.points.map((point) => point.x);
  const ys = project.room.points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function getBackgroundBounds(project: PlannerProject): Bounds | null {
  if (!project.background) return null;
  return {
    minX: 0,
    minY: 0,
    maxX: project.background.width,
    maxY: project.background.height
  };
}

function getAllProjectBounds(project: PlannerProject): Bounds | null {
  const boundsList: Bounds[] = [];
  const backgroundBounds = getBackgroundBounds(project);
  const roomBounds = getRoomBounds(project);
  if (backgroundBounds) boundsList.push(backgroundBounds);
  if (roomBounds) boundsList.push(roomBounds);

  for (const item of buildObjectIndex(project, [])) {
    const bounds = getSelectionBounds(project, { type: item.type, id: item.id });
    if (bounds) boundsList.push(bounds);
  }

  if (boundsList.length === 0) return null;
  return {
    minX: Math.min(...boundsList.map((entry) => entry.minX)),
    minY: Math.min(...boundsList.map((entry) => entry.minY)),
    maxX: Math.max(...boundsList.map((entry) => entry.maxX)),
    maxY: Math.max(...boundsList.map((entry) => entry.maxY))
  };
}

function getSelectionBounds(project: PlannerProject, selection: SelectionItem): Bounds | null {
  switch (selection.type) {
    case "room":
      return getRoomBounds(project);
    case "furniture": {
      const item = project.furniture.find((entry) => entry.id === selection.id);
      if (!item) return null;
      const points = getRotatedRectPoints(item, project.scalePxPerMm);
      return getPointsBounds(points);
    }
    case "zone": {
      const zone = project.zones.find((entry) => entry.id === selection.id);
      if (!zone) return null;
      const rect = getZoneRect(zone, project.scalePxPerMm);
      return {
        minX: rect.x,
        minY: rect.y,
        maxX: rect.x + rect.width,
        maxY: rect.y + rect.height
      };
    }
    case "window": {
      if (!project.room) return null;
      const windowObject = project.windows.find((entry) => entry.id === selection.id);
      if (!windowObject) return null;
      const segment = getWindowSegment(project.room.points, windowObject, project.scalePxPerMm);
      return getPointsBounds([segment.start, segment.end]);
    }
    case "door": {
      if (!project.room) return null;
      const door = project.doors.find((entry) => entry.id === selection.id);
      if (!door) return null;
      const swing = getDoorSwingPolygon(project.room.points, door, project.scalePxPerMm);
      return getPointsBounds([swing.hinge, swing.closedEnd, swing.openEnd]);
    }
    default:
      return null;
  }
}

function getPointsBounds(points: Point[]): Bounds | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function buildObjectIndex(project: PlannerProject, issues: CollisionIssue[]) {
  const items: Array<{
    type: SelectionItem["type"];
    id: string;
    label: string;
    issueCount: number;
    outsideCanvas: boolean;
    canRecenter: boolean;
  }> = [];
  const issueCountById = issues.reduce<Record<string, number>>((accumulator, issue) => {
    accumulator[issue.id] = (accumulator[issue.id] ?? 0) + 1;
    return accumulator;
  }, {});

  const pushItem = (type: SelectionItem["type"], id: string, label: string) => {
    const bounds = getSelectionBounds(project, { type, id });
    items.push({
      type,
      id,
      label,
      issueCount: issueCountById[id] ?? 0,
      outsideCanvas: bounds ? isOutsideCanvas(bounds, project.canvas) : false,
      canRecenter: type === "room" || type === "furniture" || type === "zone"
    });
  };

  if (project.room) {
    pushItem("room", project.room.id, "部屋輪郭");
  }
  for (const item of project.furniture) {
    pushItem("furniture", item.id, `家具: ${item.name}`);
  }
  for (let index = 0; index < project.windows.length; index += 1) {
    pushItem("window", project.windows[index].id, `窓 ${index + 1}`);
  }
  for (let index = 0; index < project.doors.length; index += 1) {
    pushItem("door", project.doors[index].id, `扉 ${index + 1}`);
  }
  for (let index = 0; index < project.zones.length; index += 1) {
    pushItem("zone", project.zones[index].id, `制約ゾーン ${index + 1}`);
  }
  return items;
}

function groupIndexedObjects(
  items: ReturnType<typeof buildObjectIndex>
): Array<{ label: string; items: ReturnType<typeof buildObjectIndex>[number][] }> {
  const labels: Record<SelectionItem["type"], string> = {
    room: "Room",
    furniture: "Furniture",
    window: "Window",
    door: "Door",
    zone: "Zone"
  };

  return (Object.keys(labels) as SelectionItem["type"][])
    .map((type) => ({
      label: labels[type],
      items: items.filter((item) => item.type === type)
    }))
    .filter((group) => group.items.length > 0);
}

function isOutsideCanvas(bounds: Bounds, canvas: PlannerProject["canvas"]) {
  return bounds.maxX < 0 || bounds.maxY < 0 || bounds.minX > canvas.width || bounds.minY > canvas.height;
}

function summarizeIssues(issues: CollisionIssue[]) {
  return issues.reduce(
    (summary, issue) => {
      if (issue.kind === "furniture-overlap") summary.furnitureOverlap += 1;
      if (issue.kind === "wall-overflow") summary.wallOverflow += 1;
      if (issue.kind === "door-swing") summary.doorSwing += 1;
      if (issue.kind === "window-zone") summary.windowZone += 1;
      return summary;
    },
    {
      furnitureOverlap: 0,
      wallOverflow: 0,
      doorSwing: 0,
      windowZone: 0
    }
  );
}

function normalizeRotation(rotation: number) {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
