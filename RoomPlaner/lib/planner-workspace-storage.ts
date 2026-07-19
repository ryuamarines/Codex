import { sampleProject } from "@/data/sample-project";
import { createId } from "@/lib/geometry";
import { clonePlannerProject, parsePlannerProject, parsePlannerProjectJson, PLANNER_PROJECT_SCHEMA_VERSION } from "@/lib/project-schema";
import type { PlannerProject } from "@/lib/types";

const STORAGE_NAMESPACE = "roomplaner.workspace.v2";
const LEGACY_STORAGE_KEY_BASE = "roomplaner.mpp.v1";
const WORKSPACE_SCHEMA_VERSION = 2;

export type PlannerStorageScope = `user.${string}` | "guest";

export type PlannerProjectSummary = {
  id: string;
  name: string;
  updatedAtMs: number;
};

export type PlannerWorkspaceIndex = {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  activeProjectId: string;
  updatedAtMs: number;
  contentRevision: number;
  importedGuestRevision: number;
  projects: PlannerProjectSummary[];
};

export type LoadedPlannerWorkspace = {
  index: PlannerWorkspaceIndex;
  activeProject: PlannerProject;
  projects: PlannerProject[];
  persisted: boolean;
  migratedLegacy: boolean;
  errors: string[];
};

export function buildPlannerStorageScope(userId: string | null): PlannerStorageScope {
  return userId ? `user.${userId}` : "guest";
}

export function createEmptyPlannerProject(name = "新規プロジェクト"): PlannerProject {
  return {
    ...clonePlannerProject(sampleProject),
    id: createId("project"),
    name,
    background: null,
    room: null,
    windows: [],
    zones: [],
    doors: [],
    furniture: [],
    scalePxPerMm: 0.1
  };
}

export function loadPlannerWorkspace(storage: Storage, scope: PlannerStorageScope): LoadedPlannerWorkspace {
  const rawIndex = storage.getItem(indexKey(scope));
  if (!rawIndex) {
    return migrateLegacyWorkspace(storage, scope);
  }

  try {
    const index = parseWorkspaceIndex(JSON.parse(rawIndex) as unknown);
    const errors: string[] = [];
    const projects = index.projects.flatMap((summary) => {
      try {
        const project = readProject(storage, scope, summary.id);
        if (!project) throw new Error("プロジェクト本体が見つかりません。");
        return [{ ...project, id: summary.id }];
      } catch (error) {
        errors.push(`${summary.name}: ${errorMessage(error)}`);
        return [];
      }
    });

    if (projects.length === 0) {
      throw new Error("保存済みプロジェクトを読み込めませんでした。元データは保持しています。");
    }

    const summaries = projects.map((project) => {
      const stored = index.projects.find((entry) => entry.id === project.id);
      return {
        id: project.id,
        name: project.name,
        updatedAtMs: stored?.updatedAtMs ?? index.updatedAtMs
      };
    });
    const activeProject = projects.find((project) => project.id === index.activeProjectId) ?? projects[0];

    return {
      index: { ...index, activeProjectId: activeProject.id, projects: summaries },
      activeProject,
      projects,
      persisted: true,
      migratedLegacy: false,
      errors
    };
  } catch (error) {
    preserveCorruptIndex(storage, scope, rawIndex);
    const fallback = createDefaultWorkspace();
    return {
      ...fallback,
      persisted: true,
      errors: [errorMessage(error)]
    };
  }
}

export function persistPlannerProject(
  storage: Storage,
  scope: PlannerStorageScope,
  index: PlannerWorkspaceIndex,
  project: PlannerProject,
  options?: { active?: boolean; updatedAtMs?: number }
) {
  const parsed = parsePlannerProject(project);
  const updatedAtMs = options?.updatedAtMs ?? Date.now();
  const summary: PlannerProjectSummary = { id: parsed.id, name: parsed.name, updatedAtMs };
  const nextProjects = index.projects.some((entry) => entry.id === parsed.id)
    ? index.projects.map((entry) => (entry.id === parsed.id ? summary : entry))
    : [...index.projects, summary];
  const nextIndex: PlannerWorkspaceIndex = {
    ...index,
    activeProjectId: options?.active === false ? index.activeProjectId : parsed.id,
    updatedAtMs,
    contentRevision: updatedAtMs,
    projects: nextProjects
  };

  writeProject(storage, scope, parsed, updatedAtMs);
  writeIndex(storage, scope, nextIndex);
  return nextIndex;
}

