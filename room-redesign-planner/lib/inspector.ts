import type { DoorObject, PlannerProject, Selection } from "@/lib/types";

export type InspectorField =
  | { key: string; label: string; type: "text" | "number"; value: string | number }
  | {
      key: string;
      label: string;
      type: "select";
      value: string;
      options: Array<{ label: string; value: string }>;
    };

export function getSelectedObjectDescriptor(project: PlannerProject, selection: Selection) {
  if (!selection) return null;

  switch (selection.type) {
    case "furniture": {
      const item = project.furniture.find((entry) => entry.id === selection.id);
      if (!item) return null;
      return {
        label: "家具",
        fields: [
          { key: "name", label: "名前", type: "text", value: item.name },
          {
            key: "kind",
            label: "見た目",
            type: "select",
            value: item.kind,
            options: [
              { label: "汎用", value: "generic" },
              { label: "ベッド", value: "bed" },
              { label: "デスク", value: "desk" },
              { label: "テーブル", value: "table" },
              { label: "チェア", value: "chair" },
              { label: "ソファ", value: "sofa" },
              { label: "ワードローブ", value: "wardrobe" },
              { label: "キャビネット", value: "cabinet" },
              { label: "シェルフ", value: "shelf" },
              { label: "家電", value: "appliance" },
              { label: "ラグ", value: "rug" },
              { label: "植物", value: "plant" }
            ]
          },
          { key: "widthMm", label: "幅 (mm)", type: "number", value: item.widthMm },
          { key: "depthMm", label: "奥行き (mm)", type: "number", value: item.depthMm },
          { key: "x", label: "中心 X", type: "number", value: Math.round(item.x) },
          { key: "y", label: "中心 Y", type: "number", value: Math.round(item.y) },
          { key: "rotation", label: "回転 (deg)", type: "number", value: item.rotation }
        ] satisfies InspectorField[]
      };
    }
    case "window": {
      const item = project.windows.find((entry) => entry.id === selection.id);
      if (!item) return null;
      return {
        label: "窓",
        fields: [
          { key: "widthMm", label: "幅 (mm)", type: "number", value: item.widthMm },
          { key: "offset", label: "壁上オフセット (px)", type: "number", value: Math.round(item.offset) },
          { key: "note", label: "メモ", type: "text", value: item.note }
        ] satisfies InspectorField[]
      };
    }
    case "door": {
      const item = project.doors.find((entry) => entry.id === selection.id);
      if (!item) return null;
      return {
        label: "扉",
        fields: [
          { key: "widthMm", label: "幅 (mm)", type: "number", value: item.widthMm },
          { key: "offset", label: "壁上オフセット (px)", type: "number", value: Math.round(item.offset) },
          {
            key: "swing",
            label: "ヒンジ側",
            type: "select",
            value: item.swing,
            options: [
              { label: "始点側", value: "counterclockwise" },
              { label: "終点側", value: "clockwise" }
            ]
          },
          {
            key: "openDirection",
            label: "開く向き",
            type: "select",
            value: item.openDirection,
            options: [
              { label: "内開き", value: "inward" },
              { label: "外開き", value: "outward" }
            ]
          },
          { key: "note", label: "メモ", type: "text", value: item.note }
        ] satisfies InspectorField[]
      };
    }
    case "zone": {
      const item = project.zones.find((entry) => entry.id === selection.id);
      if (!item) return null;
      return {
        label: "窓前制約ゾーン",
        fields: [
          { key: "x", label: "X", type: "number", value: Math.round(item.x) },
          { key: "y", label: "Y", type: "number", value: Math.round(item.y) },
          { key: "widthMm", label: "幅 (mm)", type: "number", value: item.widthMm },
          { key: "depthMm", label: "奥行き (mm)", type: "number", value: item.depthMm },
          { key: "note", label: "メモ", type: "text", value: item.note }
        ] satisfies InspectorField[]
      };
    }
    case "room": {
      const item = project.room;
      if (!item || item.id !== selection.id) return null;
      return {
        label: "部屋輪郭",
        fields: [] satisfies InspectorField[]
      };
    }
    default:
      return null;
  }
}

export function updateDoorField(item: DoorObject, field: string, value: string | number): DoorObject {
  return { ...item, [field]: value } as DoorObject;
}
