import { sampleProject } from "@/data/sample-project";
import type {
  BackgroundImage,
  ConstraintZone,
  DoorObject,
  FurnitureObject,
  PlannerProject,
  Point,
  RoomShape,
  WindowObject
} from "@/lib/types";

const CSV_HEADER = [
  "recordType",
  "id",
  "name",
  "x",
  "y",
  "widthPx",
  "heightPx",
  "widthMm",
  "depthMm",
  "rotation",
  "wallIndex",
  "offsetPx",
  "note",
  "swing",
  "openDirection",
  "visible",
  "opacity",
  "locked",
  "dataUrl",
  "pointIndex",
  "canvasWidth",
  "canvasHeight",
  "scalePxPerMm",
  "floorOpacity",
  "kind"
];

type CsvRow = Record<(typeof CSV_HEADER)[number], string>;

export function exportProjectCsv(project: PlannerProject) {
  const rows: string[][] = [CSV_HEADER];

  rows.push(
    toCsvRow({
      recordType: "project",
      id: project.id,
      name: project.name,
      canvasWidth: String(project.canvas.width),
      canvasHeight: String(project.canvas.height),
      scalePxPerMm: String(project.scalePxPerMm),
      floorOpacity: String(project.floorOpacity)
    })
  );

  if (project.background) {
    rows.push(
      toCsvRow({
        recordType: "background",
        id: "background",
        widthPx: String(project.background.width),
        heightPx: String(project.background.height),
        visible: String(project.background.visible),
        opacity: String(project.background.opacity),
        locked: String(project.background.locked),
        dataUrl: project.background.dataUrl
      })
    );
  }

  if (project.room) {
    rows.push(toCsvRow({ recordType: "room", id: project.room.id }));
    project.room.points.forEach((point, index) => {
      rows.push(
        toCsvRow({
          recordType: "room_point",
          id: project.room?.id ?? "",
          x: String(point.x),
          y: String(point.y),
          pointIndex: String(index)
        })
      );
    });
  }

  project.windows.forEach((item) => rows.push(toCsvRow(serializeWindow(item))));
  project.doors.forEach((item) => rows.push(toCsvRow(serializeDoor(item))));
  project.zones.forEach((item) => rows.push(toCsvRow(serializeZone(item))));
  project.furniture.forEach((item) => rows.push(toCsvRow(serializeFurniture(item))));

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function importProjectCsv(raw: string): PlannerProject {
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    throw new Error("CSV にデータがありません。");
  }

  const header = rows[0];
  if (header.join("|") !== CSV_HEADER.join("|")) {
    throw new Error("CSV ヘッダーが想定と違います。部屋再設計プランナーの書き出しCSVを選んでください。");
  }

  const body = rows.slice(1).map(toRowObject);
  const projectRow = body.find((row) => row.recordType === "project");
  if (!projectRow) {
    throw new Error("project 行が見つかりません。");
  }

  const roomRow = body.find((row) => row.recordType === "room");
  const roomPointRows = body
    .filter((row) => row.recordType === "room_point")
    .sort((a, b) => toNumber(a.pointIndex) - toNumber(b.pointIndex));

  const project: PlannerProject = {
    id: projectRow.id || sampleProject.id,
    name: projectRow.name || sampleProject.name,
    canvas: {
      width: toNumber(projectRow.canvasWidth, sampleProject.canvas.width),
      height: toNumber(projectRow.canvasHeight, sampleProject.canvas.height)
    },
    scalePxPerMm: toNumber(projectRow.scalePxPerMm, sampleProject.scalePxPerMm),
    floorOpacity: clamp(toNumber(projectRow.floorOpacity, sampleProject.floorOpacity), 0, 1),
    background: parseBackground(body.find((row) => row.recordType === "background")),
    room: parseRoom(roomRow, roomPointRows),
    windows: body.filter((row) => row.recordType === "window").map(parseWindow),
    zones: body.filter((row) => row.recordType === "zone").map(parseZone),
    doors: body.filter((row) => row.recordType === "door").map(parseDoor),
    furniture: body.filter((row) => row.recordType === "furniture").map(parseFurniture)
  };

  return project;
}

function serializeWindow(item: WindowObject): CsvRow {
  return {
    ...emptyRow(),
    recordType: "window",
    id: item.id,
    wallIndex: String(item.wallIndex),
    offsetPx: String(item.offset),
    widthMm: String(item.widthMm),
    note: item.note
  };
}