export function setActivePlannerProject(storage: Storage, scope: PlannerStorageScope, index: PlannerWorkspaceIndex, projectId: string) {
  if (!index.projects.some((entry) => entry.id === projectId)) {
    throw new Error("切り替え先のプロジェクトが見つかりません。");
  }
  const nextIndex = { ...index, activeProjectId: projectId, updatedAtMs: Date.now() };
  writeIndex(storage, scope, nextIndex);
  return nextIndex;
}

export function removePlannerProject(storage: Storage, scope: PlannerStorageScope, index: PlannerWorkspaceIndex, projectId: string) {
  const projects = index.projects.filter((entry) => entry.id !== projectId);
  const updatedAtMs = Date.now();
  const nextIndex = {
    ...index,
    projects,
    activeProjectId: index.activeProjectId === projectId ? projects[0]?.id ?? "" : index.activeProjectId,
    updatedAtMs,
    contentRevision: updatedAtMs
  };
  writeIndex(storage, scope, nextIndex);
  storage.removeItem(projectKey(scope, projectId));
  return nextIndex;
}

export function readPlannerProject(storage: Storage, scope: PlannerStorageScope, projectId: string) {
  const project = readProject(storage, scope, projectId);
  if (!project) throw new Error("保存済みプロジェクトが見つかりません。");
  return { ...project, id: projectId };
}

export function importGuestWorkspace(
  storage: Storage,
  targetScope: PlannerStorageScope,
  targetIndex: PlannerWorkspaceIndex
) {
  const guest = loadPlannerWorkspace(storage, "guest");
  const guestProjects = meaningfulGuestProjects(guest.projects);
  if (!guest.persisted || guestProjects.length === 0) {
    return { index: targetIndex, importedProjects: [] as PlannerProject[] };
  }

  let nextIndex = targetIndex;
  const importedProjects = guestProjects.map((source) => ({
    ...clonePlannerProject(source),
    id: createId("project"),
    name: `${source.name}（ゲストから）`
  }));

  for (const project of importedProjects) {
    nextIndex = persistPlannerProject(storage, targetScope, nextIndex, project, { active: false });
  }

  nextIndex = {
    ...nextIndex,
    activeProjectId: importedProjects[0]?.id ?? nextIndex.activeProjectId,
    importedGuestRevision: guest.index.contentRevision,
    updatedAtMs: Date.now()
  };
  writeIndex(storage, targetScope, nextIndex);
  return { index: nextIndex, importedProjects };
}

export function inspectGuestWorkspace(storage: Storage, importedGuestRevision: number) {
  const guest = loadPlannerWorkspace(storage, "guest");
  const projects = meaningfulGuestProjects(guest.projects);
  return {
    available: guest.persisted && projects.length > 0 && guest.index.contentRevision > importedGuestRevision,
    count: projects.length,
    revision: guest.index.contentRevision
  };
}

function migrateLegacyWorkspace(storage: Storage, scope: PlannerStorageScope): LoadedPlannerWorkspace {
  const rawLegacy = storage.getItem(legacyKey(scope));
  if (!rawLegacy) return createDefaultWorkspace();

  try {
    const project = parsePlannerProjectJson(rawLegacy);
    const now = Date.now();
    const index = createIndex(project, now);
    writeProject(storage, scope, project, now);
    writeIndex(storage, scope, index);
    return {
      index,
      activeProject: project,
      projects: [project],
      persisted: true,
      migratedLegacy: true,
      errors: []
    };
  } catch (error) {
    const fallback = createDefaultWorkspace();
    return {
      ...fallback,
      persisted: true,
      errors: [`旧保存データ: ${errorMessage(error)}`]
    };
  }
}

