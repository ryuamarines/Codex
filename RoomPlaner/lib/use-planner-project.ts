"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sampleProject } from "@/data/sample-project";
import { detectCollisions } from "@/lib/geometry";
import {
  buildPlannerStorageScope,
  createEmptyPlannerProject,
  importGuestWorkspace,
  inspectGuestWorkspace,
  loadPlannerWorkspace,
  persistPlannerProject,
  readPlannerProject,
  readPlannerWorkspaceSnapshot,
  removePlannerProject,
  replacePlannerWorkspace,
  setActivePlannerProject,
  type PlannerProjectSummary,
  type PlannerStorageScope,
  type PlannerWorkspaceIndex,
  type PlannerWorkspaceSnapshot
} from "@/lib/planner-workspace-storage";
import { clonePlannerProject, parsePlannerProject, parsePlannerProjectJson } from "@/lib/project-schema";
import type { PlannerProject } from "@/lib/types";

type UsePlannerProjectParams = {
  authResolved: boolean;
  userId: string | null;
};

type GuestTransferState = {
  available: boolean;
  count: number;
};

export type PlannerStorageStatus = "loading" | "ready" | "saving" | "saved" | "error";

const EMPTY_GUEST_TRANSFER: GuestTransferState = { available: false, count: 0 };

export function usePlannerProject({ authResolved, userId }: UsePlannerProjectParams) {
  const expectedScope = buildPlannerStorageScope(userId);
  const [project, setProject] = useState<PlannerProject>(sampleProject);
  const [workspaceIndex, setWorkspaceIndex] = useState<PlannerWorkspaceIndex | null>(null);
  const [loadedScope, setLoadedScope] = useState<PlannerStorageScope | null>(null);
  const [storageHasProject, setStorageHasProject] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [storageStatus, setStorageStatus] = useState<PlannerStorageStatus>("loading");
  const [guestTransfer, setGuestTransfer] = useState<GuestTransferState>(EMPTY_GUEST_TRANSFER);
  const [undoStack, setUndoStack] = useState<PlannerProject[]>([]);
  const [redoStack, setRedoStack] = useState<PlannerProject[]>([]);
  const projectRef = useRef(project);
  const persistedProjectRef = useRef<PlannerProject | null>(null);
  const indexRef = useRef<PlannerWorkspaceIndex | null>(null);
  const scopeRef = useRef<PlannerStorageScope | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const skipInitialSaveScopeRef = useRef<PlannerStorageScope | null>(null);
  const interactionBaseRef = useRef<PlannerProject | null>(null);
  const storageReady = authResolved && loadedScope === expectedScope && workspaceIndex !== null;

  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const applyIndex = useCallback((index: PlannerWorkspaceIndex) => {
    indexRef.current = index;
    setWorkspaceIndex(index);
  }, []);

  const applyActiveProject = useCallback((nextProject: PlannerProject) => {
    interactionBaseRef.current = null;
    projectRef.current = nextProject;
    setProject(nextProject);
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  useEffect(() => {
    if (!authResolved) return;

    const transitionErrors: string[] = [];
    const previousScope = scopeRef.current;
    const previousIndex = indexRef.current;
    if (
      previousScope
      && previousIndex
      && previousScope !== expectedScope
      && persistedProjectRef.current !== projectRef.current
    ) {
      try {
        const current = { ...projectRef.current, id: previousIndex.activeProjectId };
        indexRef.current = persistPlannerProject(window.localStorage, previousScope, previousIndex, current);
        persistedProjectRef.current = projectRef.current;
      } catch (error) {
        transitionErrors.push(`保存先の切替前に編集中データを保存できませんでした: ${errorMessage(error)}`);
      }
    }

    cancelPendingSave();
    interactionBaseRef.current = null;
    setStorageNotice("");
    setStorageStatus("loading");
    setLoadedScope(null);
    setWorkspaceIndex(null);
    setGuestTransfer(EMPTY_GUEST_TRANSFER);

    try {
      const loaded = loadPlannerWorkspace(window.localStorage, expectedScope);
      scopeRef.current = expectedScope;
      indexRef.current = loaded.index;
      projectRef.current = loaded.activeProject;
      persistedProjectRef.current = loaded.activeProject;
      skipInitialSaveScopeRef.current = expectedScope;
      setWorkspaceIndex(loaded.index);
      setProject(loaded.activeProject);
      setStorageHasProject(loaded.persisted);
      setStorageStatus(loaded.errors.length > 0 ? "error" : loaded.persisted ? "saved" : "ready");
      setUndoStack([]);
      setRedoStack([]);
      setLoadedScope(expectedScope);

      if (loaded.migratedLegacy) {
        setStorageNotice("旧形式のブラウザ保存を新しい複数プロジェクト形式へ移行しました。旧データも残しています。");
      }
      setStorageError([...transitionErrors, ...loaded.errors].join("\n"));

      if (userId) {
        const guest = inspectGuestWorkspace(window.localStorage, loaded.index.importedGuestRevision);
        setGuestTransfer({ available: guest.available, count: guest.count });
      }
    } catch (error) {
      scopeRef.current = expectedScope;
      const fallback = createEmptyPlannerProject("復旧用プロジェクト");
      const now = Date.now();
      const fallbackIndex: PlannerWorkspaceIndex = {
        schemaVersion: 2,
        activeProjectId: fallback.id,
        updatedAtMs: now,
        contentRevision: now,
        importedGuestRevision: 0,
        projects: [{ id: fallback.id, name: fallback.name, updatedAtMs: now }]
      };
      indexRef.current = fallbackIndex;
      projectRef.current = fallback;
      persistedProjectRef.current = fallback;
      skipInitialSaveScopeRef.current = expectedScope;
      setWorkspaceIndex(fallbackIndex);
      setProject(fallback);
      setStorageHasProject(false);
      setStorageStatus("error");
      setLoadedScope(expectedScope);
      setStorageError([...transitionErrors, errorMessage(error)].join("\n"));
    }
  }, [authResolved, cancelPendingSave, expectedScope, userId]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (!storageReady || !indexRef.current || loadedScope !== expectedScope) return;
    if (skipInitialSaveScopeRef.current === loadedScope) {
      skipInitialSaveScopeRef.current = null;
      return;
    }
    if (persistedProjectRef.current === projectRef.current) return;

    cancelPendingSave();
    saveTimerRef.current = window.setTimeout(() => {
      const scope = scopeRef.current;
      const index = indexRef.current;
      if (!scope || scope !== expectedScope || !index) return;

      try {
        const nextProject = { ...projectRef.current, id: index.activeProjectId };
        const nextIndex = persistPlannerProject(window.localStorage, scope, index, nextProject);
        persistedProjectRef.current = projectRef.current;
        applyIndex(nextIndex);
        setStorageHasProject(true);
        setStorageStatus("saved");
        setStorageError("");
      } catch (error) {
        setStorageStatus("error");
        setStorageError(`ブラウザ保存に失敗しました: ${errorMessage(error)}`);
      } finally {
        saveTimerRef.current = null;
      }
    }, 300);

    return cancelPendingSave;
  }, [applyIndex, cancelPendingSave, expectedScope, loadedScope, project, storageReady]);

  useEffect(() => cancelPendingSave, [cancelPendingSave]);

  const issues = useMemo(() => detectCollisions(project), [project]);

  const flushCurrentProject = useCallback((options?: { force?: boolean }) => {
    cancelPendingSave();
    const scope = scopeRef.current;
    const index = indexRef.current;
    if (!scope || !index) return index;
    if (!options?.force && persistedProjectRef.current === projectRef.current) return index;

    try {
      const current = { ...projectRef.current, id: index.activeProjectId };
      const nextIndex = persistPlannerProject(window.localStorage, scope, index, current);
      persistedProjectRef.current = projectRef.current;
      applyIndex(nextIndex);
      setStorageHasProject(true);
      setStorageStatus("saved");
      setStorageError("");
      return nextIndex;
    } catch (error) {
      setStorageStatus("error");
      setStorageError(`ブラウザ保存に失敗しました: ${errorMessage(error)}`);
      return null;
    }
  }, [applyIndex, cancelPendingSave]);

  useEffect(() => {
    const flushBeforeLeaving = () => {
      flushCurrentProject();
    };
    window.addEventListener("pagehide", flushBeforeLeaving);
    return () => window.removeEventListener("pagehide", flushBeforeLeaving);
  }, [flushCurrentProject]);

  const applyProjectUpdate = useCallback((
    updater: (current: PlannerProject) => PlannerProject,
    options?: { recordHistory?: boolean }
  ) => {
    const current = projectRef.current;
    const next = updater(current);
    if (next === current) return;

    const recordHistory = (options?.recordHistory ?? true) && interactionBaseRef.current === null;
    projectRef.current = next;
    setStorageStatus("saving");
    if (recordHistory) {
      setUndoStack((history) => [...history.slice(-39), current]);
      setRedoStack([]);
    }
    setProject(next);
  }, []);

  const beginProjectInteraction = useCallback(() => {
    interactionBaseRef.current ??= projectRef.current;
  }, []);

  const commitProjectInteraction = useCallback(() => {
    const base = interactionBaseRef.current;
    interactionBaseRef.current = null;
    if (!base || base === projectRef.current) return;
    setUndoStack((history) => [...history.slice(-39), base]);
    setRedoStack([]);
    setStorageStatus("saving");
  }, []);

  const updateProject = useCallback((updater: (current: PlannerProject) => PlannerProject) => {
    applyProjectUpdate(updater, { recordHistory: true });
  }, [applyProjectUpdate]);

  const replaceProject = useCallback((nextProject: PlannerProject) => {
    const index = indexRef.current;
    const normalized = parsePlannerProject({
      ...nextProject,
      id: index?.activeProjectId ?? nextProject.id
    });
    const current = projectRef.current;
    interactionBaseRef.current = null;
    setUndoStack((history) => [...history.slice(-39), current]);
    setRedoStack([]);
    projectRef.current = normalized;
    setStorageStatus("saving");
    setProject(normalized);
  }, []);

  const getWorkspaceSnapshot = useCallback(() => {
    const scope = scopeRef.current;
    const currentIndex = flushCurrentProject({ force: true });
    if (!scope || !currentIndex) return null;
    try {
      return readPlannerWorkspaceSnapshot(window.localStorage, scope, currentIndex);
    } catch (error) {
      setStorageStatus("error");
      setStorageError(`プロジェクト一覧を準備できませんでした: ${errorMessage(error)}`);
      return null;
    }
  }, [flushCurrentProject]);

  const hydrateWorkspace = useCallback((snapshot: PlannerWorkspaceSnapshot) => {
    const scope = scopeRef.current;
    const currentIndex = indexRef.current;
    if (!scope || !currentIndex) return false;

    cancelPendingSave();
    interactionBaseRef.current = null;
    try {
      const hydrated = replacePlannerWorkspace(window.localStorage, scope, snapshot, {
        importedGuestRevision: currentIndex.importedGuestRevision,
        preserveLocalBackgrounds: true
      });
      applyIndex(hydrated.index);
      skipInitialSaveScopeRef.current = scope;
      persistedProjectRef.current = hydrated.activeProject;
      applyActiveProject(hydrated.activeProject);
      setStorageHasProject(true);
      setStorageStatus("saved");
      setStorageError("");
      return true;
    } catch (error) {
      setStorageStatus("error");
      setStorageError(`クラウドのプロジェクト一覧を保存できませんでした: ${errorMessage(error)}`);
      return false;
    }
  }, [applyActiveProject, applyIndex, cancelPendingSave]);

  const switchProject = useCallback((projectId: string) => {
    const scope = scopeRef.current;
    const currentIndex = flushCurrentProject();
    if (!scope || !currentIndex || projectId === currentIndex.activeProjectId) return;

    try {
      const nextProject = readPlannerProject(window.localStorage, scope, projectId);
      const nextIndex = setActivePlannerProject(window.localStorage, scope, currentIndex, projectId);
      applyIndex(nextIndex);
      skipInitialSaveScopeRef.current = scope;
      persistedProjectRef.current = nextProject;
      applyActiveProject(nextProject);
      setStorageStatus("saved");
      setStorageNotice("");
      setStorageError("");
    } catch (error) {
      setStorageStatus("error");
      setStorageError(errorMessage(error));
    }
  }, [applyActiveProject, applyIndex, flushCurrentProject]);

  const createProject = useCallback(() => {
    const scope = scopeRef.current;
    const currentIndex = flushCurrentProject({ force: true });
    if (!scope || !currentIndex) return;
    const nextProject = createEmptyPlannerProject();

    try {
      const nextIndex = persistPlannerProject(window.localStorage, scope, currentIndex, nextProject);
      applyIndex(nextIndex);
      skipInitialSaveScopeRef.current = scope;
      persistedProjectRef.current = nextProject;
      applyActiveProject(nextProject);
      setStorageHasProject(true);
      setStorageStatus("saved");
      setStorageNotice("新しいプロジェクトを作成しました。以前のプロジェクトも一覧に残っています。");
      setStorageError("");
    } catch (error) {
      setStorageStatus("error");
      setStorageError(errorMessage(error));
    }
  }, [applyActiveProject, applyIndex, flushCurrentProject]);

  const duplicateProject = useCallback(() => {
    const scope = scopeRef.current;
    const currentIndex = flushCurrentProject({ force: true });
    if (!scope || !currentIndex) return;
    const duplicate = {
      ...clonePlannerProject(projectRef.current),
      id: createEmptyPlannerProject().id,
      name: `${projectRef.current.name} のコピー`
    };

    try {
      const nextIndex = persistPlannerProject(window.localStorage, scope, currentIndex, duplicate);
      applyIndex(nextIndex);
      skipInitialSaveScopeRef.current = scope;
      persistedProjectRef.current = duplicate;
      applyActiveProject(duplicate);
      setStorageStatus("saved");
      setStorageNotice("現在のプロジェクトを複製しました。");
      setStorageError("");
    } catch (error) {
      setStorageStatus("error");
      setStorageError(errorMessage(error));
    }
  }, [applyActiveProject, applyIndex, flushCurrentProject]);

  const deleteProject = useCallback(() => {
    const scope = scopeRef.current;
    let currentIndex = flushCurrentProject({ force: true });
    if (!scope || !currentIndex) return;
    const deletingId = currentIndex.activeProjectId;

    try {
      if (currentIndex.projects.length === 1) {
        const replacement = createEmptyPlannerProject();
        currentIndex = persistPlannerProject(window.localStorage, scope, currentIndex, replacement);
      }
      const nextIndex = removePlannerProject(window.localStorage, scope, currentIndex, deletingId);
      const nextProject = readPlannerProject(window.localStorage, scope, nextIndex.activeProjectId);
      applyIndex(nextIndex);
      skipInitialSaveScopeRef.current = scope;
      persistedProjectRef.current = nextProject;
      applyActiveProject(nextProject);
      setStorageHasProject(true);
      setStorageStatus("saved");
      setStorageNotice("プロジェクトを削除しました。");
      setStorageError("");
    } catch (error) {
      setStorageStatus("error");
      setStorageError(errorMessage(error));
    }
  }, [applyActiveProject, applyIndex, flushCurrentProject]);

  const importGuestProjects = useCallback(() => {
    const scope = scopeRef.current;
    const currentIndex = flushCurrentProject({ force: true });
    if (!scope || scope === "guest" || !currentIndex) return;

    try {
      const result = importGuestWorkspace(window.localStorage, scope, currentIndex);
      if (result.importedProjects.length === 0) {
        setGuestTransfer(EMPTY_GUEST_TRANSFER);
        setStorageNotice("引き継げるゲストプロジェクトはありませんでした。");
        return;
      }
      const nextProject = result.importedProjects[0];
      applyIndex(result.index);
      skipInitialSaveScopeRef.current = scope;
      persistedProjectRef.current = nextProject;
      applyActiveProject(nextProject);
      setStorageHasProject(true);
      setStorageStatus("saved");
      setGuestTransfer(EMPTY_GUEST_TRANSFER);
      setStorageNotice(`${result.importedProjects.length}件のゲストプロジェクトをコピーしました。ゲスト側のデータも残しています。`);
      setStorageError("");
    } catch (error) {
      setStorageStatus("error");
      setStorageError(errorMessage(error));
    }
  }, [applyActiveProject, applyIndex, flushCurrentProject]);

  const importProjectJson = useCallback((raw: string) => parsePlannerProjectJson(raw), []);

  const undo = useCallback(() => {
    interactionBaseRef.current = null;
    setUndoStack((history) => {
      const previous = history[history.length - 1];
      if (!previous) return history;
      setRedoStack((redoHistory) => [...redoHistory, projectRef.current]);
      projectRef.current = previous;
      setStorageStatus("saving");
      setProject(previous);
      return history.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    interactionBaseRef.current = null;
    setRedoStack((history) => {
      const next = history[history.length - 1];
      if (!next) return history;
      setUndoStack((undoHistory) => [...undoHistory.slice(-39), projectRef.current]);
      projectRef.current = next;
      setStorageStatus("saving");
      setProject(next);
      return history.slice(0, -1);
    });
  }, []);

  return {
    project,
    projects: workspaceIndex?.projects ?? ([] as PlannerProjectSummary[]),
    activeProjectId: workspaceIndex?.activeProjectId ?? project.id,
    issues,
    undoStack,
    redoStack,
    storageReady,
    storageScope: loadedScope,
    storageHasProject,
    storageError,
    storageNotice,
    storageStatus,
    guestTransfer,
    updateProject,
    applyProjectUpdate,
    beginProjectInteraction,
    commitProjectInteraction,
    replaceProject,
    hydrateWorkspace,
    getWorkspaceSnapshot,
    importProjectJson,
    undo,
    redo,
    switchProject,
    createProject,
    duplicateProject,
    deleteProject,
    importGuestProjects,
    flushCurrentProject
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "保存操作に失敗しました。";
}
