import { createId, mmToPx } from "@/lib/geometry";
import type { DoorObject, FurnitureKind, FurnitureObject, PlannerProject, Point, WindowObject } from "@/lib/types";

const DIRECTION_MAP: Record<string, { x: number; y: number }> = {
  r: { x: 1, y: 0 },
  right: { x: 1, y: 0 },
  e: { x: 1, y: 0 },
  east: { x: 1, y: 0 },
  l: { x: -1, y: 0 },
  left: { x: -1, y: 0 },
  w: { x: -1, y: 0 },
  west: { x: -1, y: 0 },
  u: { x: 0, y: -1 },
  up: { x: 0, y: -1 },
  n: { x: 0, y: -1 },
  north: { x: 0, y: -1 },
  d: { x: 0, y: 1 },
  down: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  south: { x: 0, y: 1 }
};

export type MigrationFurnitureRow = {
  name: string;
  widthMm: number;
  depthMm: number;
  xMm: number;
  yMm: number;
  rotation: number;
};

export type MigrationOpeningRow = {
  type: "window" | "door";
  wallIndex: number;
  offsetMm: number;
  widthMm: number;
  swing?: "clockwise" | "counterclockwise";
  openDirection?: "inward" | "outward";
  note: string;
};

export function parseOrthogonalWallPath(input: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("壁パスが空です。");
  }

  const points: Point[] = [{ x: 0, y: 0 }];
  let current = { x: 0, y: 0 };

  for (const line of lines) {
    const match = line.match(/^([a-zA-Z]+)[,\s:;-]+([\d.]+)$/);
    if (!match) {
      throw new Error(`壁パスの形式を読めませんでした: ${line}`);
    }

    const direction = DIRECTION_MAP[match[1].toLowerCase()];
    const lengthMm = Number(match[2]);

    if (!direction || !Number.isFinite(lengthMm) || lengthMm <= 0) {
      throw new Error(`壁パスの値が不正です: ${line}`);
    }

    current = {
      x: current.x + direction.x * lengthMm,
      y: current.y + direction.y * lengthMm
    };
    points.push(current);
  }

  const last = points[points.length - 1];
  if (Math.abs(last.x) < 0.001 && Math.abs(last.y) < 0.001) {
    points.pop();
  }

  if (points.length < 3) {
    throw new Error("部屋形状にするには 3 辺以上が必要です。");
  }

  return points;
}

export function mmPointsToCanvas(pointsMm: Point[], scalePxPerMm: number, origin: Point) {
  return pointsMm.map((point) => ({
    x: origin.x + mmToPx(point.x, scalePxPerMm),
    y: origin.y + mmToPx(point.y, scalePxPerMm)
  }));
}

export function parseFurnitureRows(input: string) {
  const rows = parseDelimitedRows(input);
  return rows.map((row, index) => {
    const [name, width, depth, x, y, rotation = "0"] = row;
    const parsed = {
      name: name || `家具 ${index + 1}`,
      widthMm: Number(width),
      depthMm: Number(depth),
      xMm: Number(x),
      yMm: Number(y),
      rotation: Number(rotation)
    };

    if (
      !parsed.name ||
      !Number.isFinite(parsed.widthMm) ||
      !Number.isFinite(parsed.depthMm) ||
      !Number.isFinite(parsed.xMm) ||
      !Number.isFinite(parsed.yMm) ||
      !Number.isFinite(parsed.rotation)
    ) {
      throw new Error(`家具CSVの ${index + 1} 行目を読めませんでした。`);
    }

    return parsed;
  });
}

