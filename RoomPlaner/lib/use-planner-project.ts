"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sampleProject } from "@/data/sample-project";
import { observeFirebaseUser } from "@/lib/firebase/auth";
import { detectCollisions } from "@/lib/geometry";
import type { ConstraintZone, DoorObject, FurnitureKind, FurnitureObject, PlannerProject, RoomShape, WindowObject } from "@/lib/types";

const STORAGE_KEY_BASE = "roomplaner.mpp.v1";
const GUEST_STORAGE_KEY = `${STORAGE_KEY_BASE}.guest`;

function buildStorageKey(userId: string | null) {
  return userId ? `${STORAGE_KEY_BASE}.user.${userId}` : GUEST_STORAGE_KEY;
}

export function usePlannerProject() {
  const [project, setProject] = useState<PlannerProject>(sampleProject);
  const [authResolved, setAuthResolved] = useState(false);
  const [storageKey, setStorageKey] = useState(GUEST_STORAGE_KEY);
  const [storageReady, setStorageReady] = useState(false);
  const [storageHasProject, setStorageHasProject] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [undoStack, setUndoStack] = useState<PlannerProject[]>([]);
  const [redoStack, setRedoStack] = useState<PlannerProject[]>([]);
  const projectRef = useRef(project);
  const loadedStorageKeyRef = useRef<string | null>(null);
  const skipInitialSaveForStorageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    return observeFirebaseUser((user) => {
      setStorageKey(buildStorageKey(user?.uid ?? null));
      setAuthResolved(true);
    });
  }, []);

  useEffect(() => {
    if (!authResolved) return;
    setStorageReady(false);
    setStorageError("");
    loadedStorageKeyRef.current = null;
    setUndoStack([]);
    setRedoStack([]);

    try {
      const raw = window.localStorage.getItem(storageKey);

      if (!raw) {
        setStorageHasProject(false);
        setProject(sampleProject);
        return;
      }

      setStorageHasProject(true);
      setProject(normalizeProject(JSON.parse(raw) as PlannerProject));
    } catch (error) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore cleanup failures. The read error is the useful signal for the UI.
      }
      setStorageHasProject(false);
      setProject(sampleProject);
      setStorageError(error instanceof Error ? error.message : "保存済みデータの読み込みに失敗しました。");
    } finally {
      loadedStorageKeyRef.current = storageKey;
      skipInitialSaveForStorageKeyRef.current = storageKey;
      setStorageReady(true);
    }
  }, [authResolved, storageKey]);

  useEffect(() => {
    if (!authResolved || !storageReady || loadedStorageKeyRef.current !== storageKey) return;
    if (skipInitialSaveForStorageKeyRef.current === storageKey) {
      skipInitialSaveForStorageKeyRef.current = null;
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(project));
      setStorageError("");
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? `ブラウザ保存に失敗しました: ${error.message}`
          : "ブラウザ保存に失敗しました。背景画像が大きすぎる可能性があります。"
      );
    }
  }, [authResolved, project, storageKey, storageReady]);

  const issues = useMemo(() => detectCollisions(project), [project]);

  const applyProjectUpdate = (
    updater: (current: PlannerProject) => PlannerProject,
    options?: { recordHistory?: boolean }
  ) => {
    const recordHistory = options?.recordHistory ?? true;
    setProject((current) => {
      const next = updater(current);
      if (recordHistory && next !== current) {
        setUndoStack((history) => [...history.slice(-39), current]);
        setRedoStack([]);
      }
      return next;
    });
  };

  const updateProject = (updater: (current: PlannerProject) => PlannerProject) => {
    applyProjectUpdate(updater, { recordHistory: true });
  };

  const replaceProject = (nextProject: PlannerProject) => {
    const current = projectRef.current;
    setUndoStack((history) => [...history.slice(-39), current]);
    setRedoStack([]);
    setProject(nextProject);
  };

  const importProjectJson = (raw: string) => {
    const parsed = normalizeProject(JSON.parse(raw) as PlannerProject);
    if (!parsed.canvas || !Array.isArray(parsed.furniture) || !("scalePxPerMm" in parsed)) {
      throw new Error("invalid planner project");
    }
    return parsed;
  };

  const exportProjectJson = () => JSON.stringify(project, null, 2);

  const undo = () => {
    setUndoStack((history) => {
      const previous = history[history.length - 1];
      if (!previous) return history;
      setRedoStack((redoHistory) => [...redoHistory, projectRef.current]);
      setProject(previous);
      return history.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((history) => {
      const next = history[history.length - 1];
      if (!next) return history;
      setUndoStack((undoHistory) => [...undoHistory.slice(-39), projectRef.current]);
      setProject(next);
      return history.slice(0, -1);
    });
  };

  const clearPersistedProject = () => {
    try {
      window.localStorage.removeItem(storageKey);
      setStorageError("");
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "ブラウザ保存データの削除に失敗しました。");
    }
  };

  return {
    project,
    issues,
    undoStack,
    redoStack,
    storageReady,
    storageHasProject,
    storageError,
    updateProject,
    applyProjectUpdate,
    replaceProject,
    importProjectJson,
    exportProjectJson,
    undo,
    redo,
    clearPersistedProject
  };
}

