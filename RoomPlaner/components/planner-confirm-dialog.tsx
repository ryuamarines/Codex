"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef } from "react";

export type PlannerConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

type PlannerConfirmDialogProps = {
  confirmation: PlannerConfirmation | null;
  onClose: () => void;
};

export function PlannerConfirmDialog({ confirmation, onClose }: PlannerConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!confirmation) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [confirmation, onClose]);

  if (!confirmation) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="dialog-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="planner-confirm-title"
        aria-describedby="planner-confirm-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className={confirmation.danger ? "dialog-icon dialog-icon-danger" : "dialog-icon"}>
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="planner-confirm-title" className="text-base font-semibold text-neutral-950">
              {confirmation.title}
            </h2>
            <p id="planner-confirm-description" className="mt-2 text-sm leading-6 text-neutral-600">
              {confirmation.message}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="閉じる" title="閉じる">
            <X size={17} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelButtonRef} className="button-soft" onClick={onClose}>キャンセル</button>
          <button
            className={confirmation.danger ? "button-danger" : "button-strong"}
            onClick={() => {
              onClose();
              confirmation.onConfirm();
            }}
          >
            {confirmation.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