function serializeDoor(item: DoorObject): CsvRow {
  return {
    ...emptyRow(),
    recordType: "door",
    id: item.id,
    wallIndex: String(item.wallIndex),
    offsetPx: String(item.offset),
    widthMm: String(item.widthMm),
    note: item.note,
    swing: item.swing,
    openDirection: item.openDirection
  };
}

function serializeZone(item: ConstraintZone): CsvRow {
  return {
    ...emptyRow(),
    recordType: "zone",
    id: item.id,
    x: String(item.x),
    y: String(item.y),
    widthMm: String(item.widthMm),
    depthMm: String(item.depthMm),
    note: item.note
  };
}

function serializeFurniture(item: FurnitureObject): CsvRow {
  return {
    ...emptyRow(),
    recordType: "furniture",
    id: item.id,
    name: item.name,
    x: String(item.x),
    y: String(item.y),
    widthMm: String(item.widthMm),
    depthMm: String(item.depthMm),
    rotation: String(item.rotation),
    kind: item.kind
  };
}

function parseBackground(row?: CsvRow): BackgroundImage | null {
  if (!row || !row.dataUrl) return null;
  return {
    dataUrl: row.dataUrl,
    visible: toBoolean(row.visible, true),
    opacity: clamp(toNumber(row.opacity, 0.64), 0, 1),
    locked: toBoolean(row.locked, true),
    width: toNumber(row.widthPx, sampleProject.canvas.width),
    height: toNumber(row.heightPx, sampleProject.canvas.height)
  };
}

function parseRoom(roomRow: CsvRow | undefined, pointRows: CsvRow[]): RoomShape | null {
  if (!roomRow || pointRows.length < 3) return null;
  const points: Point[] = pointRows.map((row) => ({
    x: toNumber(row.x),
    y: toNumber(row.y)
  }));
  return {
    id: roomRow.id || "room",
    points
  };
}

function parseWindow(row: CsvRow): WindowObject {
  return {
    id: row.id,
    wallIndex: toNumber(row.wallIndex),
    offset: toNumber(row.offsetPx),
    widthMm: toNumber(row.widthMm),
    note: row.note
  };
}

function parseDoor(row: CsvRow): DoorObject {
  return {
    id: row.id,
    wallIndex: toNumber(row.wallIndex),
    offset: toNumber(row.offsetPx),
    widthMm: toNumber(row.widthMm),
    swing: row.swing === "counterclockwise" ? "counterclockwise" : "clockwise",
    openDirection: row.openDirection === "outward" ? "outward" : "inward",
    note: row.note
  };
}

function parseZone(row: CsvRow): ConstraintZone {
  return {
    id: row.id,
    x: toNumber(row.x),
    y: toNumber(row.y),
    widthMm: toNumber(row.widthMm),
    depthMm: toNumber(row.depthMm),
    note: row.note
  };
}

function parseFurniture(row: CsvRow): FurnitureObject {
  return {
    id: row.id,
    name: row.name || "家具",
    kind: isFurnitureKind(row.kind) ? row.kind : "generic",
    x: toNumber(row.x),
    y: toNumber(row.y),
    widthMm: toNumber(row.widthMm, 1200),
    depthMm: toNumber(row.depthMm, 600),
    rotation: toNumber(row.rotation)
  };
}

function isFurnitureKind(value: string): value is FurnitureObject["kind"] {
  return [
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
  ].includes(value);
}

function emptyRow(): CsvRow {
  return CSV_HEADER.reduce(
    (accumulator, key) => {
      accumulator[key] = "";
      return accumulator;
    },
    {} as CsvRow
  );
}

function toCsvRow(values: Partial<CsvRow>) {
  const row = emptyRow();
  for (const key of CSV_HEADER) {
    row[key] = values[key] ?? "";
  }
  return CSV_HEADER.map((key) => row[key]);
}

function toRowObject(values: string[]): CsvRow {
  return CSV_HEADER.reduce(
    (accumulator, key, index) => {
      accumulator[key] = values[index] ?? "";
      return accumulator;
    },
    {} as CsvRow
  );
}

function escapeCsvCell(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function parseCsv(raw: string) {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const nextChar = raw[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: string, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
