"use client";

import type { Stage as KonvaStage } from "konva/lib/Stage";
import { Image as KonvaImage, Arc, Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDoorSwingPolygon,
  getRoomEdges,
  getWindowSegment,
  getZoneRect,
  mmToPx
} from "@/lib/geometry";
import type {
  CollisionIssue,
  FurnitureKind,
  PlacementDraft,
  PlannerMode,
  PlannerProject,
  Point,
  Selection,
  SelectionItem,
  ViewportState
} from "@/lib/types";

type PlannerCanvasProps = {
  project: PlannerProject;
  issues: CollisionIssue[];
  draftRoomPoints: Point[];
  mode: PlannerMode;
  selection: Selection;
  selectedItems: SelectionItem[];
  scaleDraft: Point[];
  draftPlacement: PlacementDraft | null;
  viewport: ViewportState;
  onCanvasClick: (point: Point) => void;
  onCanvasPointerDown: (point: Point) => void;
  onCanvasMove: (point: Point) => void;
  onCanvasPointerUp: (point: Point) => void;
  onSelect: (selection: Selection, additive?: boolean) => void;
  onMoveFurniture: (id: string, x: number, y: number) => void;
  onPreviewRoomVertexMove: (index: number, point: Point) => void;
  onCommitRoomVertexMove: (index: number, point: Point) => void;
  onCommitRoomMove: (delta: Point) => void;
  onInsertRoomVertex: (edgeIndex: number, point: Point) => void;
  onPreviewZoneMove: (id: string, point: Point) => void;
  onCommitZoneMove: (id: string, point: Point) => void;
  onPreviewWallObjectMove: (type: "window" | "door", id: string, point: Point) => void;
  onCommitWallObjectMove: (type: "window" | "door", id: string, point: Point) => void;
  onViewportChange: (viewport: ViewportState) => void;
  onRotateSelectedFurniture: (delta: number) => void;
  onDuplicateSelectedFurniture: () => void;
  onDeleteSelection: () => void;
  onCenterSelection: () => void;
  onSetSelectedFurnitureKind: (kind: FurnitureKind) => void;
  onToggleSelectedDoorSwing: () => void;
  onToggleSelectedDoorOpenDirection: () => void;
  onResizeSelectedFurniture: (widthMm: number, depthMm: number) => void;
  onResizeSelectedZone: (widthMm: number, depthMm: number) => void;
};

function useBackgroundImage(dataUrl: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!dataUrl) {
      setImage(null);
      return;
    }

    let active = true;
    const nextImage = new window.Image();
    nextImage.onload = () => {
      if (active) {
        setImage(nextImage);
      }
    };
    nextImage.src = dataUrl;

    return () => {
      active = false;
    };
  }, [dataUrl]);

  return image;
}

