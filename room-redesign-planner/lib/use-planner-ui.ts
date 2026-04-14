"use client";

import { useState } from "react";
import type { PlacementDraft, PlannerMode, Point, Selection, SelectionItem, ViewportState } from "@/lib/types";

export function usePlannerUi() {
  const [mode, setMode] = useState<PlannerMode>("select");
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedItems, setSelectedItems] = useState<SelectionItem[]>([]);
  const [draftRoomPoints, setDraftRoomPoints] = useState<Point[]>([]);
  const [scaleDraft, setScaleDraft] = useState<Point[]>([]);
  const [draftPlacement, setDraftPlacement] = useState<PlacementDraft | null>(null);
  const [scaleDistanceMm, setScaleDistanceMm] = useState("1000");
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, scale: 1 });
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapSizePx, setSnapSizePx] = useState(20);

  const resetTransientUi = () => {
    clearSelection();
    setDraftRoomPoints([]);
    setScaleDraft([]);
    setDraftPlacement(null);
    setViewport({ x: 0, y: 0, scale: 1 });
  };

  const clearSelection = () => {
    setSelection(null);
    setSelectedItems([]);
  };

  const selectSingle = (next: Selection) => {
    setSelection(next);
    setSelectedItems(next ? [next] : []);
  };

  const toggleSelection = (next: Selection) => {
    if (!next) {
      clearSelection();
      return;
    }

    setSelectedItems((current) => {
      const exists = current.some((item) => item.type === next.type && item.id === next.id);
      const updated = exists
        ? current.filter((item) => !(item.type === next.type && item.id === next.id))
        : [...current, next];
      setSelection(updated.length > 0 ? updated[updated.length - 1] : null);
      return updated;
    });
  };

  return {
    mode,
    setMode,
    selection,
    setSelection,
    selectedItems,
    setSelectedItems,
    draftRoomPoints,
    setDraftRoomPoints,
    scaleDraft,
    setScaleDraft,
    draftPlacement,
    setDraftPlacement,
    scaleDistanceMm,
    setScaleDistanceMm,
    viewport,
    setViewport,
    snapEnabled,
    setSnapEnabled,
    snapSizePx,
    setSnapSizePx,
    clearSelection,
    selectSingle,
    toggleSelection,
    resetTransientUi
  };
}
