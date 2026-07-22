import { describe, expect, it } from "vitest";
import { sampleProject } from "@/data/sample-project";
import { createEmptyPlannerProject } from "@/lib/planner-workspace-storage";
import { clonePlannerProject } from "@/lib/project-schema";
import {
  parsePlannerWorkspaceBackup,
  serializePlannerWorkspaceBackup
} from "@/lib/workspace-backup";

describe("planner workspace backup", () => {
  it("round-trips every project, the active project, and local backgrounds", () => {
    const first = clonePlannerProject(sampleProject);
    first.background = {
      dataUrl: "data:image/png;base64,bG9jYWw=",
      visible: true,
      opacity: 0.6,
      locked: true,
      width: 800,
      height: 600
    };
    const second = createEmptyPlannerProject("別案");

    const raw = serializePlannerWorkspaceBackup(
      { activeProjectId: second.id, projects: [first, second] },
      Date.UTC(2026, 6, 22)
    );
    const restored = parsePlannerWorkspaceBackup(raw);

    expect(raw).toContain("2026-07-22T00:00:00.000Z");
    expect(restored.activeProjectId).toBe(second.id);
    expect(restored.projects.map((project) => project.name)).toEqual(["サンプルルーム", "別案"]);
    expect(restored.projects[0].background?.dataUrl).toContain("bG9jYWw");
  });

  it("rejects unrelated JSON, duplicate IDs, and missing project IDs", () => {
    expect(() => parsePlannerWorkspaceBackup(JSON.stringify(sampleProject))).toThrow("バックアップ形式");

    const raw = JSON.parse(serializePlannerWorkspaceBackup({
      activeProjectId: sampleProject.id,
      projects: [sampleProject]
    })) as { workspace: { projects: unknown[] } };
    raw.workspace.projects.push(clonePlannerProject(sampleProject));
    expect(() => parsePlannerWorkspaceBackup(JSON.stringify(raw))).toThrow("IDが重複");

    const missingId = JSON.parse(serializePlannerWorkspaceBackup({
      activeProjectId: sampleProject.id,
      projects: [sampleProject]
    })) as { workspace: { projects: Array<Record<string, unknown>> } };
    delete missingId.workspace.projects[0].id;
    expect(() => parsePlannerWorkspaceBackup(JSON.stringify(missingId))).toThrow("IDのない");
  });
});
