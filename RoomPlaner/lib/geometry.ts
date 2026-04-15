import type {
  CollisionIssue,
  ConstraintZone,
  DoorObject,
  FurnitureObject,
  PlannerProject,
  Point,
  WindowObject
} from "@/lib/types";

const EPSILON = 0.0001;

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function mmToPx(mm: number, scalePxPerMm: number) {
  return mm * scalePxPerMm;
}

export function pxToMm(px: number, scalePxPerMm: number) {
  return scalePxPerMm === 0 ? 0 : px / scalePxPerMm;
}

export function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function getRoomEdges(points: Point[]) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return {
      start: point,
      end: next,
      index,
      length: distance(point, next),
      angle: Math.atan2(next.y - point.y, next.x - point.x)
    };
  });
}

export function projectOffsetOnWall(roomPoints: Point[], point: Point) {
  const snapped = nearestWallPoint(roomPoints, point);
  if (!snapped) return null;

  return {
    wallIndex: snapped.index,
    offset: snapped.length * snapped.projection
  };
}

export function nearestWallPoint(roomPoints: Point[], point: Point) {
  const edges = getRoomEdges(roomPoints);
  let best:
    | (ReturnType<typeof getRoomEdges>[number] & {
        snapped: Point;
        projection: number;
        distance: number;
      })
    | null = null;

  for (const edge of edges) {
    const dx = edge.end.x - edge.start.x;
    const dy = edge.end.y - edge.start.y;
    const lengthSq = dx * dx + dy * dy;
    const raw = lengthSq === 0 ? 0 : ((point.x - edge.start.x) * dx + (point.y - edge.start.y) * dy) / lengthSq;
    const projection = Math.max(0, Math.min(1, raw));
    const snapped = {
      x: edge.start.x + dx * projection,
      y: edge.start.y + dy * projection
    };
    const d = distance(point, snapped);
    if (!best || d < best.distance) {
      best = {
        ...edge,
        snapped,
        projection,
        distance: d
      };
    }
  }

  return best;
}

export function pointInPolygon(point: Point, polygon: Point[]) {
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (pointOnSegment(polygon[j], point, polygon[i])) {
      return true;
    }
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function orientation(a: Point, b: Point, c: Point) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < EPSILON) {
    return 0;
  }
  return value > 0 ? 1 : 2;
}

function onSegment(a: Point, b: Point, c: Point) {
  return (
    b.x <= Math.max(a.x, c.x) + EPSILON &&
    b.x + EPSILON >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) + EPSILON &&
    b.y + EPSILON >= Math.min(a.y, c.y)
  );
}

function pointOnSegment(a: Point, b: Point, c: Point) {
  return orientation(a, b, c) === 0 && onSegment(a, b, c);
}

export function segmentsIntersect(p1: Point, q1: Point, p2: Point, q2: Point) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

export function getRotatedRectPoints(item: FurnitureObject, scalePxPerMm: number) {
  const halfW = mmToPx(item.widthMm, scalePxPerMm) / 2;
  const halfH = mmToPx(item.depthMm, scalePxPerMm) / 2;
  const angle = (item.rotation * Math.PI) / 180;
  const corners = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH }
  ];

  return corners.map((corner) => ({
    x: item.x + corner.x * Math.cos(angle) - corner.y * Math.sin(angle),
    y: item.y + corner.x * Math.sin(angle) + corner.y * Math.cos(angle)
  }));
}

function projectPolygon(axis: Point, polygon: Point[]) {
  const dots = polygon.map((point) => point.x * axis.x + point.y * axis.y);
  return {
    min: Math.min(...dots),
    max: Math.max(...dots)
  };
}

function normalize(vector: Point) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

export function polygonsIntersect(a: Point[], b: Point[]) {
  return polygonsIntersectWithMode(a, b, true);
}

export function polygonsOverlap(a: Point[], b: Point[]) {
  return polygonsIntersectWithMode(a, b, false);
}