export function parseOpeningRows(input: string) {
  const rows = parseDelimitedRows(input);
  return rows.map((row, index) => {
    const [type, wallIndex, offsetMm, widthMm, swing = "", maybeOpenDirection = "", maybeNote = ""] = row;
    const openDirection = maybeOpenDirection === "inward" || maybeOpenDirection === "outward" ? maybeOpenDirection : "";
    const note = openDirection ? maybeNote : maybeOpenDirection;
    const normalizedType = type.toLowerCase();
    if (normalizedType !== "window" && normalizedType !== "door") {
      throw new Error(`開口CSVの ${index + 1} 行目の type は window か door を指定してください。`);
    }

    const parsed: MigrationOpeningRow = {
      type: normalizedType,
      wallIndex: Number(wallIndex),
      offsetMm: Number(offsetMm),
      widthMm: Number(widthMm),
      note
    };

    if (normalizedType === "door") {
      parsed.swing = swing.toLowerCase() === "clockwise" ? "clockwise" : "counterclockwise";
      parsed.openDirection = openDirection.toLowerCase() === "outward" ? "outward" : "inward";
    }

    if (
      !Number.isInteger(parsed.wallIndex) ||
      parsed.wallIndex < 0 ||
      !Number.isFinite(parsed.offsetMm) ||
      !Number.isFinite(parsed.widthMm)
    ) {
      throw new Error(`開口CSVの ${index + 1} 行目を読めませんでした。`);
    }

    return parsed;
  });
}

function parseDelimitedRows(input: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("入力が空です。");
  }

  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
  const first = rows[0].map((cell) => cell.toLowerCase());
  const headerLike = first.some((cell) =>
    ["name", "width", "depth", "x", "y", "rotation", "type", "wallindex", "offsetmm", "widthmm"].includes(cell)
  );
  return headerLike ? rows.slice(1) : rows;
}

export function appendFurnitureFromMigration(
  project: PlannerProject,
  rows: MigrationFurnitureRow[],
  scalePxPerMm: number,
  origin: Point
) {
  const furniture: FurnitureObject[] = rows.map((row) => ({
    id: createId("furniture"),
    name: row.name,
    kind: inferFurnitureKind(row.name),
    widthMm: row.widthMm,
    depthMm: row.depthMm,
    x: origin.x + mmToPx(row.xMm, scalePxPerMm),
    y: origin.y + mmToPx(row.yMm, scalePxPerMm),
    rotation: row.rotation
  }));

  return {
    ...project,
    furniture: [...project.furniture, ...furniture]
  };
}

export function appendOpeningsFromMigration(
  project: PlannerProject,
  rows: MigrationOpeningRow[],
  scalePxPerMm: number
) {
  const windows: WindowObject[] = [];
  const doors: DoorObject[] = [];

  for (const row of rows) {
    if (row.type === "window") {
      windows.push({
        id: createId("window"),
        wallIndex: row.wallIndex,
        offset: mmToPx(row.offsetMm, scalePxPerMm),
        widthMm: row.widthMm,
        note: row.note
      });
      continue;
    }

    doors.push({
      id: createId("door"),
      wallIndex: row.wallIndex,
      offset: mmToPx(row.offsetMm, scalePxPerMm),
      widthMm: row.widthMm,
      swing: row.swing ?? "counterclockwise",
      openDirection: row.openDirection ?? "inward",
      note: row.note
    });
  }

  return {
    ...project,
    windows: [...project.windows, ...windows],
    doors: [...project.doors, ...doors]
  };
}

function inferFurnitureKind(name: string): FurnitureKind {
  const value = name.toLowerCase();
  if (value.includes("bed") || value.includes("ベッド")) return "bed";
  if (value.includes("desk") || value.includes("デスク") || value.includes("机")) return "desk";
  if (value.includes("table") || value.includes("テーブル")) return "table";
  if (value.includes("chair") || value.includes("チェア") || value.includes("椅子")) return "chair";
  if (value.includes("sofa") || value.includes("ソファ")) return "sofa";
  if (value.includes("wardrobe") || value.includes("closet") || value.includes("クローゼット") || value.includes("ワードローブ")) return "wardrobe";
  if (value.includes("cabinet") || value.includes("キャビネット") || value.includes("収納")) return "cabinet";
  if (value.includes("shelf") || value.includes("棚") || value.includes("シェルフ")) return "shelf";
  if (value.includes("tv") || value.includes("家電") || value.includes("冷蔵庫") || value.includes("電子")) return "appliance";
  if (value.includes("rug") || value.includes("ラグ")) return "rug";
  if (value.includes("plant") || value.includes("植物") || value.includes("観葉")) return "plant";
  return "generic";
}
