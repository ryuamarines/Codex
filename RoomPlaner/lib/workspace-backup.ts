import type { PlannerWorkspaceSnapshot } from "@/lib/planner-workspace-storage";
import { parsePlannerProject } from "@/lib/project-schema";

const WORKSPACE_BACKUP_FORMAT = "roomplaner-workspace";
const WORKSPACE_BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_PROJECTS = 200;

export function serializePlannerWorkspaceBackup(snapshot: PlannerWorkspaceSnapshot, exportedAtMs = Date.now()) {
  const workspace = normalizeWorkspace(snapshot);
  return JSON.stringify({
    format: WORKSPACE_BACKUP_FORMAT,
    schemaVersion: WORKSPACE_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date(exportedAtMs).toISOString(),
    workspace
  }, null, 2);
}

export function parsePlannerWorkspaceBackup(raw: string): PlannerWorkspaceSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("バックアップJSONが壊れています。元ファイルは変更していません。");
  }

  const record = asRecord(value);
  if (
    !record
    || record.format !== WORKSPACE_BACKUP_FORMAT
    || record.schemaVersion !== WORKSPACE_BACKUP_SCHEMA_VERSION
  ) {
    throw new Error("RoomPlanerの全プロジェクトバックアップ形式ではありません。");
  }

  const workspace = asRecord(record.workspace);
  if (!workspace || !Array.isArray(workspace.projects)) {
    throw new Error("バックアップにプロジェクト一覧がありません。");
  }
  if (workspace.projects.length === 0) {
    throw new Error("バックアップのプロジェクト一覧が空です。");
  }
  if (workspace.projects.length > MAX_BACKUP_PROJECTS) {
    throw new Error(`バックアップのプロジェクト数が上限${MAX_BACKUP_PROJECTS}件を超えています。`);
  }

  return normalizeWorkspace({
    activeProjectId: typeof workspace.activeProjectId === "string" ? workspace.activeProjectId : "",
    projects: workspace.projects.map((project) => {
      const projectRecord = asRecord(project);
      if (!projectRecord || typeof projectRecord.id !== "string" || !projectRecord.id.trim()) {
        throw new Error("バックアップ内にIDのないプロジェクトがあります。");
      }
      return parsePlannerProject(project);
    })
  });
}

function normalizeWorkspace(snapshot: PlannerWorkspaceSnapshot): PlannerWorkspaceSnapshot {
  if (snapshot.projects.length === 0) {
    throw new Error("バックアップするプロジェクトがありません。");
  }
  if (snapshot.projects.length > MAX_BACKUP_PROJECTS) {
    throw new Error(`プロジェクト数がバックアップ上限${MAX_BACKUP_PROJECTS}件を超えています。`);
  }

  const ids = new Set<string>();
  const projects = snapshot.projects.map((project) => {
    const parsed = parsePlannerProject(project);
    if (ids.has(parsed.id)) {
      throw new Error("バックアップ内のプロジェクトIDが重複しています。");
    }
    ids.add(parsed.id);
    return parsed;
  });

  return {
    activeProjectId: ids.has(snapshot.activeProjectId) ? snapshot.activeProjectId : projects[0].id,
    projects
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