function polygonsIntersectWithMode(a: Point[], b: Point[], includeTouch: boolean) {
  const polygons = [a, b];
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const edge = { x: next.x - current.x, y: next.y - current.y };
      const axis = normalize({ x: -edge.y, y: edge.x });
      const projectionA = projectPolygon(axis, a);
      const projectionB = projectPolygon(axis, b);
      const separated = includeTouch
        ? projectionA.max < projectionB.min + EPSILON || projectionB.max < projectionA.min + EPSILON
        : projectionA.max <= projectionB.min + EPSILON || projectionB.max <= projectionA.min + EPSILON;
      if (separated) {
        return false;
      }
    }
  }

  return true;
}

function segmentsProperlyIntersect(p1: Point, q1: Point, p2: Point, q2: Point) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

export function roomContainsFurniture(project: PlannerProject, item: FurnitureObject) {
  if (!project.room || project.room.points.length < 3) {
    return true;
  }

  const room = project.room.points;
  const rect = getRotatedRectPoints(item, project.scalePxPerMm);
  const roomEdges = getRoomEdges(room);

  if (!rect.every((corner) => pointInPolygon(corner, room))) {
    return false;
  }

  for (let i = 0; i < rect.length; i += 1) {
    const a = rect[i];
    const b = rect[(i + 1) % rect.length];
    for (const edge of roomEdges) {
      if (segmentsProperlyIntersect(a, b, edge.start, edge.end)) {
        return false;
      }
    }
  }

  return true;
}

export function getWallPlacement(
  roomPoints: Point[],
  wallIndex: number,
  offset: number,
  objectWidthPx: number
) {
  const edge = getRoomEdges(roomPoints)[wallIndex];
  const safeOffset = Math.max(0, Math.min(edge.length - objectWidthPx, offset));
  const startRatio = edge.length === 0 ? 0 : safeOffset / edge.length;
  const endRatio = edge.length === 0 ? 0 : (safeOffset + objectWidthPx) / edge.length;
  const start = interpolate(edge.start, edge.end, startRatio);
  const end = interpolate(edge.start, edge.end, endRatio);
  const center = interpolate(edge.start, edge.end, (startRatio + endRatio) / 2);
  return {
    edge,
    start,
    end,
    center,
    offset: safeOffset
  };
}

function interpolate(a: Point, b: Point, ratio: number) {
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio
  };
}

export function getDoorSwingPolygon(
  roomPoints: Point[],
  door: DoorObject,
  scalePxPerMm: number
) {
  const widthPx = mmToPx(door.widthMm, scalePxPerMm);
  const placement = getWallPlacement(roomPoints, door.wallIndex, door.offset, widthPx);
  const hinge = door.swing === "clockwise" ? placement.end : placement.start;
  const closedEnd = door.swing === "clockwise" ? placement.start : placement.end;
  const closedVector = normalize({
    x: closedEnd.x - hinge.x,
    y: closedEnd.y - hinge.y
  });
  const closedAngle = Math.atan2(closedVector.y, closedVector.x);
  const interiorNormal = getInteriorNormal(roomPoints, placement.edge);
  const targetNormal =
    door.openDirection === "inward"
      ? interiorNormal
      : { x: -interiorNormal.x, y: -interiorNormal.y };
  const clockwiseVector = rotateVector90(closedVector, -1);
  const counterclockwiseVector = rotateVector90(closedVector, 1);
  const openVector =
    dot(clockwiseVector, targetNormal) > dot(counterclockwiseVector, targetNormal)
      ? clockwiseVector
      : counterclockwiseVector;
  const openAngle = Math.atan2(openVector.y, openVector.x);
  const steps = 12;
  const points: Point[] = [hinge];
  const deltaAngle = normalizeAngleDelta(openAngle - closedAngle);

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const angle = closedAngle + deltaAngle * t;
    points.push({
      x: hinge.x + Math.cos(angle) * widthPx,
      y: hinge.y + Math.sin(angle) * widthPx
    });
  }

  return {
    hinge,
    closedEnd,
    openEnd: {
      x: hinge.x + Math.cos(openAngle) * widthPx,
      y: hinge.y + Math.sin(openAngle) * widthPx
    },
    polygon: points,
    closedAngle,
    openAngle,
    arcAngle: (deltaAngle * 180) / Math.PI
  };
}

