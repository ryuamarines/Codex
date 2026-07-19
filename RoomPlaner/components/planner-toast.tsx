"use client";

import { AlertTriangle, Check, Info, X } from "lucide-react";

export type PlannerNotice = {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
};

export function PlannerToast({ notice, onClose }: { notice: PlannerNotice | null; onClose: () => void }) {
  if (!notice) return null;
  const Icon = notice.tone === "success" ? Check : notice.tone === "error" ? AlertTriangle : Info;

  return (
    <div className={`planner-toast planner-toast-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      <Icon className="shrink-0" size={17} />
      <span className="min-w-0 flex-1">{notice.message}</span>
      <button className="planner-toast-close" onClick={onClose} aria-label="通知を閉じる" title="通知を閉じる">
        <X size={15} />
      </button>
    </div>
  );
}