function createDefaultWorkspace(): LoadedPlannerWorkspace {
  const project = clonePlannerProject(sampleProject);
  const now = Date.now();
  return {
    index: createIndex(project, now),
    activeProject: project,
    projects: [project],
    persisted: false,
    migratedLegacy: false,
    errors: []
  };
}

function createIndex(project: PlannerProject, updatedAtMs: number): PlannerWorkspaceIndex {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeProjectId: project.id,
    updatedAtMs,
    contentRevision: updatedAtMs,
    importedGuestRevision: 0,
    projects: [{ id: project.id, name: project.name, updatedAtMs }]
  };
}

function parseWorkspaceIndex(value: unknown): PlannerWorkspaceIndex {
  const record = asRecord(value);
  if (!record || record.schemaVersion !== WORKSPACE_SCHEMA_VERSION || !Array.isArray(record.projects)) {
    throw new Error("プロジェクト一覧の保存形式が壊れています。");
  }

  const projectIds = new Set<string>();
  const projects = record.projects.flatMap((item) => {
    const summary = asRecord(item);
    if (!summary || typeof summary.id !== "string" || !summary.id || projectIds.has(summary.id)) return [];
    projectIds.add(summary.id);
    return [{
      id: summary.id,
      name: typeof summary.name === "string" && summary.name ? summary.name : "名称未設定",
      updatedAtMs: finiteTimestamp(summary.updatedAtMs)
    }];
  });
  if (projects.length === 0) throw new Error("プロジェクト一覧が空です。");

  const activeProjectId = typeof record.activeProjectId === "string" ? record.activeProjectId : projects[0].id;
  const updatedAtMs = finiteTimestamp(record.updatedAtMs);
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeProjectId,
    updatedAtMs,
    contentRevision: finiteTimestamp(record.contentRevision, updatedAtMs),
    importedGuestRevision: finiteTimestamp(record.importedGuestRevision, 0),
    projects
  };
}

function readProject(storage: Storage, scope: PlannerStorageScope, projectId: string) {
  const raw = storage.getItem(projectKey(scope, projectId));
  if (!raw) return null;
  const envelope = asRecord(JSON.parse(raw) as unknown);
  if (!envelope || envelope.schemaVersion !== PLANNER_PROJECT_SCHEMA_VERSION || !("project" in envelope)) {
    throw new Error("プロジェクトの保存形式が壊れています。");
  }
  return parsePlannerProject(envelope.project);
}

function writeProject(storage: Storage, scope: PlannerStorageScope, project: PlannerProject, updatedAtMs: number) {
  storage.setItem(projectKey(scope, project.id), JSON.stringify({
    schemaVersion: PLANNER_PROJECT_SCHEMA_VERSION,
    updatedAtMs,
    project
  }));
}

function writeIndex(storage: Storage, scope: PlannerStorageScope, index: PlannerWorkspaceIndex) {
  storage.setItem(indexKey(scope), JSON.stringify(index));
}

function preserveCorruptIndex(storage: Storage, scope: PlannerStorageScope, rawIndex: string) {
  const recoveryKey = `${indexKey(scope)}.recovery`;
  try {
    storage.setItem(recoveryKey, rawIndex);
  } catch {
    // The original key is still untouched when a recovery copy cannot be written.
  }
}

function meaningfulGuestProjects(projects: PlannerProject[]) {
  const sample = JSON.stringify(sampleProject);
  return projects.filter((project) => JSON.stringify(project) !== sample);
}

function indexKey(scope: PlannerStorageScope) {
  return `${STORAGE_NAMESPACE}.${scope}`;
}

function projectKey(scope: PlannerStorageScope, projectId: string) {
  return `${STORAGE_NAMESPACE}.${scope}.project.${encodeURIComponent(projectId)}`;
}

function legacyKey(scope: PlannerStorageScope) {
  return scope === "guest" ? `${LEGACY_STORAGE_KEY_BASE}.guest` : `${LEGACY_STORAGE_KEY_BASE}.${scope}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteTimestamp(value: unknown, fallback = Date.now()) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "保存データを読み込めませんでした。";
}
