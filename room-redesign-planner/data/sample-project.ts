import type { PlannerProject } from "@/lib/types";

export const sampleProject: PlannerProject = {
  id: "sample-room",
  name: "サンプルルーム",
  canvas: {
    width: 1200,
    height: 840
  },
  scalePxPerMm: 0.11,
  floorOpacity: 0.82,
  background: null,
  room: {
    id: "room-main",
    points: [
      { x: 120, y: 120 },
      { x: 930, y: 120 },
      { x: 930, y: 300 },
      { x: 1080, y: 300 },
      { x: 1080, y: 710 },
      { x: 150, y: 710 },
      { x: 150, y: 510 },
      { x: 120, y: 510 }
    ]
  },
  windows: [
    {
      id: "sample-window-1",
      wallIndex: 0,
      offset: 210,
      widthMm: 1800,
      note: "掃き出し窓"
    }
  ],
  zones: [
    {
      id: "sample-zone-1",
      x: 245,
      y: 150,
      widthMm: 2000,
      depthMm: 850,
      note: "窓前を空ける"
    }
  ],
  doors: [
    {
      id: "sample-door-1",
      wallIndex: 5,
      offset: 200,
      widthMm: 800,
      swing: "counterclockwise",
      openDirection: "inward",
      note: "室内ドア"
    }
  ],
  furniture: [
    {
      id: "sample-furniture-desk",
      name: "デスク",
      kind: "desk",
      x: 580,
      y: 500,
      widthMm: 1400,
      depthMm: 650,
      rotation: 0
    },
    {
      id: "sample-furniture-bed",
      name: "ベッド",
      kind: "bed",
      x: 860,
      y: 575,
      widthMm: 1000,
      depthMm: 2100,
      rotation: 90
    },
    {
      id: "sample-furniture-chair",
      name: "チェア",
      kind: "chair",
      x: 470,
      y: 515,
      widthMm: 520,
      depthMm: 520,
      rotation: 0
    },
    {
      id: "sample-furniture-wardrobe",
      name: "ワードローブ",
      kind: "wardrobe",
      x: 250,
      y: 380,
      widthMm: 900,
      depthMm: 450,
      rotation: 90
    }
  ]
};
