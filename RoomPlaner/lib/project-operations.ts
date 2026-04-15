import { createId } from "@/lib/geometry";
import type { DoorObject, PlannerProject, Point } from "@/lib/types";

export function addFurniture(project: PlannerProject, point: Point) {
  const id = createId("furniture");
  return {
    nextProject: {
      ...project,
      furniture: [
        ...project.furniture,
        {
          id,
          name: `家具 ${project.furniture.length + 1}`,
          kind: "generic" as const,
          x: point.x,
          y: point.y,
          widthMm: 1200,
          depthMm: 600,
          rotation: 0
        }
      ]
    },
    createdId: id
  };
}

export function addZone(project: PlannerProject, point: Point) {
  const id = createId("zone");
  return {
    nextProject: {
      ...project,
      zones: [
        ...project.zones,
        {
          id,
          x: point.x,
          y: point.y,
          widthMm: 1600,
          depthMm: 800,
          note: ""
        }
      ]
    },
    createdId: id
  };
}

export function addFurnitureFromRect(project: PlannerProject, start: Point, end: Point) {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const id = createId("furniture");

  return {
    nextProject: {
      ...project,
      furniture: [
        ...project.furniture,
        {
          id,
          name: `家具 ${project.furniture.length + 1}`,
          kind: "generic" as const,
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
          widthMm: Math.max(200, Math.round((maxX - minX) / project.scalePxPerMm)),
          depthMm: Math.max(200, Math.round((maxY - minY) / project.scalePxPerMm)),
          rotation: 0
        }
      ]
    },
    createdId: id
  };
}

export function addZoneFromRect(project: PlannerProject, start: Point, end: Point) {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const id = createId("zone");

  return {
    nextProject: {
      ...project,
      zones: [
        ...project.zones,
        {
          id,
          x: minX,
          y: minY,
          widthMm: Math.max(200, Math.round((maxX - minX) / project.scalePxPerMm)),
          depthMm: Math.max(200, Math.round((maxY - minY) / project.scalePxPerMm)),
          note: ""
        }
      ]
    },
    createdId: id
  };
}

export function addWindow(project: PlannerProject, wallIndex: number, offset: number, widthMm: number) {
  const id = createId("window");
  return {
    nextProject: {
      ...project,
      windows: [...project.windows, { id, wallIndex, offset, widthMm, note: "" }]
    },
    createdId: id
  };
}

export function addDoor(project: PlannerProject, wallIndex: number, offset: number, widthMm: number) {
  const id = createId("door");
  return {
    nextProject: {
      ...project,
      doors: [
        ...project.doors,
        {
          id,
          wallIndex,
          offset,
          widthMm,
          swing: "counterclockwise" as const,
          openDirection: "inward" as const,
          note: ""
        }
      ]
    },
    createdId: id
  };
}

export function setRoom(project: PlannerProject, points: Point[]) {
  const roomId = createId("room");
  return {
    nextProject: {
      ...project,
      room: {
        id: roomId,
        points
      }
    },
    roomId
  };
}

export function setScale(project: PlannerProject, scalePxPerMm: number) {
  return {
    ...project,
    scalePxPerMm
  };
}

export function setBackground(project: PlannerProject, background: PlannerProject["background"], canvas?: PlannerProject["canvas"]) {
  return {
    ...project,
    background,
    canvas: canvas ?? project.canvas
  };
}

export function updateFurniturePosition(project: PlannerProject, id: string, point: Point) {
  return {
    ...project,
    furniture: project.furniture.map((item) => (item.id === id ? { ...item, x: point.x, y: point.y } : item))
  };
}

export function updateRoomVertex(project: PlannerProject, index: number, point: Point) {
  return {
    ...project,
    room: project.room
      ? {
          ...project.room,
          points: project.room.points.map((roomPoint, roomIndex) => (roomIndex === index ? point : roomPoint))
        }
      : null
  };
}

export function insertRoomVertex(project: PlannerProject, edgeIndex: number, point: Point) {
  if (!project.room) {
    return project;
  }

  const points = [...project.room.points];
  points.splice(edgeIndex + 1, 0, point);

  return {
    ...project,
    room: {
      ...project.room,
      points
    }
  };
}

export function translateRoom(project: PlannerProject, delta: Point) {
  if (!project.room) {
    return project;
  }

  return {
    ...project,
    room: {
      ...project.room,
      points: project.room.points.map((point) => ({
        x: point.x + delta.x,
        y: point.y + delta.y
      }))
    }
  };
}

export function updateZonePosition(project: PlannerProject, id: string, point: Point) {
  return {
    ...project,
    zones: project.zones.map((zone) => (zone.id === id ? { ...zone, x: point.x, y: point.y } : zone))
  };
}

export function updateWindowPlacement(project: PlannerProject, id: string, wallIndex: number, offset: number) {
  return {
    ...project,
    windows: project.windows.map((entry) => (entry.id === id ? { ...entry, wallIndex, offset } : entry))
  };
}

export function updateDoorPlacement(project: PlannerProject, id: string, wallIndex: number, offset: number) {
  return {
    ...project,
    doors: project.doors.map((entry) => (entry.id === id ? { ...entry, wallIndex, offset } : entry))
  };
}

export function removeSelectedObject(project: PlannerProject, selection: { type: string; id: string }) {
  switch (selection.type) {
    case "furniture":
      return { ...project, furniture: project.furniture.filter((item) => item.id !== selection.id) };
    case "window":
      return { ...project, windows: project.windows.filter((item) => item.id !== selection.id) };
    case "door":
      return { ...project, doors: project.doors.filter((item) => item.id !== selection.id) };
    case "zone":
      return { ...project, zones: project.zones.filter((item) => item.id !== selection.id) };
    default:
      return project;
  }
}

export function duplicateFurniture(project: PlannerProject, sourceId: string, point: Point) {
  const source = project.furniture.find((item) => item.id === sourceId);
  if (!source) {
    return { nextProject: project, createdId: null as string | null };
  }

  const id = createId("furniture");
  return {
    nextProject: {
      ...project,
      furniture: [
        ...project.furniture,
        {
          ...source,
          id,
          name: `${source.name} copy`,
          x: point.x,
          y: point.y
        }
      ]
    },
    createdId: id
  };
}

export function updateSelectedFieldOnProject(
  project: PlannerProject,
  selection: { type: string; id: string },
  field: string,
  value: string | number,
  updateDoorField: (item: DoorObject, key: string, nextValue: string | number) => DoorObject
) {
  switch (selection.type) {
    case "furniture":
      return {
        ...project,
        furniture: project.furniture.map((item) => (item.id === selection.id ? { ...item, [field]: value } : item))
      };
    case "window":
      return {
        ...project,
        windows: project.windows.map((item) => (item.id === selection.id ? { ...item, [field]: value } : item))
      };
    case "door":
      return {
        ...project,
        doors: project.doors.map((item) =>
          item.id === selection.id ? updateDoorField(item, field, value) : item
        )
      };
    case "zone":
      return {
        ...project,
        zones: project.zones.map((item) => (item.id === selection.id ? { ...item, [field]: value } : item))
      };
    default:
      return project;
  }
}
