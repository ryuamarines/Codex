import { describe, expect, it } from "vitest";
import { sampleProject } from "@/data/sample-project";
import {
  buildCloudWorkspace,
  CLOUD_WORKSPACE_SCHEMA_VERSION,
  parseCloudWorkspaceRecord
} from "@/lib/cloud-workspace";
import { createEmptyPlannerProject } from "@/lib/planner-workspace-storage";
import { clonePlannerProject } from "@/lib/project-schema";

describe("cloud workspace", () => {
  it("stores every project while omitting local-only backgrounds", () => {
    const first = clonePlannerProject(sampleProject);
    first.background = {
      dataUrl: "data:image/png;base64,dGVzdA==",
      visible: true,
      opacity: 0.6,
      locked: true,
      width: 640,
      height: 480
    };
    const second = createEmptyPlannerProject("案B");

    const built = buildCloudWorkspace({ activeProjectId: second.id, projects: [first, second] });

    expect(built.workspace.projects).toHaveLength(2);
    expect(built.workspace.activeProjectId).toBe(second.id);
    expect(built.workspace.projects.every((project) => project.background === null)).toBe(true);
    expect(built.backgroundsOmitted).toBe(1);
  });

  it("reads schema v3 workspaces and legacy single-project records", () => {
    const second = createEmptyPlannerProject("案B");
    const current = parseCloudWorkspaceRecord({
      schemaVersion: CLOUD_WORKSPACE_SCHEMA_VERSION,
      updatedAtMs: 30,
      workspace: { activeProjectId: second.id, projects: [sampleProject, second] }
    });
    const legacy = parseCloudWorkspaceRecord({ schemaVersion: 2, updatedAtMs: 10, project: sampleProject });

    expect(current?.workspace.projects).toHaveLength(2);
    expect(current?.workspace.activeProjectId).toBe(second.id);
    expect(current?.migratedLegacy).toBe(false);
    expect(legacy?.workspace.projects).toHaveLength(1);
    expect(legacy?.migratedLegacy).toBe(true);
  });

  it("rejects duplicated project IDs", () => {
    expect(() => parseCloudWorkspaceRecord({
      schemaVersion: 3,
      workspace: { activeProjectId: sampleProject.id, projects: [sampleProject, sampleProject] }
    })).toThrow("重複");
  });
});