function normalizeProject(project: PlannerProject): PlannerProject {
  const room = normalizeRoom(project.room);

  return {
    ...project,
    canvas: project.canvas ?? sampleProject.canvas,
    scalePxPerMm: Number.isFinite(project.scalePxPerMm) && project.scalePxPerMm > 0 ? project.scalePxPerMm : sampleProject.scalePxPerMm,
    floorOpacity:
      Number.isFinite(project.floorOpacity) && project.floorOpacity >= 0 && project.floorOpacity <= 1
        ? project.floorOpacity
        : sampleProject.floorOpacity,
    background: project.background ?? null,
    room,
    windows: Array.isArray(project.windows) ? project.windows.map((item) => normalizeWindow(item, room)).filter(isWindowObject) : [],
    zones: Array.isArray(project.zones) ? project.zones.map(normalizeZone) : [],
    doors: Array.isArray(project.doors) ? project.doors.map((item) => normalizeDoor(item, room)).filter(isDoorObject) : [],
    furniture: Array.isArray(project.furniture) ? project.furniture.map(normalizeFurniture) : []
  };
}

function normalizeRoom(room: PlannerProject["room"]): RoomShape | null {
  if (!room || !Array.isArray(room.points) || room.points.length < 3) {
    return null;
  }

  const points = room.points
    .map((point) => ({
      x: finiteNumber(point.x),
      y: finiteNumber(point.y)
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  return points.length >= 3 ? { ...room, points } : null;
}

function normalizeWindow(item: WindowObject, room: RoomShape | null): WindowObject | null {
  if (!room || room.points.length < 3) {
    return null;
  }

  return {
    ...item,
    wallIndex: normalizeWallIndex(item.wallIndex, room),
    offset: finiteNumber(item.offset),
    widthMm: positiveNumber(item.widthMm, 800),
    note: item.note ?? ""
  };
}

function normalizeDoor(item: DoorObject, room: RoomShape | null): DoorObject | null {
  if (!room || room.points.length < 3) {
    return null;
  }

  return {
    ...item,
    wallIndex: normalizeWallIndex(item.wallIndex, room),
    offset: finiteNumber(item.offset),
    widthMm: positiveNumber(item.widthMm, 800),
    swing: item.swing === "clockwise" ? "clockwise" : "counterclockwise",
    openDirection: item.openDirection === "outward" ? "outward" : "inward",
    note: item.note ?? ""
  };
}

function normalizeZone(item: ConstraintZone): ConstraintZone {
  return {
    ...item,
    x: finiteNumber(item.x),
    y: finiteNumber(item.y),
    widthMm: positiveNumber(item.widthMm, 200),
    depthMm: positiveNumber(item.depthMm, 200),
    note: item.note ?? ""
  };
}

function normalizeFurniture(item: FurnitureObject): FurnitureObject {
  return {
    ...item,
    name: item.name || "家具",
    kind: normalizeFurnitureKind(item.kind),
    x: finiteNumber(item.x),
    y: finiteNumber(item.y),
    widthMm: positiveNumber(item.widthMm, 200),
    depthMm: positiveNumber(item.depthMm, 200),
    rotation: finiteNumber(item.rotation)
  };
}

function normalizeFurnitureKind(kind: FurnitureObject["kind"] | undefined): FurnitureKind {
  const allowedKinds: FurnitureKind[] = [
    "generic",
    "bed",
    "desk",
    "table",
    "chair",
    "sofa",
    "wardrobe",
    "cabinet",
    "shelf",
    "appliance",
    "rug",
    "plant"
  ];

  return allowedKinds.includes(kind ?? "generic") ? (kind ?? "generic") : "generic";
}

function normalizeWallIndex(value: number, room: RoomShape) {
  const maxIndex = Math.max(0, room.points.length - 1);
  return Math.min(maxIndex, Math.max(0, Math.trunc(finiteNumber(value))));
}

function finiteNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isWindowObject(value: WindowObject | null): value is WindowObject {
  return value !== null;
}

function isDoorObject(value: DoorObject | null): value is DoorObject {
  return value !== null;
}
