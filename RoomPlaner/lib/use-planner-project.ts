"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sampleProject } from "@/data/sample-project";
import { observeFirebaseUser } from "@/lib/firebase/auth";
import { detectCollisions } from "@/lib/geometry";
import type { DoorObject, FurnitureKind, FurnitureObject, PlannerProject } from "@/lib/types";

const STORAGE_KEY_BASE = "roomplaner.mpp.v1";
const GUEST_STORAGE_KEY = `${STORAGE_KEY_BASE}.guest`;

function buildStorageKey(userId: string | null) {
  return userId ? `${STORAGE_KEY_BASE}.user.${userId}` : GUEST_STORAGE_KEY;
}

export function usePlannerProject() {
  const [project, setProject] = useState<PlannerProject>(sampleProject);
  const [authResolved, setAuthResolved] = useState(false);
  const [storageKey, setStorageKey] = useState(GUEST_STORAGE_KEY);
  const [undoStack, setUndoStack] = useState<PlannerProject[]>([]);
  const [redoStack, setRedoStack] = useState<PlannerProject[]>([]);
  const projectRef = useRef(project);

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
    const raw = window.localStorage.getItem(storageKey);
    setUndoStack([]);
    setRedoStack([]);

    if (!raw) {
      setProject(sampleProject);
      return;
    }

    try {
      setProject(normalizeProject(JSON.parse(raw) as PlannerProject));
    } catch {
      window.localStorage.removeItem(storageKey);
      setProject(sampleProject);
    }
  }, [authResolved, storageKey]);

  useEffect(() => {
    if (!authResolved) return;
    window.localStorage.setItem(storageKey, JSON.stringify(project));
  }, [authResolved, project, storageKey]);

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
    window.localStorage.removeItem(storageKey);
  };

  return {
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
  };
}

function normalizeProject(project: PlannerProject): PlannerProject {
  return {
    ...project,
    canvas: project.canvas ?? sampleProject.canvas,
    scalePxPerMm: Number.isFinite(project.scalePxPerMm) && project.scalePxPerMm > 0 ? project.scalePxPerMm : sampleProject.scalePxPerMm,
    floorOpacity:
      Number.isFinite(project.floorOpacity) && project.floorOpacity >= 0 && project.floorOpacity <= 1
        ? project.floorOpacity
        : sampleProject.floorOpacity,
    background: project.background ?? null,
    room: project.room ?? null,
    windows: Array.isArray(project.windows) ? project.windows : [],
    zones: Array.isArray(project.zones) ? project.zones : [],
    doors: Array.isArray(project.doors) ? project.doors.map(normalizeDoor) : [],
    furniture: Array.isArray(project.furniture) ? project.furniture.map(normalizeFurniture) : []
  };
}

function normalizeDoor(item: DoorObject): DoorObject {
  return {
    ...item,
    openDirection: item.openDirection ?? "inward"
  };
}

function normalizeFurniture(item: FurnitureObject): FurnitureObject {
  return {
    ...item,
    kind: normalizeFurnitureKind(item.kind)
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
