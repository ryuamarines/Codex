import { describe, expect, it } from "vitest";
import { detectCollisions } from "@/lib/geometry";
import { createEmptyPlannerProject } from "@/lib/planner-workspace-storage";

describe("collision detection", () => {
  it("reports overlapping furniture and wall overflow", () => {
    const project = createEmptyPlannerProject("干渉確認");
    project.scalePxPerMm = 0.1;
    project.room = {
      id: "room-test",
      points: [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 500 },
        { x: 0, y: 500 }
      ]
    };
    project.furniture = [
      { id: "a", name: "A", kind: "table", x: 250, y: 250, widthMm: 1000, depthMm: 1000, rotation: 0 },
      { id: "b", name: "B", kind: "chair", x: 280, y: 250, widthMm: 1000, depthMm: 1000, rotation: 0 },
      { id: "c", name: "C", kind: "desk", x: 490, y: 250, widthMm: 1000, depthMm: 1000, rotation: 0 }
    ];

    const issues = detectCollisions(project);
    expect(issues.some((issue) => issue.kind === "furniture-overlap" && issue.id === "a")).toBe(true);
    expect(issues.some((issue) => issue.kind === "wall-overflow" && issue.id === "c")).toBe(true);
  });
});
