import { describe, expect, it } from "vitest";
import { sampleProject } from "@/data/sample-project";
import { exportProjectCsv, importProjectCsv } from "@/lib/project-csv";
import { clonePlannerProject } from "@/lib/project-schema";

describe("project CSV", () => {
  it("round-trips commas, quotes, newlines, and furniture kinds", () => {
    const project = clonePlannerProject(sampleProject);
    project.name = "703号室, \"最終案\"";
    project.windows[0].note = "南側\n掃き出し窓";
    project.furniture[0].name = "机, A案";

    const imported = importProjectCsv(exportProjectCsv(project));

    expect(imported.name).toBe(project.name);
    expect(imported.windows[0].note).toBe(project.windows[0].note);
    expect(imported.furniture[0]).toMatchObject({ name: "机, A案", kind: "desk" });
    expect(imported.room?.points).toEqual(project.room?.points);
  });

  it("accepts an Excel BOM and rejects unclosed quotes", () => {
    expect(importProjectCsv(`\ufeff${exportProjectCsv(sampleProject)}`).name).toBe(sampleProject.name);
    expect(() => importProjectCsv(`${exportProjectCsv(sampleProject)}\n\"broken`)).toThrow("引用符");
  });
});