function getInteriorNormal(roomPoints: Point[], edge: ReturnType<typeof getRoomEdges>[number]) {
  const midpoint = interpolate(edge.start, edge.end, 0.5);
  const leftNormal = normalize({ x: -(edge.end.y - edge.start.y), y: edge.end.x - edge.start.x });
  const probeDistance = 18;
  const leftProbe = {
    x: midpoint.x + leftNormal.x * probeDistance,
    y: midpoint.y + leftNormal.y * probeDistance
  };

  if (pointInPolygon(leftProbe, roomPoints)) {
    return leftNormal;
  }

  return {
    x: -leftNormal.x,
    y: -leftNormal.y
  };
}

function rotateVector90(vector: Point, direction: 1 | -1) {
  return direction === 1
    ? { x: -vector.y, y: vector.x }
    : { x: vector.y, y: -vector.x };
}

function dot(a: Point, b: Point) {
  return a.x * b.x + a.y * b.y;
}

function normalizeAngleDelta(delta: number) {
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

export function getWindowSegment(roomPoints: Point[], windowObject: WindowObject, scalePxPerMm: number) {
  const widthPx = mmToPx(windowObject.widthMm, scalePxPerMm);
  return getWallPlacement(roomPoints, windowObject.wallIndex, windowObject.offset, widthPx);
}

export function getZoneRect(zone: ConstraintZone, scalePxPerMm: number) {
  return {
    x: zone.x,
    y: zone.y,
    width: mmToPx(zone.widthMm, scalePxPerMm),
    height: mmToPx(zone.depthMm, scalePxPerMm)
  };
}

function rectToPolygon(rect: { x: number; y: number; width: number; height: number }) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
}

export function detectCollisions(project: PlannerProject): CollisionIssue[] {
  const issues: CollisionIssue[] = [];

  for (let i = 0; i < project.furniture.length; i += 1) {
    const item = project.furniture[i];
    const itemPolygon = getRotatedRectPoints(item, project.scalePxPerMm);

    if (!roomContainsFurniture(project, item)) {
      issues.push({
        id: item.id,
        type: "furniture",
        kind: "wall-overflow",
        message: `${item.name} が部屋輪郭からはみ出しています`
      });
    }

    for (let j = i + 1; j < project.furniture.length; j += 1) {
      const other = project.furniture[j];
      const otherPolygon = getRotatedRectPoints(other, project.scalePxPerMm);
      if (polygonsOverlap(itemPolygon, otherPolygon)) {
        issues.push({
          id: item.id,
          type: "furniture",
          kind: "furniture-overlap",
          targetId: other.id,
          message: `${item.name} と ${other.name} が重なっています`
        });
        issues.push({
          id: other.id,
          type: "furniture",
          kind: "furniture-overlap",
          targetId: item.id,
          message: `${other.name} と ${item.name} が重なっています`
        });
      }
    }

    if (project.room) {
      for (const door of project.doors) {
        const swing = getDoorSwingPolygon(project.room.points, door, project.scalePxPerMm);
        if (polygonsOverlap(itemPolygon, swing.polygon)) {
          issues.push({
            id: item.id,
            type: "furniture",
            kind: "door-swing",
            targetId: door.id,
            message: `${item.name} が扉の可動範囲に入っています`
          });
        }
      }

      for (const zone of project.zones) {
        const zonePolygon = rectToPolygon(getZoneRect(zone, project.scalePxPerMm));
        if (polygonsOverlap(itemPolygon, zonePolygon)) {
          issues.push({
            id: item.id,
            type: "furniture",
            kind: "window-zone",
            targetId: zone.id,
            message: `${item.name} が窓前の制約ゾーンに入っています`
          });
        }
      }
    }
  }

  return issues;
}
