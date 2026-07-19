import { parsePlannerProject } from "@/lib/project-schema";
import type { PlannerWorkspaceSnapshot } from "@/lib/planner-workspace-storage";

export const CLOUD_WORKSPACE_SCHEMA_VERSION = 3;

export type ParsedCloudWorkspace = {
  schemaVersion: number;
  updatedAtMs: number;
  workspace: PlannerWorkspaceSnapshot;
  migratedLegacy: boolean;
};

export function buildCloudWorkspace(snapshot: PlannerWorkspaceSnapshot) {
  const projects = snapshot.projects.map((project) => ({
    ...parsePlannerProject(project),
    background: null
  }));
  if (projects.length === 0) {
    throw new Error("保存するプロジェクトがありません。");
  }

  const activeProjectId = projects.some((project) => project.id === snapshot.activeProjectId)
    ? snapshot.activeProjectId
    : projects[0].id;

  return {
    workspace: { activeProjectId, projects },
    legacyProject: projects.find((project) => project.id === activeProjectId) ?? projects[0],
    backgroundsOmitted: snapshot.projects.filter((project) => project.background !== null).length
  };
}

export function parseCloudWorkspaceRecord(value: unknown): ParsedCloudWorkspace | null {
  const record = asRecord(value);
  if (!record) return null;

  const schemaVersion = finiteNumber(record.schemaVersion, 1);
  const updatedAtMs = finiteNumber(record.updatedAtMs, 0);
  const workspaceRecord = asRecord(record.workspace);
  if (workspaceRecord && Array.isArray(workspaceRecord.projects)) {
    const projects = parseUniqueProjects(workspaceRecord.projects);
    if (projects.length === 0) return null;
    const requestedActiveId = typeof workspaceRecord.activeProjectId === "string"
      ? workspaceRecord.activeProjectId
      : "";
    return {
      schemaVersion,
      updatedAtMs,
      migratedLegacy: false,
      workspace: {
        activeProjectId: projects.some((project) => project.id === requestedActiveId)
          ? requestedActiveId
          : projects[0].id,
        projects
      }
    };
  }

  if (!("project" in record) || record.project === null || record.project === undefined) {
    return null;
  }
  const project = parsePlannerProject(record.project);
  return {
    schemaVersion,
    updatedAtMs,
    migratedLegacy: true,
    workspace: {
      activeProjectId: project.id,
      projects: [project]
    }
  };
}

function parseUniqueProjects(values: unknown[]) {
  const ids = new Set<string>();
  return values.map((value) => {
    const project = parsePlannerProject(value);
    if (ids.has(project.id)) {
      throw new Error("クラウドのプロジェクトIDが重複しています。");
    }
    ids.add(project.id);
    return project;
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
