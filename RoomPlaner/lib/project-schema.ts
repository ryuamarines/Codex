import { sampleProject } from "@/data/sample-project";
import { createId } from "@/lib/geometry";
import type {
  BackgroundImage,
  ConstraintZone,
  DoorObject,
  FurnitureKind,
  FurnitureObject,
  PlannerProject,
  Point,
  RoomShape,
  WindowObject
} from "@/lib/types";

export const PLANNER_PROJECT_SCHEMA_VERSION = 2;

const FURNITURE_KINDS: FurnitureKind[] = [
  "generic",
  "bed",
  "desk",
  "table",
  "chair",
  "sofa",
  "wardrobe",
  "cabinet",
  "shelf",
  "appliance",
  "rug",
  "plant"
];

export function parsePlannerProjectJson(raw: string) {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("保存データがJSONとして壊れています。元データは削除せず保持しています。");
  }

  return parsePlannerProject(value);
}

export function parsePlannerProject(value: unknown): PlannerProject {
  const record = asRecord(value);
  if (!record || !("canvas" in record) || !("scalePxPerMm" in record)) {
    throw new Error("RoomPlanerのプロジェクト形式ではありません。");
  }

  const room = parseRoom(record.room);
  const project: PlannerProject = {
    id: safeId(record.id, "project"),
    name: safeText(record.name, "名称未設定", 120),
    canvas: parseCanvas(record.canvas),
    scalePxPerMm: positiveNumber(record.scalePxPerMm, sampleProject.scalePxPerMm, 10),
    floorOpacity: clampNumber(record.floorOpacity, sampleProject.floorOpacity, 0, 1),
    background: parseBackground(record.background),
    room,
    windows: room ? parseArray(record.windows, 2_000, (item) => parseWindow(item, room)) : [],
    zones: parseArray(record.zones, 5_000, parseZone),
    doors: room ? parseArray(record.doors, 2_000, (item) => parseDoor(item, room)) : [],
    furniture: parseArray(record.furniture, 5_000, parseFurniture)
  };

  return ensureUniqueObjectIds(project);
}

export function clonePlannerProject(project: PlannerProject): PlannerProject {
  return parsePlannerProject(JSON.parse(JSON.stringify(project)) as unknown);
}

function parseCanvas(value: unknown) {
  const record = asRecord(value);
  return {
    width: positiveNumber(record?.width, sampleProject.canvas.width, 20_000),
    height: positiveNumber(record?.height, sampleProject.canvas.height, 20_000)
  };
}

function parseBackground(value: unknown): BackgroundImage | null {
  if (value === null || value === undefined) return null;
  const record = asRecord(value);
  if (
    !record
    || typeof record.dataUrl !== "string"
    || !/^data:image\/(?:png|jpe?g|webp);base64,/i.test(record.dataUrl)
  ) return null;

  return {
    dataUrl: record.dataUrl,
    visible: typeof record.visible === "boolean" ? record.visible : true,
    opacity: clampNumber(record.opacity, 0.64, 0, 1),
    locked: typeof record.locked === "boolean" ? record.locked : true,
    width: positiveNumber(record.width, sampleProject.canvas.width, 20_000),
    height: positiveNumber(record.height, sampleProject.canvas.height, 20_000)
  };
}

function parseRoom(value: unknown): RoomShape | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.points)) return null;

  const points = record.points.slice(0, 2_000).map(parsePoint).filter(isPoint);
  if (points.length < 3) return null;

  return {
    id: safeId(record.id, "room"),
    points
  };
}

function parsePoint(value: unknown): Point | null {
  const record = asRecord(value);
  if (!record || !isFiniteNumber(record.x) || !isFiniteNumber(record.y)) return null;
  return {
    x: clamp(record.x, -1_000_000, 1_000_000),
    y: clamp(record.y, -1_000_000, 1_000_000)
  };
}

function parseWindow(value: unknown, room: RoomShape): WindowObject | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    id: safeId(record.id, "window"),
    wallIndex: wallIndex(record.wallIndex, room),
    offset: finiteNumber(record.offset),
    widthMm: positiveNumber(record.widthMm, 800, 1_000_000),
    note: safeText(record.note, "", 500)
  };
}

function parseDoor(value: unknown, room: RoomShape): DoorObject | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    id: safeId(record.id, "door"),
    wallIndex: wallIndex(record.wallIndex, room),
    offset: finiteNumber(record.offset),
    widthMm: positiveNumber(record.widthMm, 800, 1_000_000),
    swing: record.swing === "clockwise" ? "clockwise" : "counterclockwise",
    openDirection: record.openDirection === "outward" ? "outward" : "inward",
    note: safeText(record.note, "", 500)
  };
}

function parseZone(value: unknown): ConstraintZone | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    id: safeId(record.id, "zone"),
    x: finiteNumber(record.x),
    y: finiteNumber(record.y),
    widthMm: positiveNumber(record.widthMm, 200, 1_000_000),
    depthMm: positiveNumber(record.depthMm, 200, 1_000_000),
    note: safeText(record.note, "", 500)
  };
}

function parseFurniture(value: unknown): FurnitureObject | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = typeof record.kind === "string" && FURNITURE_KINDS.includes(record.kind as FurnitureKind)
    ? (record.kind as FurnitureKind)
    : "generic";

  return {
    id: safeId(record.id, "furniture"),
    name: safeText(record.name, "家具", 120),
    kind,
    x: finiteNumber(record.x),
    y: finiteNumber(record.y),
    widthMm: positiveNumber(record.widthMm, 200, 1_000_000),
    depthMm: positiveNumber(record.depthMm, 200, 1_000_000),
    rotation: finiteNumber(record.rotation)
  };
}

function ensureUniqueObjectIds(project: PlannerProject): PlannerProject {
  const ids = new Set<string>();
  const uniqueId = (id: string, prefix: string) => {
    if (!ids.has(id)) {
      ids.add(id);
      return id;
    }
    let next = createId(prefix);
    while (ids.has(next)) next = createId(prefix);
    ids.add(next);
    return next;
  };

  return {
    ...project,
    room: project.room ? { ...project.room, id: uniqueId(project.room.id, "room") } : null,
    windows: project.windows.map((item) => ({ ...item, id: uniqueId(item.id, "window") })),
    zones: project.zones.map((item) => ({ ...item, id: uniqueId(item.id, "zone") })),
    doors: project.doors.map((item) => ({ ...item, id: uniqueId(item.id, "door") })),
    furniture: project.furniture.map((item) => ({ ...item, id: uniqueId(item.id, "furniture") }))
  };
}

function parseArray<T>(value: unknown, maxItems: number, parser: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(parser).filter((item): item is T => item !== null);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeId(value: unknown, prefix: string) {
  return typeof value === "string" && value.trim() ? value.slice(0, 160) : createId(prefix);
}

function safeText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function wallIndex(value: unknown, room: RoomShape) {
  const maxIndex = Math.max(0, room.points.length - 1);
  return Math.min(maxIndex, Math.max(0, Math.trunc(finiteNumber(value))));
}

function finiteNumber(value: unknown, fallback = 0) {
  return isFiniteNumber(value) ? clamp(value, -1_000_000, 1_000_000) : fallback;
}

function positiveNumber(value: unknown, fallback: number, max: number) {
  return isFiniteNumber(value) && value > 0 ? Math.min(value, max) : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  return isFiniteNumber(value) ? clamp(value, min, max) : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isPoint(value: Point | null): value is Point {
  return value !== null;
}