export function PlannerCanvas({
  project,
  issues,
  draftRoomPoints,
  mode,
  selection,
  selectedItems,
  scaleDraft,
  draftPlacement,
  viewport,
  onCanvasClick,
  onCanvasPointerDown,
  onCanvasMove,
  onCanvasPointerUp,
  onSelect,
  onMoveFurniture,
  onPreviewRoomVertexMove,
  onCommitRoomVertexMove,
  onCommitRoomMove,
  onInsertRoomVertex,
  onPreviewZoneMove,
  onCommitZoneMove,
  onPreviewWallObjectMove,
  onCommitWallObjectMove,
  onViewportChange,
  onRotateSelectedFurniture,
  onDuplicateSelectedFurniture,
  onDeleteSelection,
  onCenterSelection,
  onSetSelectedFurnitureKind,
  onToggleSelectedDoorSwing,
  onToggleSelectedDoorOpenDirection,
  onResizeSelectedFurniture,
  onResizeSelectedZone
}: PlannerCanvasProps) {
  const stageRef = useRef<KonvaStage | null>(null);
  const interactionRef = useRef<"pan" | "object" | null>(null);
  const skipNextStagePointerUpRef = useRef(false);
  const backgroundImage = useBackgroundImage(project.background?.dataUrl ?? null);
  const [isStageDragging, setIsStageDragging] = useState(false);
  const [isObjectDragging, setIsObjectDragging] = useState(false);
  const [panState, setPanState] = useState<{
    pointerStart: Point;
    viewportStart: ViewportState;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: Exclude<Selection, null> | "canvas";
  } | null>(null);
  const issueMap = useMemo(() => {
    return issues.reduce<Record<string, CollisionIssue[]>>((accumulator, issue) => {
      accumulator[issue.id] ??= [];
      accumulator[issue.id].push(issue);
      return accumulator;
    }, {});
  }, [issues]);
  const room = project.room;
  const roomSelected = selection?.type === "room";
  const gridLines = useMemo(
    () => buildGrid(project.canvas.width, project.canvas.height, viewport.scale),
    [project.canvas.height, project.canvas.width, viewport.scale]
  );
  const roomEdges = useMemo(() => (room ? getRoomEdges(room.points) : []), [room]);
  const isSelected = (type: SelectionItem["type"], id: string) =>
    selectedItems.some((item) => item.type === type && item.id === id);
  const selectObject = (nextSelection: Exclude<Selection, null>, additive = false) => {
    onSelect(nextSelection, additive);
  };
  const roomCenter = useMemo(() => {
    if (!room || room.points.length === 0) return null;
    const xs = room.points.map((point) => point.x);
    const ys = room.points.map((point) => point.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2
    };
  }, [room]);
  const roomBounds = useMemo(() => {
    if (!room || room.points.length === 0) return null;
    const xs = room.points.map((point) => point.x);
    const ys = room.points.map((point) => point.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  }, [room]);
  const selectionAnchor = useMemo(() => {
    if (!selection) return null;
    switch (selection.type) {
      case "room":
        return roomCenter;
      case "furniture": {
        const item = project.furniture.find((entry) => entry.id === selection.id);
        return item ? { x: item.x, y: item.y } : null;
      }
      case "zone": {
        const item = project.zones.find((entry) => entry.id === selection.id);
        if (!item) return null;
        const rect = getZoneRect(item, project.scalePxPerMm);
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
      case "window": {
        if (!room) return null;
        const item = project.windows.find((entry) => entry.id === selection.id);
        if (!item) return null;
        return getWindowSegment(room.points, item, project.scalePxPerMm).center;
      }
      case "door": {
        if (!room) return null;
        const item = project.doors.find((entry) => entry.id === selection.id);
        if (!item) return null;
        return getDoorSwingPolygon(room.points, item, project.scalePxPerMm).hinge;
      }
      default:
        return null;
    }
  }, [project, room, roomCenter, selection]);
  const selectedFurniture = selection?.type === "furniture"
    ? project.furniture.find((entry) => entry.id === selection.id) ?? null
    : null;
  const selectedZone = selection?.type === "zone"
    ? project.zones.find((entry) => entry.id === selection.id) ?? null
    : null;
  const selectionBounds = useMemo(() => {
    if (!selection) return null;
    if (selection.type === "room" && room && roomBounds) {
      return roomBounds;
    }
    if (selection.type === "furniture" && selectedFurniture) {
      const width = mmToPx(selectedFurniture.widthMm, project.scalePxPerMm);
      const height = mmToPx(selectedFurniture.depthMm, project.scalePxPerMm);
      return {
        minX: selectedFurniture.x - width / 2,
        minY: selectedFurniture.y - height / 2,
        maxX: selectedFurniture.x + width / 2,
        maxY: selectedFurniture.y + height / 2
      };
    }
    if (selection.type === "zone" && selectedZone) {
      const rect = getZoneRect(selectedZone, project.scalePxPerMm);
      return { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
    }
    if (selectionAnchor) {
      return { minX: selectionAnchor.x, minY: selectionAnchor.y, maxX: selectionAnchor.x, maxY: selectionAnchor.y };
    }
    return null;
  }, [project.room, project.scalePxPerMm, roomBounds, selectedFurniture, selectedZone, selection, selectionAnchor]);
  const quickPanelStyle = selectionBounds
    ? getQuickToolbarPosition(selectionBounds, viewport, project.canvas)
    : null;

  const beginObjectInteraction = () => {
    interactionRef.current = "object";
    skipNextStagePointerUpRef.current = true;
    setIsObjectDragging(true);
    setPanState(null);
    setIsStageDragging(false);
  };

  const finishObjectInteraction = () => {
    interactionRef.current = null;
    setIsObjectDragging(false);
  };

  const beginPan = (pointer: Point) => {
    interactionRef.current = "pan";
    setPanState({
      pointerStart: { x: pointer.x, y: pointer.y },
      viewportStart: viewport
    });
    setIsStageDragging(true);
  };

  const finishPan = () => {
    if (interactionRef.current === "pan") {
      interactionRef.current = null;
    }
    setPanState(null);
    setIsStageDragging(false);
  };

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    const onMouseUp = () => {
      interactionRef.current = null;
      setIsObjectDragging(false);
      setPanState(null);
      setIsStageDragging(false);
    };

    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const cursorClass =
    mode === "trace-room" || mode === "set-scale" || mode === "add-furniture" || mode === "add-zone"
      ? "cursor-crosshair"
      : isStageDragging
        ? "cursor-grabbing"
        : "cursor-grab";

  return (
    <div className="panel h-full overflow-hidden p-3">
      <div className="mb-3 flex items-center justify-between px-2">
        <div>
          <div className="panel-title">2D Canvas</div>
          <div className="mt-1 text-sm text-slate-600">
            モード: <span className="font-semibold text-slate-900">{modeLabel(mode)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-600">
          <button className="button-soft" onClick={() => onViewportChange({ ...viewport, scale: Math.max(0.35, viewport.scale / 1.2) })}>
            -
          </button>
          <button className="button-soft" onClick={() => onViewportChange({ ...viewport, scale: Math.min(3.5, viewport.scale * 1.2) })}>
            +
          </button>
          <button className="button-soft" onClick={() => onViewportChange({ x: 0, y: 0, scale: 1 })}>
            100%
          </button>
          <input
            className="w-24 accent-cyan-600"
            type="range"
            min="35"
            max="350"
            step="5"
            value={Math.round(viewport.scale * 100)}
            onChange={(event) =>
              onViewportChange({
                ...viewport,
                scale: Number(event.target.value) / 100
              })
            }
          />
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            1px = {project.scalePxPerMm > 0 ? `${(1 / project.scalePxPerMm).toFixed(1)} mm` : "-"}
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Zoom {Math.round(viewport.scale * 100)}%
          </div>
        </div>
      </div>

      <div className={`relative overflow-auto rounded-[28px] border border-slate-200 bg-[#f4f6fa] ${cursorClass}`}>
        <Stage
          ref={stageRef}
          width={project.canvas.width}
          height={project.canvas.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          onWheel={(event) => {
            event.evt.preventDefault();
            const stage = stageRef.current;
            if (!stage) return;
            const oldScale = viewport.scale;
            const pointer = stage.getPointerPosition();
            if (!pointer) return;
            const zoomDirection = event.evt.deltaY > 0 ? 1 : -1;
            const scaleBy = 1.08;
            const nextScale =
              zoomDirection > 0 ? Math.max(0.35, oldScale / scaleBy) : Math.min(3.5, oldScale * scaleBy);
            const worldPoint = {
              x: (pointer.x - viewport.x) / oldScale,
              y: (pointer.y - viewport.y) / oldScale
            };
            onViewportChange({
              scale: nextScale,
              x: pointer.x - worldPoint.x * nextScale,
              y: pointer.y - worldPoint.y * nextScale
            });
          }}
          onMouseDown={(event) => {
            setContextMenu(null);
            const stage = event.target.getStage();
            const pointer = stage?.getPointerPosition();
            if (!pointer) return;
            const point = pointer
              ? {
                  x: (pointer.x - viewport.x) / viewport.scale,
                  y: (pointer.y - viewport.y) / viewport.scale
                }
              : null;
            if (!point) return;
            const attrs = (event.target as {
              attrs?: { objectId?: string; objectType?: Exclude<Selection, null>["type"] };
            }).attrs;

            if (attrs?.objectId && attrs.objectType) {
              finishPan();
              onSelect({ type: attrs.objectType, id: attrs.objectId }, event.evt.shiftKey);
              return;
            }

            if (mode === "select" && interactionRef.current !== "object") {
              beginPan(pointer);
            }
            onCanvasPointerDown(point);
            onSelect(null, event.evt.shiftKey);
            if (mode !== "add-furniture" && mode !== "add-zone") {
              onCanvasClick(point);
            }
          }}
          onMouseMove={(event) => {
            const stage = event.target.getStage();
            const pointer = stage?.getPointerPosition();
            if (!pointer) return;
            const point = pointer
              ? {
                  x: (pointer.x - viewport.x) / viewport.scale,
                  y: (pointer.y - viewport.y) / viewport.scale
                }
              : null;
            if (!point) return;
            if (panState && interactionRef.current === "pan") {
              onViewportChange({
                ...panState.viewportStart,
                x: panState.viewportStart.x + (pointer.x - panState.pointerStart.x),
                y: panState.viewportStart.y + (pointer.y - panState.pointerStart.y)
              });
            }
            onCanvasMove(point);
          }}
          onMouseUp={(event) => {
            const stage = event.target.getStage();
            const pointer = stage?.getPointerPosition();
            if (!pointer) return;
            const point = pointer
              ? {
                  x: (pointer.x - viewport.x) / viewport.scale,
                  y: (pointer.y - viewport.y) / viewport.scale
                }
              : null;
            if (!point) return;
            finishPan();
            if (skipNextStagePointerUpRef.current) {
              skipNextStagePointerUpRef.current = false;
              return;
            }
            if (interactionRef.current !== "object") {
              onCanvasPointerUp(point);
            }
          }}
          onMouseLeave={() => {
            finishPan();
          }}
          onContextMenu={(event) => {
            event.evt.preventDefault();
            const stage = event.target.getStage();
            const pointer = stage?.getPointerPosition();
            if (!pointer) return;
            const attrs = (event.target as {
              attrs?: { objectId?: string; objectType?: Exclude<Selection, null>["type"] };
            }).attrs;

            if (attrs?.objectId && attrs.objectType) {
              const nextSelection = { type: attrs.objectType, id: attrs.objectId } as Exclude<Selection, null>;
              onSelect(nextSelection, false);
              setContextMenu({ x: pointer.x, y: pointer.y, target: nextSelection });
              return;
            }

            setContextMenu({ x: pointer.x, y: pointer.y, target: "canvas" });
          }}
        >
          <Layer listening={false}>
            {gridLines.vertical.map((x) => (
              <Line key={`vx-${x}`} points={[x, 0, x, project.canvas.height]} stroke="#d8dee8" strokeWidth={x % 500 === 0 ? 1.4 : 0.8} />
            ))}
            {gridLines.horizontal.map((y) => (
              <Line key={`hy-${y}`} points={[0, y, project.canvas.width, y]} stroke="#d8dee8" strokeWidth={y % 500 === 0 ? 1.4 : 0.8} />
            ))}
          </Layer>

          <Layer listening={Boolean(project.background && !project.background.locked)}>
            {project.background && project.background.visible && backgroundImage ? (
              <KonvaImage
                image={backgroundImage}
                x={0}
                y={0}
                width={project.background.width}
                height={project.background.height}
                opacity={project.background.opacity}
              />
            ) : null}
          </Layer>

          <Layer>
            {room ? (
              <Group
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  selectObject({ type: "room", id: room.id }, event.evt.shiftKey);
                }}
              >
                {roomBounds ? (
                  <Group
                    clipFunc={(context) => {
                      context.beginPath();
                      room.points.forEach((point, index) => {
                        if (index === 0) {
                          context.moveTo(point.x, point.y);
                        } else {
                          context.lineTo(point.x, point.y);
                        }
                      });
                      context.closePath();
                    }}
                    listening={false}
                  >
                    <Rect
                      x={roomBounds.minX}
                      y={roomBounds.minY}
                      width={roomBounds.maxX - roomBounds.minX}
                      height={roomBounds.maxY - roomBounds.minY}
                      fill="#cda677"
                      opacity={project.floorOpacity}
                    />
                    {renderRoomFloorPattern(roomBounds, project.floorOpacity)}
                    <Rect
                      x={roomBounds.minX}
                      y={roomBounds.minY}
                      width={roomBounds.maxX - roomBounds.minX}
                      height={roomBounds.maxY - roomBounds.minY}
                      fill="rgba(255,255,255,0.05)"
                      opacity={project.floorOpacity}
                    />
                  </Group>
                ) : null}
                <Line
                  points={room.points.flatMap((point) => [point.x, point.y])}
                  closed
                  fill="rgba(255,255,255,0.04)"
                  stroke={roomSelected ? "#0f172a" : "#64748b"}
                  strokeWidth={roomSelected ? 16 : 14}
                  lineJoin="round"
                  lineCap="round"
                />
                <Line
                  points={room.points.flatMap((point) => [point.x, point.y])}
                  closed
                  fill="rgba(255,255,255,0.72)"
                  stroke={roomSelected ? "#1e293b" : "#334155"}
                  strokeWidth={roomSelected ? 6 : 5}
                  dash={[2, 0]}
                  lineJoin="round"
                  lineCap="round"
                  objectType="room"
                  objectId={room.id}
                />
                {room.points.map((point, index) => (
                  <Group key={`room-point-${index}`}>
                    <Circle
                      x={point.x}
                      y={point.y}
                      radius={roomSelected ? 8 : 5}
                      fill={roomSelected ? "#0f172a" : "#64748b"}
                      opacity={roomSelected ? 1 : 0.9}
                      draggable={roomSelected}
                      onMouseDown={(event) => {
                        event.cancelBubble = true;
                        selectObject({ type: "room", id: room.id }, event.evt.shiftKey);
                      }}
                      onDragStart={() => {
                        beginObjectInteraction();
                      }}
                      onDragMove={(event) => {
                        onPreviewRoomVertexMove(index, { x: event.target.x(), y: event.target.y() });
                      }}
                      onDragEnd={(event) => {
                        finishObjectInteraction();
                        onCommitRoomVertexMove(index, { x: event.target.x(), y: event.target.y() });
                      }}
                    />
                    {roomSelected ? (
                      <Text x={point.x + 10} y={point.y - 10} text={`${index + 1}`} fontSize={12} fill="#334155" />
                    ) : null}
                  </Group>
                ))}
                {roomSelected
                  ? roomEdges.map((edge) => (
                      <Group key={`room-edge-handle-${edge.index}`}>
                        <Circle
                          x={(edge.start.x + edge.end.x) / 2}
                          y={(edge.start.y + edge.end.y) / 2}
                          radius={9}
                          fill="#ffffff"
                          stroke="#0f172a"
                          strokeWidth={2}
                          onMouseDown={(event) => {
                            event.cancelBubble = true;
                            selectObject({ type: "room", id: room.id }, event.evt.shiftKey);
                            onInsertRoomVertex(edge.index, {
                              x: (edge.start.x + edge.end.x) / 2,
                              y: (edge.start.y + edge.end.y) / 2
                            });
                          }}
                        />
                        <Line
                          points={[
                            (edge.start.x + edge.end.x) / 2 - 5,
                            (edge.start.y + edge.end.y) / 2,
                            (edge.start.x + edge.end.x) / 2 + 5,
                            (edge.start.y + edge.end.y) / 2
                          ]}
                          stroke="#0f172a"
                          strokeWidth={1.5}
                          lineCap="round"
                          lineJoin="round"
                        />
                        <Line
                          points={[
                            (edge.start.x + edge.end.x) / 2,
                            (edge.start.y + edge.end.y) / 2 - 5,
                            (edge.start.x + edge.end.x) / 2,
                            (edge.start.y + edge.end.y) / 2 + 5
                          ]}
                          stroke="#0f172a"
                          strokeWidth={1.5}
                          lineCap="round"
                          lineJoin="round"
                        />
                      </Group>
                    ))
                  : null}
                {roomSelected && roomCenter ? (
                  <Group
                    x={roomCenter.x}
                    y={roomCenter.y}
                    draggable
                    onMouseDown={(event) => {
                      event.cancelBubble = true;
                      selectObject({ type: "room", id: room.id }, event.evt.shiftKey);
                    }}
                    onDragStart={() => {
                      beginObjectInteraction();
                    }}
                    onDragEnd={(event) => {
                      finishObjectInteraction();
                      onCommitRoomMove({
                        x: event.target.x() - roomCenter.x,
                        y: event.target.y() - roomCenter.y
                      });
                      event.target.position({ x: roomCenter.x, y: roomCenter.y });
                    }}
                  >
                    <Circle radius={16} fill="#ffffff" stroke="#0f172a" strokeWidth={2} />
                    <Line points={[-7, 0, 7, 0]} stroke="#0f172a" strokeWidth={2} lineCap="round" />
                    <Line points={[0, -7, 0, 7]} stroke="#0f172a" strokeWidth={2} lineCap="round" />
                    <Text x={20} y={-8} text="部屋を移動" fontSize={12} fill="#0f172a" />
                  </Group>
                ) : null}
                {roomEdges.map((edge) => (
                  <Text
                    key={`edge-label-${edge.index}`}
                    x={(edge.start.x + edge.end.x) / 2 - 42}
                    y={(edge.start.y + edge.end.y) / 2 - 18}
                    text={`${Math.round(edge.length / project.scalePxPerMm)} mm`}
                    fontSize={12}
                    fill="#64748b"
                    rotation={(edge.angle * 180) / Math.PI}
                    listening={false}
                  />
                ))}
              </Group>
            ) : null}

            {draftRoomPoints.length > 0 ? (
              <>
                <Line
                  points={draftRoomPoints.flatMap((point) => [point.x, point.y])}
                  stroke="#0f766e"
                  strokeWidth={3}
                  dash={[8, 8]}
                />
                {draftRoomPoints.map((point, index) => (
                  <Circle key={`draft-${index}`} x={point.x} y={point.y} radius={6} fill="#0f766e" />
                ))}
              </>
            ) : null}
          </Layer>

          <Layer>
            {room
              ? project.windows.map((windowObject) => {
                  const placement = getWindowSegment(room.points, windowObject, project.scalePxPerMm);
                  const selected = isSelected("window", windowObject.id);
                  return (
                    <Group
                      key={windowObject.id}
                      x={placement.center.x}
                      y={placement.center.y}
                      draggable
                      onMouseDown={(event) => {
                        event.cancelBubble = true;
                        selectObject({ type: "window", id: windowObject.id }, event.evt.shiftKey);
                      }}
                      onDragStart={() => {
                        beginObjectInteraction();
                      }}
                      onDragMove={(event) => {
                        const nextPoint = { x: event.target.x(), y: event.target.y() };
                        onPreviewWallObjectMove("window", windowObject.id, nextPoint);
                      }}
                      onDragEnd={(event) => {
                        finishObjectInteraction();
                        const nextPoint = { x: event.target.x(), y: event.target.y() };
                        onCommitWallObjectMove("window", windowObject.id, nextPoint);
                      }}
                    >
                      <Line
                        points={[
                          placement.start.x - placement.center.x,
                          placement.start.y - placement.center.y,
                          placement.end.x - placement.center.x,
                          placement.end.y - placement.center.y
                        ]}
                        stroke={selected ? "#0f172a" : "#1d4ed8"}
                        strokeWidth={12}
                        lineCap="round"
                        objectType="window"
                        objectId={windowObject.id}
                      />
                      <Line
                        points={[
                          placement.start.x - placement.center.x,
                          placement.start.y - placement.center.y,
                          placement.end.x - placement.center.x,
                          placement.end.y - placement.center.y
                        ]}
                        stroke="#dbeafe"
                        strokeWidth={7}
                        lineCap="round"
                      />
                      <Line
                        points={[
                          (placement.start.x - placement.center.x) * 0.35,
                          (placement.start.y - placement.center.y) * 0.35,
                          (placement.end.x - placement.center.x) * 0.35,
                          (placement.end.y - placement.center.y) * 0.35
                        ]}
                        stroke="#93c5fd"
                        strokeWidth={16}
                        lineCap="round"
                      />
                      <Text
                        x={-36}
                        y={-26}
                        text={`窓 ${project.windows.findIndex((entry) => entry.id === windowObject.id) + 1}`}
                        fill="#0369a1"
                        fontSize={14}
                        fontStyle="bold"
                      />
                    </Group>
                  );
                })
              : null}

            {project.zones.map((zone) => {
              const rect = getZoneRect(zone, project.scalePxPerMm);
              const selected = isSelected("zone", zone.id);
              return (
                <Group
                  key={zone.id}
                  draggable
                  x={0}
                  y={0}
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                    selectObject({ type: "zone", id: zone.id }, event.evt.shiftKey);
                  }}
                  onDragStart={() => {
                    beginObjectInteraction();
                  }}
                  onDragMove={(event) => {
                    onPreviewZoneMove(zone.id, { x: event.target.x() + rect.x, y: event.target.y() + rect.y });
                    event.target.position({ x: 0, y: 0 });
                  }}
                  onDragEnd={(event) => {
                    finishObjectInteraction();
                    onCommitZoneMove(zone.id, { x: event.target.x() + rect.x, y: event.target.y() + rect.y });
                    event.target.position({ x: 0, y: 0 });
                  }}
                >
                  <Rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill="rgba(245, 158, 11, 0.18)"
                    stroke={selected ? "#b45309" : "#f59e0b"}
                    strokeWidth={selected ? 3 : 2}
                    dash={[10, 6]}
                    objectType="zone"
                    objectId={zone.id}
                  />
                  <Text x={rect.x + 10} y={rect.y + 10} text="窓前制約" fontSize={13} fill="#92400e" />
                </Group>
              );
            })}

            {room
              ? project.doors.map((door) => {
                  const swing = getDoorSwingPolygon(room.points, door, project.scalePxPerMm);
                  const selected = isSelected("door", door.id);
                  const radius = mmToPx(door.widthMm, project.scalePxPerMm);
                  return (
                    <Group
                      key={door.id}
                      x={swing.hinge.x}
                      y={swing.hinge.y}
                      draggable
                      onMouseDown={(event) => {
                        event.cancelBubble = true;
                        selectObject({ type: "door", id: door.id }, event.evt.shiftKey);
                      }}
                      onDragStart={() => {
                        beginObjectInteraction();
                      }}
                      onDragMove={(event) => {
                        const nextPoint = { x: event.target.x(), y: event.target.y() };
                        onPreviewWallObjectMove("door", door.id, nextPoint);
                      }}
                      onDragEnd={(event) => {
                        finishObjectInteraction();
                        const nextPoint = { x: event.target.x(), y: event.target.y() };
                        onCommitWallObjectMove("door", door.id, nextPoint);
                      }}
                    >
                      {selected ? (
                        <Group x={42} y={-58}>
                          <Rect width={56} height={24} fill="#ffffff" stroke="#7c2d12" strokeWidth={1.5} cornerRadius={8} onMouseDown={(event) => {
                            event.cancelBubble = true;
                            onToggleSelectedDoorSwing();
                          }} />
                          <Text x={10} y={6} text={door.swing === "clockwise" ? "終点側" : "始点側"} fontSize={11} fill="#7c2d12" />
                          <Rect y={30} width={56} height={24} fill="#ffffff" stroke={door.openDirection === "inward" ? "#1d4ed8" : "#9a3412"} strokeWidth={1.5} cornerRadius={8} onMouseDown={(event) => {
                            event.cancelBubble = true;
                            onToggleSelectedDoorOpenDirection();
                          }} />
                          <Text x={17} y={36} text={door.openDirection === "inward" ? "内開き" : "外開き"} fontSize={11} fill={door.openDirection === "inward" ? "#1d4ed8" : "#9a3412"} />
                        </Group>
                      ) : null}
                      <Line
                        points={[0, 0, swing.closedEnd.x - swing.hinge.x, swing.closedEnd.y - swing.hinge.y]}
                        stroke={selected ? "#0f172a" : "#7c2d12"}
                        strokeWidth={6}
                        lineCap="round"
                        objectType="door"
                        objectId={door.id}
                      />
                      <Line
                        points={[0, 0, swing.openEnd.x - swing.hinge.x, swing.openEnd.y - swing.hinge.y]}
                        stroke="#c2410c"
                        strokeWidth={4}
                        opacity={0.88}
                        lineCap="round"
                      />
                      <Arc
                        x={0}
                        y={0}
                        innerRadius={radius - 1}
                        outerRadius={radius + 1}
                        angle={Math.abs(swing.arcAngle)}
                        rotation={(Math.min(swing.closedAngle, swing.openAngle) * 180) / Math.PI}
                        stroke={door.openDirection === "inward" ? "#2563eb" : "#c2410c"}
                        fill={door.openDirection === "inward" ? "rgba(59,130,246,0.14)" : "rgba(249,115,22,0.12)"}
                      />
                      <Text
                        x={12}
                        y={8}
                        text={`扉 ${project.doors.findIndex((entry) => entry.id === door.id) + 1} ${door.openDirection === "inward" ? "内" : "外"}`}
                        fontSize={13}
                        fill={door.openDirection === "inward" ? "#1d4ed8" : "#9a3412"}
                        fontStyle="bold"
                      />
                    </Group>
                  );
                })
              : null}
          </Layer>

          <Layer>
            {project.furniture.map((item) => {
              const width = mmToPx(item.widthMm, project.scalePxPerMm);
              const height = mmToPx(item.depthMm, project.scalePxPerMm);
              const selected = isSelected("furniture", item.id);
              const hasIssue = Boolean(issueMap[item.id]?.length);
              const furnitureStyle = getFurnitureStyle(item.kind, item.name);
              return (
                <Group
                  key={item.id}
                  x={item.x}
                  y={item.y}
                  rotation={item.rotation}
                  draggable
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                    selectObject({ type: "furniture", id: item.id }, event.evt.shiftKey);
                  }}
                  onDragStart={() => {
                    beginObjectInteraction();
                  }}
                  onDragEnd={(event) => {
                    finishObjectInteraction();
                    onMoveFurniture(item.id, event.target.x(), event.target.y());
                  }}
                >
                  <Rect
                    x={-width / 2}
                    y={-height / 2}
                    width={width}
                    height={height}
                    fill={hasIssue ? "rgba(244,63,94,0.14)" : furnitureStyle.fill}
                    stroke={hasIssue ? "#e11d48" : selected ? "#0f172a" : furnitureStyle.stroke}
                    strokeWidth={selected ? 3 : 2}
                    cornerRadius={furnitureStyle.cornerRadius}
                    objectType="furniture"
                    objectId={item.id}
                  />
                  {furnitureStyle.inset ? (
                    <Rect
                      x={-width / 2 + furnitureStyle.inset}
                      y={-height / 2 + furnitureStyle.inset}
                      width={Math.max(18, width - furnitureStyle.inset * 2)}
                      height={Math.max(18, height - furnitureStyle.inset * 2)}
                      fill={furnitureStyle.innerFill}
                      cornerRadius={Math.max(6, furnitureStyle.cornerRadius - 4)}
                      opacity={0.9}
                    />
                  ) : null}
                  {renderFurnitureIcon(furnitureStyle.kind, width, height, hasIssue ? "#e11d48" : furnitureStyle.iconStroke)}
                  <Text
                    x={-width / 2 + 12}
                    y={-height / 2 + 10}
                    width={width - 24}
                    text={item.name}
                    fontSize={15}
                    fontStyle="bold"
                    fill="#0f172a"
                    listening={false}
                  />
                  {hasIssue ? (
                    <Text
                      x={-width / 2 + 12}
                      y={height / 2 - 26}
                      width={width - 24}
                      text="干渉あり"
                      fontSize={12}
                      fill="#be123c"
                      align="right"
                      listening={false}
                    />
                  ) : null}
                </Group>
              );
            })}
          </Layer>

          <Layer listening={false}>
            {selectedItems.filter((item) => item.type === "furniture").length > 0
              ? project.furniture
                  .filter((item) => isSelected("furniture", item.id))
                  .map((item) => {
                    const width = mmToPx(item.widthMm, project.scalePxPerMm);
                    const height = mmToPx(item.depthMm, project.scalePxPerMm);
                    return (
                      <Group key={`measure-furniture-${item.id}`} x={item.x} y={item.y} rotation={item.rotation}>
                        <Line
                          points={[-width / 2, -height / 2 - 20, width / 2, -height / 2 - 20]}
                          stroke="#0f172a"
                          strokeWidth={1.5}
                          dash={[6, 4]}
                        />
                        <Line points={[-width / 2, -height / 2 - 12, -width / 2, -height / 2 - 28]} stroke="#0f172a" strokeWidth={1.5} />
                        <Line points={[width / 2, -height / 2 - 12, width / 2, -height / 2 - 28]} stroke="#0f172a" strokeWidth={1.5} />
                        <Text x={-52} y={-height / 2 - 42} width={104} align="center" text={`${item.widthMm} mm`} fontSize={12} fill="#0f172a" />
                        <Line
                          points={[width / 2 + 20, -height / 2, width / 2 + 20, height / 2]}
                          stroke="#0f172a"
                          strokeWidth={1.5}
                          dash={[6, 4]}
                        />
                        <Line points={[width / 2 + 12, -height / 2, width / 2 + 28, -height / 2]} stroke="#0f172a" strokeWidth={1.5} />
                        <Line points={[width / 2 + 12, height / 2, width / 2 + 28, height / 2]} stroke="#0f172a" strokeWidth={1.5} />
                        <Text x={width / 2 + 30} y={-8} text={`${item.depthMm} mm`} fontSize={12} fill="#0f172a" />
                      </Group>
                    );
                  })
              : null}

            {selectedItems.filter((item) => item.type === "zone").length > 0
              ? project.zones
                  .filter((zone) => isSelected("zone", zone.id))
                  .map((zone) => {
                    const rect = getZoneRect(zone, project.scalePxPerMm);
                    return (
                      <Group key={`measure-zone-${zone.id}`}>
                        <Line
                          points={[rect.x, rect.y - 18, rect.x + rect.width, rect.y - 18]}
                          stroke="#92400e"
                          strokeWidth={1.5}
                          dash={[6, 4]}
                        />
                        <Text x={rect.x + rect.width / 2 - 45} y={rect.y - 38} width={90} align="center" text={`${zone.widthMm} mm`} fontSize={12} fill="#92400e" />
                        <Line
                          points={[rect.x + rect.width + 18, rect.y, rect.x + rect.width + 18, rect.y + rect.height]}
                          stroke="#92400e"
                          strokeWidth={1.5}
                          dash={[6, 4]}
                        />
                        <Text x={rect.x + rect.width + 26} y={rect.y + rect.height / 2 - 6} text={`${zone.depthMm} mm`} fontSize={12} fill="#92400e" />
                      </Group>
                    );
                  })
              : null}

            {selectedItems.filter((item) => item.type === "window").length > 0 && room
              ? project.windows
                  .filter((windowObject) => isSelected("window", windowObject.id))
                  .map((windowObject) => {
                    const placement = getWindowSegment(room.points, windowObject, project.scalePxPerMm);
                    return (
                      <Group key={`measure-window-${windowObject.id}`}>
                        <Line
                          points={[placement.start.x, placement.start.y - 16, placement.end.x, placement.end.y - 16]}
                          stroke="#0369a1"
                          strokeWidth={1.5}
                          dash={[6, 4]}
                        />
                        <Text
                          x={placement.center.x - 48}
                          y={placement.center.y - 38}
                          width={96}
                          align="center"
                          text={`${windowObject.widthMm} mm`}
                          fontSize={12}
                          fill="#0369a1"
                        />
                      </Group>
                    );
                  })
              : null}

            {selectedItems.filter((item) => item.type === "door").length > 0 && room
              ? project.doors
                  .filter((door) => isSelected("door", door.id))
                  .map((door) => {
                    const swing = getDoorSwingPolygon(room.points, door, project.scalePxPerMm);
                    return (
                      <Text
                        key={`measure-door-${door.id}`}
                        x={swing.hinge.x + 16}
                        y={swing.hinge.y - 22}
                        text={`${door.widthMm} mm`}
                        fontSize={12}
                        fill="#1d4ed8"
                      />
                    );
                  })
              : null}
          </Layer>

          <Layer listening={false}>
            {scaleDraft.map((point, index) => (
              <Circle key={`scale-${index}`} x={point.x} y={point.y} radius={6} fill="#7c3aed" />
            ))}
            {scaleDraft.length === 2 ? (
              <Line
                points={[scaleDraft[0].x, scaleDraft[0].y, scaleDraft[1].x, scaleDraft[1].y]}
                stroke="#7c3aed"
                strokeWidth={3}
                dash={[10, 6]}
              />
            ) : null}

            {draftPlacement ? (
              <>
                <Rect
                  x={Math.min(draftPlacement.start.x, draftPlacement.end.x)}
                  y={Math.min(draftPlacement.start.y, draftPlacement.end.y)}
                  width={Math.abs(draftPlacement.end.x - draftPlacement.start.x)}
                  height={Math.abs(draftPlacement.end.y - draftPlacement.start.y)}
                  fill={draftPlacement.kind === "furniture" ? "rgba(15,23,42,0.08)" : "rgba(245,158,11,0.14)"}
                  stroke={draftPlacement.kind === "furniture" ? "#0f172a" : "#b45309"}
                  strokeWidth={2}
                  dash={[8, 6]}
                />
                <Text
                  x={Math.min(draftPlacement.start.x, draftPlacement.end.x) + 8}
                  y={Math.min(draftPlacement.start.y, draftPlacement.end.y) - 20}
                  text={draftPlacement.kind === "furniture" ? "家具プレビュー" : "制約ゾーンプレビュー"}
                  fontSize={12}
                  fill={draftPlacement.kind === "furniture" ? "#0f172a" : "#92400e"}
                />
                <Text
                  x={Math.min(draftPlacement.start.x, draftPlacement.end.x) + 8}
                  y={Math.min(draftPlacement.start.y, draftPlacement.end.y) - 4}
                  text={`${Math.round(Math.abs(draftPlacement.end.x - draftPlacement.start.x) / project.scalePxPerMm)} x ${Math.round(Math.abs(draftPlacement.end.y - draftPlacement.start.y) / project.scalePxPerMm)} mm`}
                  fontSize={12}
                  fill={draftPlacement.kind === "furniture" ? "#0f172a" : "#92400e"}
                />
              </>
            ) : null}
          </Layer>

          <Layer>
            {selectedFurniture ? (
              <Group x={selectedFurniture.x} y={selectedFurniture.y} rotation={selectedFurniture.rotation}>
                <Line
                  points={[
                    0,
                    -mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 12,
                    0,
                    -mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 34
                  ]}
                  stroke="#0f172a"
                  strokeWidth={1.5}
                />
                <Circle
                  x={0}
                  y={-mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 34}
                  radius={15}
                  fill="#ffffff"
                  stroke="#0f172a"
                  strokeWidth={2}
                  draggable
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                  }}
                  onDragStart={() => {
                    beginObjectInteraction();
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true;
                    const angle = Math.atan2(event.target.y(), event.target.x());
                    const rawRotation = (angle * 180) / Math.PI + 90;
                    const rotation = Math.round(rawRotation / 15) * 15;
                    onRotateSelectedFurniture(rotation - selectedFurniture.rotation);
                  }}
                  onDragEnd={(event) => {
                    finishObjectInteraction();
                    event.target.position({
                      x: 0,
                      y: -mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 34
                    });
                  }}
                />
                <Text
                  x={-6}
                  y={-mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 42}
                  text="R"
                  fontSize={13}
                  fontStyle="bold"
                  fill="#0f172a"
                  listening={false}
                />
                <Rect
                  x={mmToPx(selectedFurniture.widthMm, project.scalePxPerMm) / 2 - 11}
                  y={-9}
                  width={22}
                  height={18}
                  fill="#e0f2fe"
                  stroke="#0369a1"
                  strokeWidth={2}
                  cornerRadius={5}
                  draggable
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                  }}
                  onDragStart={() => {
                    beginObjectInteraction();
                  }}
                  onDragMove={(event) => {
                    const localX = event.target.x();
                    const widthMm = Math.max(200, Math.round((Math.abs(localX) + 11) * 2 / project.scalePxPerMm));
                    onResizeSelectedFurniture(widthMm, selectedFurniture.depthMm);
                  }}
                  onDragEnd={(event) => {
                    finishObjectInteraction();
                    event.target.position({
                      x: mmToPx(selectedFurniture.widthMm, project.scalePxPerMm) / 2 - 11,
                      y: -9
                    });
                  }}
                />
                <Text x={mmToPx(selectedFurniture.widthMm, project.scalePxPerMm) / 2 - 5} y={-6} text="W" fontSize={10} fill="#075985" listening={false} />
                <Rect
                  x={-9}
                  y={mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 11}
                  width={18}
                  height={22}
                  fill="#e0f2fe"
                  stroke="#0369a1"
                  strokeWidth={2}
                  cornerRadius={5}
                  draggable
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                  }}
                  onDragStart={() => {
                    beginObjectInteraction();
                  }}
                  onDragMove={(event) => {
                    const localY = event.target.y();
                    const depthMm = Math.max(200, Math.round((Math.abs(localY) + 11) * 2 / project.scalePxPerMm));
                    onResizeSelectedFurniture(selectedFurniture.widthMm, depthMm);
                  }}
                  onDragEnd={(event) => {
                    finishObjectInteraction();
                    event.target.position({
                      x: -9,
                      y: mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 11
                    });
                  }}
                />
                <Text x={-4} y={mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 4} text="D" fontSize={10} fill="#075985" listening={false} />
                <Rect
                  x={mmToPx(selectedFurniture.widthMm, project.scalePxPerMm) / 2 - 11}
                  y={mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 11}
                  width={22}
                  height={22}
                  fill="#ffffff"
                  stroke="#0f172a"
                  strokeWidth={2}
                  cornerRadius={5}
                  draggable
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                  }}
                  onDragStart={() => {
                    beginObjectInteraction();
                  }}
                  onDragMove={(event) => {
                    const localX = event.target.x();
                    const localY = event.target.y();
                    const widthMm = Math.max(200, Math.round((Math.abs(localX) + 11) * 2 / project.scalePxPerMm));
                    const depthMm = Math.max(200, Math.round((Math.abs(localY) + 11) * 2 / project.scalePxPerMm));
                    onResizeSelectedFurniture(widthMm, depthMm);
                  }}
                  onDragEnd={(event) => {
                    finishObjectInteraction();
                    event.target.position({
                      x: mmToPx(selectedFurniture.widthMm, project.scalePxPerMm) / 2 - 11,
                      y: mmToPx(selectedFurniture.depthMm, project.scalePxPerMm) / 2 - 11
                    });
                  }}
                />
              </Group>
            ) : null}
            {selectedZone ? (
              <Group>
                <Rect
                  x={getZoneRect(selectedZone, project.scalePxPerMm).x + getZoneRect(selectedZone, project.scalePxPerMm).width - 11}
                  y={getZoneRect(selectedZone, project.scalePxPerMm).y + getZoneRect(selectedZone, project.scalePxPerMm).height / 2 - 9}
                  width={22}
                  height={18}
                  fill="#fef3c7"
                  stroke="#b45309"
                  strokeWidth={2}
                  cornerRadius={5}
                  draggable
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                  }}
                  onDragStart={() => {
                    beginObjectInteraction();
                  }}
                  onDragMove={(event) => {
                    const rect = getZoneRect(selectedZone, project.scalePxPerMm);
                    const widthMm = Math.max(200, Math.round((event.target.x() + 11 - rect.x) / project.scalePxPerMm));
                    onResizeSelectedZone(widthMm, selectedZone.depthMm);
                  }}
                  onDragEnd={(event) => {
                    finishObjectInteraction();
                    const rect = getZoneRect(selectedZone, project.scalePxPerMm);
                    event.target.position({
                      x: rect.x + rect.width - 11,
                      y: rect.y + rect.height / 2 - 9
                    });
                  }}
                />
                <Rect
                  x={getZoneRect(selectedZone, project.scalePxPerMm).x + getZoneRect(selectedZone, project.scalePxPerMm).width / 2 - 9}
                  y={getZoneRect(selectedZone, project.scalePxPerMm).y + getZoneRect(selectedZone, project.scalePxPerMm).height - 11}
                  width={18}
                  height={22}
                  fill="#fef3c7"
                  stroke="#b45309"
                  strokeWidth={2}
                  cornerRadius={5}
                  draggable
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                  }}
                  onDragStart={() => {
                    beginObjectInteraction();
                  }}
                  onDragMove={(event) => {
                    const rect = getZoneRect(selectedZone, project.scalePxPerMm);
                    const depthMm = Math.max(200, Math.round((event.target.y() + 11 - rect.y) / project.scalePxPerMm));
                    onResizeSelectedZone(selectedZone.widthMm, depthMm);
                  }}
                  onDragEnd={(event) => {
                    finishObjectInteraction();
                    const rect = getZoneRect(selectedZone, project.scalePxPerMm);
                    event.target.position({
                      x: rect.x + rect.width / 2 - 9,
                      y: rect.y + rect.height - 11
                    });
                  }}
                />
                <Rect
                  x={getZoneRect(selectedZone, project.scalePxPerMm).x + getZoneRect(selectedZone, project.scalePxPerMm).width - 11}
                  y={getZoneRect(selectedZone, project.scalePxPerMm).y + getZoneRect(selectedZone, project.scalePxPerMm).height - 11}
                  width={22}
                  height={22}
                  fill="#ffffff"
                  stroke="#b45309"
                  strokeWidth={2}
                  cornerRadius={5}
                  draggable
                  onMouseDown={(event) => {
                    event.cancelBubble = true;
                  }}
                  onDragStart={() => {
                    beginObjectInteraction();
                  }}
                  onDragMove={(event) => {
                    const rect = getZoneRect(selectedZone, project.scalePxPerMm);
                    const widthMm = Math.max(200, Math.round((event.target.x() + 11 - rect.x) / project.scalePxPerMm));
                    const depthMm = Math.max(200, Math.round((event.target.y() + 11 - rect.y) / project.scalePxPerMm));
                    onResizeSelectedZone(widthMm, depthMm);
                  }}
                  onDragEnd={(event) => {
                    finishObjectInteraction();
                    const rect = getZoneRect(selectedZone, project.scalePxPerMm);
                    event.target.position({
                      x: rect.x + rect.width - 11,
                      y: rect.y + rect.height - 11
                    });
                  }}
                />
              </Group>
            ) : null}
          </Layer>
        </Stage>

        {selection && selection.type !== "room" && selectionAnchor && quickPanelStyle ? (
          <div
            className="pointer-events-auto absolute z-10 w-52 rounded-2xl border border-slate-200 bg-white/96 p-3 shadow-lg backdrop-blur"
            style={quickPanelStyle}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Quick Tools</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {selection.type === "furniture"
                ? selectedFurniture?.name ?? "家具"
                : selection.type === "window"
                    ? "窓"
                    : selection.type === "door"
                      ? "扉"
                      : "制約ゾーン"}
            </div>
            {selectedFurniture ? (
              <div className="mt-1 text-xs text-slate-600">
                {selectedFurniture.widthMm} x {selectedFurniture.depthMm} mm / {selectedFurniture.rotation} deg
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button className="button-soft w-full" onClick={onCenterSelection}>
                フォーカス
              </button>
              <button className="button-soft w-full" onClick={onDeleteSelection}>
                削除
              </button>
            </div>
            {selectedFurniture ? (
              <>
                <div className="mt-2 flex gap-2">
                  <button className="button-soft w-full" onClick={() => onRotateSelectedFurniture(-15)}>
                    -15°
                  </button>
                  <button className="button-soft w-full" onClick={() => onRotateSelectedFurniture(15)}>
                    +15°
                  </button>
                </div>
                <button className="mt-2 button-soft w-full" onClick={onDuplicateSelectedFurniture}>
                  家具を複製
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {contextMenu ? (
          <div
            className="absolute z-20 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
            style={{ left: Math.min(project.canvas.width - 230, contextMenu.x), top: Math.min(project.canvas.height - 260, contextMenu.y) }}
          >
            {contextMenu.target === "canvas" ? (
              <div className="space-y-1">
                <button className="button-soft w-full" onClick={() => { setContextMenu(null); onCenterSelection(); }}>
                  選択中へフォーカス
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <button className="button-soft w-full" onClick={() => { onCenterSelection(); setContextMenu(null); }}>
                  表示
                </button>
                <button className="button-soft w-full" onClick={() => { onDeleteSelection(); setContextMenu(null); }}>
                  削除
                </button>
                {contextMenu.target.type === "furniture" ? (
                  <>
                    <button className="button-soft w-full" onClick={() => { onDuplicateSelectedFurniture(); setContextMenu(null); }}>
                      複製
                    </button>
                    <div className="grid grid-cols-2 gap-1">
                      <button className="button-soft w-full" onClick={() => { onRotateSelectedFurniture(-15); setContextMenu(null); }}>-15°</button>
                      <button className="button-soft w-full" onClick={() => { onRotateSelectedFurniture(15); setContextMenu(null); }}>+15°</button>
                      <button className="button-soft w-full" onClick={() => { onRotateSelectedFurniture(-90); setContextMenu(null); }}>-90°</button>
                      <button className="button-soft w-full" onClick={() => { onRotateSelectedFurniture(90); setContextMenu(null); }}>+90°</button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button className="button-soft w-full" onClick={() => { onSetSelectedFurnitureKind("bed"); setContextMenu(null); }}>ベッド</button>
                      <button className="button-soft w-full" onClick={() => { onSetSelectedFurnitureKind("desk"); setContextMenu(null); }}>デスク</button>
                      <button className="button-soft w-full" onClick={() => { onSetSelectedFurnitureKind("table"); setContextMenu(null); }}>テーブル</button>
                      <button className="button-soft w-full" onClick={() => { onSetSelectedFurnitureKind("chair"); setContextMenu(null); }}>チェア</button>
                      <button className="button-soft w-full" onClick={() => { onSetSelectedFurnitureKind("sofa"); setContextMenu(null); }}>ソファ</button>
                      <button className="button-soft w-full" onClick={() => { onSetSelectedFurnitureKind("wardrobe"); setContextMenu(null); }}>収納</button>
                      <button className="button-soft w-full" onClick={() => { onSetSelectedFurnitureKind("shelf"); setContextMenu(null); }}>棚</button>
                      <button className="button-soft w-full" onClick={() => { onSetSelectedFurnitureKind("appliance"); setContextMenu(null); }}>家電</button>
                      <button className="button-soft w-full" onClick={() => { onSetSelectedFurnitureKind("generic"); setContextMenu(null); }}>汎用</button>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between px-2 text-xs text-slate-500">
        <div>
          空白ドラッグでパン。家具と制約ゾーンはドラッグ作成。部屋移動は中央ハンドル、頂点追加は辺中央ハンドルです。
        </div>
        <div>{issues.length} 件の警告</div>
      </div>
    </div>
  );
}

function modeLabel(mode: PlannerMode) {
  switch (mode) {
    case "trace-room":
      return "壁トレース";
    case "add-window":
      return "窓追加";
    case "add-door":
      return "扉追加";
    case "add-zone":
      return "制約ゾーン追加";
    case "add-furniture":
      return "家具追加";
    case "set-scale":
      return "スケール設定";
    default:
      return "選択";
  }
}

function buildGrid(width: number, height: number, scale: number) {
  const step = getAdaptiveGridStep(scale);
  const vertical: number[] = [];
  const horizontal: number[] = [];

  for (let x = 0; x <= width; x += step) {
    vertical.push(x);
  }

  for (let y = 0; y <= height; y += step) {
    horizontal.push(y);
  }

  return { vertical, horizontal };
}

function getFurnitureStyle(kind: FurnitureKind, name: string) {
  const label = name.toLowerCase();
  if (kind === "bed" || label.includes("bed") || label.includes("ベッド")) {
    return {
      kind: "bed" as const,
      fill: "#d8efe9",
      innerFill: "#8fd3ca",
      stroke: "#356d69",
      iconStroke: "#356d69",
      cornerRadius: 16,
      inset: 10
    };
  }

  if (kind === "desk" || label.includes("desk") || label.includes("机") || label.includes("デスク")) {
    return {
      kind: "desk" as const,
      fill: "#d9b082",
      innerFill: "#c08b55",
      stroke: "#7b4c23",
      iconStroke: "#6f431e",
      cornerRadius: 8,
      inset: 8
    };
  }

  if (kind === "table" || label.includes("table") || label.includes("テーブル")) {
    return {
      kind: "table" as const,
      fill: "#d8c2a3",
      innerFill: "#c39b68",
      stroke: "#8b5e34",
      iconStroke: "#7c522e",
      cornerRadius: 16,
      inset: 8
    };
  }

  if (kind === "chair" || label.includes("chair") || label.includes("椅子") || label.includes("チェア")) {
    return {
      kind: "chair" as const,
      fill: "#b6b0af",
      innerFill: "#8f8784",
      stroke: "#4b5563",
      iconStroke: "#374151",
      cornerRadius: 18,
      inset: 12
    };
  }

  if (kind === "sofa" || label.includes("sofa") || label.includes("ソファ")) {
    return {
      kind: "sofa" as const,
      fill: "#60656d",
      innerFill: "#454b55",
      stroke: "#1f2937",
      iconStroke: "#111827",
      cornerRadius: 22,
      inset: 10
    };
  }

  if (kind === "wardrobe" || label.includes("wardrobe") || label.includes("closet") || label.includes("ワードローブ")) {
    return {
      kind: "wardrobe" as const,
      fill: "#efe3c8",
      innerFill: "#e4d3af",
      stroke: "#8d6c3f",
      iconStroke: "#7c5d37",
      cornerRadius: 8,
      inset: 6
    };
  }

  if (kind === "cabinet" || label.includes("cabinet") || label.includes("収納") || label.includes("キャビネット")) {
    return {
      kind: "cabinet" as const,
      fill: "#eadac1",
      innerFill: "#d8c19d",
      stroke: "#8b6b47",
      iconStroke: "#75593b",
      cornerRadius: 8,
      inset: 6
    };
  }

  if (kind === "shelf" || label.includes("shelf") || label.includes("棚") || label.includes("シェルフ")) {
    return {
      kind: "shelf" as const,
      fill: "#efe8dc",
      innerFill: "#d8c6ae",
      stroke: "#78624a",
      iconStroke: "#6b5744",
      cornerRadius: 6,
      inset: 6
    };
  }

  if (kind === "appliance" || label.includes("tv") || label.includes("テレビ") || label.includes("冷蔵庫") || label.includes("家電")) {
    return {
      kind: "appliance" as const,
      fill: "#dfe4ea",
      innerFill: "#bfc7d1",
      stroke: "#475569",
      iconStroke: "#334155",
      cornerRadius: 10,
      inset: 6
    };
  }

  if (kind === "rug" || label.includes("rug") || label.includes("ラグ")) {
    return {
      kind: "rug" as const,
      fill: "#d8c3aa",
      innerFill: "#c8a885",
      stroke: "#9a6f49",
      iconStroke: "#8b5e34",
      cornerRadius: 28,
      inset: 10
    };
  }

  if (kind === "plant" || label.includes("plant") || label.includes("植物") || label.includes("観葉")) {
    return {
      kind: "plant" as const,
      fill: "#d8ead1",
      innerFill: "#a7cf9b",
      stroke: "#4d7c0f",
      iconStroke: "#3f6212",
      cornerRadius: 24,
      inset: 12
    };
  }

  return {
    kind: "generic" as const,
    fill: "#dde4ec",
    innerFill: "#c6d0dc",
    stroke: "#556170",
    iconStroke: "#64748b",
    cornerRadius: 12,
    inset: 6
  };
}

function renderFurnitureIcon(kind: FurnitureKind, width: number, height: number, stroke: string) {
  switch (kind) {
    case "bed":
      return (
        <>
          <Rect x={-width / 2 + 12} y={-height / 2 + 12} width={width - 24} height={height - 24} stroke={stroke} strokeWidth={2} cornerRadius={14} />
          <Rect x={width / 2 - 28} y={-height / 2 + 16} width={14} height={height - 32} fill={stroke} opacity={0.32} cornerRadius={6} />
          <Rect x={-width / 2 + 18} y={-height / 2 + 18} width={Math.max(24, width * 0.16)} height={height - 36} fill="rgba(255,255,255,0.4)" cornerRadius={8} />
        </>
      );
    case "desk":
      return (
        <>
          <Line points={[-width / 2 + 16, height / 2 - 18, -width / 2 + 16, -height / 2 + 18]} stroke={stroke} strokeWidth={2} />
          <Line points={[width / 2 - 16, height / 2 - 18, width / 2 - 16, -height / 2 + 18]} stroke={stroke} strokeWidth={2} />
          <Line points={[-width / 2 + 24, height / 2 - 16, width / 2 - 24, height / 2 - 16]} stroke={stroke} strokeWidth={2} />
          <Rect x={-width * 0.16} y={-height * 0.16} width={width * 0.32} height={height * 0.26} stroke={stroke} strokeWidth={2} cornerRadius={4} />
        </>
      );
    case "table":
      return (
        <>
          <Circle x={0} y={0} radius={Math.min(width, height) * 0.18} stroke={stroke} strokeWidth={2} />
          <Line points={[-width / 2 + 18, 0, width / 2 - 18, 0]} stroke={stroke} strokeWidth={2} />
          <Line points={[0, -height / 2 + 18, 0, height / 2 - 18]} stroke={stroke} strokeWidth={2} />
        </>
      );
    case "chair":
      return (
        <>
          <Rect x={-width / 2 + 18} y={-height / 2 + 18} width={width - 36} height={height - 36} stroke={stroke} strokeWidth={2} cornerRadius={14} />
          <Line points={[-width / 2 + 18, height / 2 - 12, width / 2 - 18, height / 2 - 12]} stroke={stroke} strokeWidth={2} />
          <Line points={[-width / 2 + 18, -height / 2 + 6, width / 2 - 18, -height / 2 + 6]} stroke={stroke} strokeWidth={2} />
        </>
      );
    case "sofa":
      return (
        <>
          <Rect x={-width / 2 + 16} y={-height / 2 + 20} width={width - 32} height={height - 40} stroke={stroke} strokeWidth={2} cornerRadius={18} />
          <Line points={[-width / 2 + 16, -height / 2 + 28, width / 2 - 16, -height / 2 + 28]} stroke={stroke} strokeWidth={2} />
          <Line points={[-width / 2 + 20, height / 2 - 18, -width / 2 + 20, -height / 2 + 28]} stroke={stroke} strokeWidth={2} />
          <Line points={[width / 2 - 20, height / 2 - 18, width / 2 - 20, -height / 2 + 28]} stroke={stroke} strokeWidth={2} />
        </>
      );
    case "wardrobe":
    case "cabinet":
      return (
        <>
          <Line points={[0, -height / 2 + 10, 0, height / 2 - 10]} stroke={stroke} strokeWidth={2} />
          <Circle x={-8} y={0} radius={3} fill={stroke} />
          <Circle x={8} y={0} radius={3} fill={stroke} />
        </>
      );
    case "shelf":
      return (
        <>
          <Line points={[-width / 2 + 12, -height / 4, width / 2 - 12, -height / 4]} stroke={stroke} strokeWidth={2} />
          <Line points={[-width / 2 + 12, 0, width / 2 - 12, 0]} stroke={stroke} strokeWidth={2} />
          <Line points={[-width / 2 + 12, height / 4, width / 2 - 12, height / 4]} stroke={stroke} strokeWidth={2} />
        </>
      );
    case "appliance":
      return (
        <>
          <Rect x={-width / 2 + 16} y={-height / 2 + 16} width={width - 32} height={height - 32} stroke={stroke} strokeWidth={2} cornerRadius={8} />
          <Rect x={-width * 0.18} y={-height * 0.16} width={width * 0.36} height={height * 0.2} stroke={stroke} strokeWidth={2} cornerRadius={4} />
        </>
      );
    case "rug":
      return (
        <>
          <Rect x={-width / 2 + 18} y={-height / 2 + 18} width={width - 36} height={height - 36} stroke={stroke} strokeWidth={2} cornerRadius={22} dash={[8, 5]} />
        </>
      );
    case "plant":
      return (
        <>
          <Circle x={0} y={-4} radius={Math.min(width, height) * 0.16} stroke={stroke} strokeWidth={2} />
          <Rect x={-width * 0.09} y={height * 0.1} width={width * 0.18} height={height * 0.14} stroke={stroke} strokeWidth={2} cornerRadius={5} />
        </>
      );
    default:
      return <Line points={[-width / 2 + 14, 0, width / 2 - 14, 0]} stroke={stroke} strokeWidth={2} dash={[8, 6]} />;
  }
}

function renderRoomFloorPattern(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  opacity: number
) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const plankHeight = 26;
  const rows = [];

  for (let y = bounds.minY; y <= bounds.maxY + plankHeight; y += plankHeight) {
    rows.push(
      <Line
        key={`floor-line-${y}`}
        points={[bounds.minX - 40, y, bounds.maxX + 40, y]}
        stroke="rgba(108, 67, 31, 0.34)"
        strokeWidth={1.6}
        opacity={opacity}
        listening={false}
      />
    );
  }

  for (let x = bounds.minX + 48; x < bounds.maxX; x += 96) {
    rows.push(
      <Line
        key={`floor-joint-a-${x}`}
        points={[x, bounds.minY, x + 14, bounds.minY + height * 0.28]}
        stroke="rgba(108, 67, 31, 0.2)"
        strokeWidth={1.1}
        opacity={opacity}
        listening={false}
      />
    );
    rows.push(
      <Line
        key={`floor-joint-b-${x}`}
        points={[x - 10, bounds.minY + height * 0.54, x + 8, bounds.minY + height * 0.92]}
        stroke="rgba(108, 67, 31, 0.2)"
        strokeWidth={1.1}
        opacity={opacity}
        listening={false}
      />
    );
  }

  for (let y = bounds.minY + 10; y < bounds.maxY; y += 52) {
    rows.push(
      <Line
        key={`floor-grain-${y}`}
        points={[bounds.minX + 12, y, bounds.maxX - 12, y + 8]}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
        opacity={opacity}
        listening={false}
      />
    );
  }

  return rows;
}

function getQuickToolbarPosition(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewport: ViewportState,
  canvas: PlannerProject["canvas"]
) {
  const toolbarWidth = 224;
  const toolbarHeight = 232;
  const margin = 18;
  const screenLeft = bounds.minX * viewport.scale + viewport.x;
  const screenRight = bounds.maxX * viewport.scale + viewport.x;
  const screenTop = bounds.minY * viewport.scale + viewport.y;
  const screenBottom = bounds.maxY * viewport.scale + viewport.y;

  const rightSpace = canvas.width - screenRight - margin;
  const leftSpace = screenLeft;
  const topSpace = screenTop - margin;
  const bottomSpace = canvas.height - screenBottom - margin;

  if (rightSpace >= toolbarWidth) {
    return {
      left: Math.min(canvas.width - toolbarWidth - 16, screenRight + margin),
      top: clamp(screenTop - 8, 16, canvas.height - toolbarHeight - 16)
    };
  }

  if (leftSpace >= toolbarWidth + margin) {
    return {
      left: Math.max(16, screenLeft - toolbarWidth - margin),
      top: clamp(screenTop - 8, 16, canvas.height - toolbarHeight - 16)
    };
  }

  if (bottomSpace >= toolbarHeight) {
    return {
      left: clamp(screenLeft - 24, 16, canvas.width - toolbarWidth - 16),
      top: Math.min(canvas.height - toolbarHeight - 16, screenBottom + margin)
    };
  }

  return {
    left: clamp(screenLeft - 24, 16, canvas.width - toolbarWidth - 16),
    top: Math.max(16, screenTop - toolbarHeight - margin)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getAdaptiveGridStep(scale: number) {
  const candidates = [25, 50, 100, 200, 400];
  const preferredMin = 28;
  const preferredMax = 88;

  for (const candidate of candidates) {
    const screenSpacing = candidate * scale;
    if (screenSpacing >= preferredMin && screenSpacing <= preferredMax) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}
