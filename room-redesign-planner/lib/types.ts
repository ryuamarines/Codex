export type Point = {
  x: number;
  y: number;
};

export type BackgroundImage = {
  dataUrl: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  width: number;
  height: number;
};

export type RoomShape = {
  id: string;
  points: Point[];
};

export type WindowObject = {
  id: string;
  wallIndex: number;
  offset: number;
  widthMm: number;
  note: string;
};

export type ConstraintZone = {
  id: string;
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
  note: string;
};

export type DoorSwing = "clockwise" | "counterclockwise";
export type DoorOpenDirection = "inward" | "outward";
export type FurnitureKind =
  | "generic"
  | "bed"
  | "desk"
  | "table"
  | "chair"
  | "sofa"
  | "wardrobe"
  | "cabinet"
  | "shelf"
  | "appliance"
  | "rug"
  | "plant";

export type DoorObject = {
  id: string;
  wallIndex: number;
  offset: number;
  widthMm: number;
  swing: DoorSwing;
  openDirection: DoorOpenDirection;
  note: string;
};

export type FurnitureObject = {
  id: string;
  name: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
  rotation: number;
};

export type PlannerProject = {
  id: string;
  name: string;
  canvas: {
    width: number;
    height: number;
  };
  scalePxPerMm: number;
  floorOpacity: number;
  background: BackgroundImage | null;
  room: RoomShape | null;
  windows: WindowObject[];
  zones: ConstraintZone[];
  doors: DoorObject[];
  furniture: FurnitureObject[];
};

export type PlannerMode =
  | "select"
  | "trace-room"
  | "add-window"
  | "add-door"
  | "add-zone"
  | "add-furniture"
  | "set-scale";

export type Selection =
  | { type: "room"; id: string }
  | { type: "window"; id: string }
  | { type: "zone"; id: string }
  | { type: "door"; id: string }
  | { type: "furniture"; id: string }
  | null;

export type SelectionItem = Exclude<Selection, null>;

export type CollisionIssue =
  | { id: string; type: "furniture"; kind: "furniture-overlap"; targetId: string; message: string }
  | { id: string; type: "furniture"; kind: "wall-overflow"; message: string }
  | { id: string; type: "furniture"; kind: "door-swing"; targetId: string; message: string }
  | { id: string; type: "furniture"; kind: "window-zone"; targetId: string; message: string };

export type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

export type PlacementDraft = {
  kind: "furniture" | "zone";
  start: Point;
  end: Point;
};
