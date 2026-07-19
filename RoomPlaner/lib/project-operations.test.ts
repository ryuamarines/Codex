import { describe, expect, it } from "vitest";
import { sampleProject } from "@/data/sample-project";
import { addFurnitureFromRect, addZoneFromRect, setRoom } from "@/lib/project-operations";
import { clonePlannerProject } from "@/lib/project-schema";

describe("project operations", () => {
  it("uses preset dimensions for a tap-created furniture item", () => {
    const project = clonePlannerProject(sampleProject);
    const result = addFurnitureFromRect(project, { x: 300, y: 300 }, { x: 302, y: 302 }, {
      widthMm: 1400,
      depthMm: 650
    });
    const created = result.nextProject.furniture.find((item) => item.id === result.createdId);

    expect(created).toMatchObject({ widthMm: 1400, depthMm: 650 });
  });

  it("uses a useful default size for a tap-created constraint zone", () => {
    const project = clonePlannerProject(sampleProject);
    const result = addZoneFromRect(project, { x: 300, y: 300 }, { x: 300, y: 300 });
    const created = result.nextProject.zones.find((item) => item.id === result.createdId);

    expect(created).toMatchObject({ widthMm: 1600, depthMm: 800 });
  });

  it("remaps windows and doors onto a newly traced room", () => {
    const project = clonePlannerProject(sampleProject);
    const points = [
      { x: 50, y: 50 },
      { x: 750, y: 50 },
      { x: 750, y: 650 },
      { x: 50, y: 650 }
    ];
    const result = setRoom(project, points).nextProject;

    expect(result.windows[0].wallIndex).toBeGreaterThanOrEqual(0);
    expect(result.windows[0].wallIndex).toBeLessThan(points.length);
    expect(result.doors[0].wallIndex).toBeGreaterThanOrEqual(0);
    expect(result.doors[0].wallIndex).toBeLessThan(points.length);
    expect(result.windows[0].offset).toBeGreaterThanOrEqual(0);
    expect(result.doors[0].offset).toBeGreaterThanOrEqual(0);
  });
});
