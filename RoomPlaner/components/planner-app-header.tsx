"use client";

import { useEffect, useState, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  HardDrive,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Redo2,
  Ruler,
  Trash2,
  Undo2,
  Upload
} from "lucide-react";
import type { PlannerProjectSummary } from "@/lib/planner-workspace-storage";
import type { PlannerStorageStatus } from "@/lib/use-planner-project";

type PlannerAppHeaderProps = {
  projects: PlannerProjectSummary[];
  activeProjectId: string;
  projectName: string;
  projectCount: number;
  objectCount: number;
  warningCount: number;
  storageStatus: PlannerStorageStatus;
  signedIn: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSwitchProject: (projectId: string) => void;
  onRenameProject: (name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCreateProject: () => void;
  onDuplicateProject: () => void;
  onDeleteProject: () => void;
  onImportCsv: () => void;
  onImportJson: () => void;
  onExportCsv: () => void;
  onLoadSample: () => void;
};

const STORAGE_STATUS = {
  loading: { label: "読込中", icon: LoaderCircle, className: "text-neutral-500" },
  ready: { label: "準備完了", icon: HardDrive, className: "text-neutral-600" },
  saving: { label: "保存中", icon: LoaderCircle, className: "text-neutral-600" },
  saved: { label: "保存済み", icon: Check, className: "text-emerald-700" },
  error: { label: "保存エラー", icon: AlertTriangle, className: "text-rose-700" }
} as const;

export function PlannerAppHeader({
  projects,
  activeProjectId,
  projectName,
  projectCount,
  objectCount,
  warningCount,
  storageStatus,
  signedIn,
  canUndo,
  canRedo,
  onSwitchProject,
  onRenameProject,
  onUndo,
  onRedo,
  onCreateProject,
  onDuplicateProject,
  onDeleteProject,
  onImportCsv,
  onImportJson,
  onExportCsv,
  onLoadSample
}: PlannerAppHeaderProps) {
  const status = STORAGE_STATUS[storageStatus];
  const StatusIcon = status.icon;
  const [projectNameDraft, setProjectNameDraft] = useState(projectName);

  useEffect(() => {
    setProjectNameDraft(projectName);
  }, [activeProjectId, projectName]);

  const commitProjectName = () => {
    const normalized = projectNameDraft.trim() || "名称未設定";
    setProjectNameDraft(normalized);
    if (normalized !== projectName) onRenameProject(normalized);
  };

  return (
    <header className="workspace-header">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-neutral-950 text-white">
          <Ruler size={18} strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-neutral-950">RoomPlaner</div>
          <div className="text-[11px] text-neutral-500">2D Layout Editor</div>
        </div>
      </div>

      <div className="workspace-project-controls grid min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 border-t border-neutral-200 pt-3 lg:max-w-2xl lg:grid-cols-[minmax(180px,260px)_minmax(180px,1fr)] lg:border-0 lg:pt-0">
        <label className="min-w-0">
          <span className="sr-only">プロジェクト</span>
          <select
            className="input h-9 truncate py-1.5"
            value={activeProjectId}
            onChange={(event) => onSwitchProject(event.target.value)}
          >
            {projects.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">プロジェクト名</span>
          <input
            className="input h-9 py-1.5 font-semibold"
            value={projectNameDraft}
            onChange={(event) => setProjectNameDraft(event.target.value)}
            onBlur={commitProjectName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            placeholder="プロジェクト名"
          />
        </label>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <div className={`hidden h-9 items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium md:flex ${status.className}`}>
          <StatusIcon className={storageStatus === "saving" || storageStatus === "loading" ? "animate-spin" : ""} size={14} />
          {status.label}
        </div>
        <div className="hidden h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 text-xs text-neutral-600 xl:flex">
          <span>{signedIn ? "アカウント" : "ゲスト"}</span>
          <span className="text-neutral-300">/</span>
          <span>{projectCount}件</span>
          <span className="text-neutral-300">/</span>
          <span>{objectCount}点</span>
          {warningCount > 0 ? <span className="font-semibold text-rose-600">警告 {warningCount}</span> : null}
        </div>
        <button className="icon-button" onClick={onUndo} disabled={!canUndo} aria-label="元に戻す" title="元に戻す">
          <Undo2 size={17} />
        </button>
        <button className="icon-button" onClick={onRedo} disabled={!canRedo} aria-label="やり直す" title="やり直す">
          <Redo2 size={17} />
        </button>
        <details className="relative">
          <summary className="icon-button list-none" aria-label="プロジェクトメニュー" title="プロジェクトメニュー">
            <MoreHorizontal size={18} />
          </summary>
          <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-md border border-neutral-200 bg-white p-1.5 shadow-xl">
            <MenuButton icon={Copy} label="プロジェクトを複製" onClick={onDuplicateProject} />
            <MenuButton icon={Upload} label="CSVを読み込む" onClick={onImportCsv} />
            <MenuButton icon={FileJson} label="旧JSONを読み込む" onClick={onImportJson} />
            <MenuButton icon={Download} label="CSVを書き出す" onClick={onExportCsv} />
            <MenuButton icon={FileSpreadsheet} label="サンプルで置き換える" onClick={onLoadSample} />
            <div className="my-1 border-t border-neutral-200" />
            <MenuButton icon={Trash2} label="プロジェクトを削除" onClick={onDeleteProject} danger />
          </div>
        </details>
        <button
          className="button-strong h-9 whitespace-nowrap px-3"
          onClick={onCreateProject}
          aria-label="新規プロジェクト"
          title="新規プロジェクト"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">新規プロジェクト</span>
        </button>
      </div>
    </header>
  );
}

type MenuButtonProps = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
};

function MenuButton({ icon: Icon, label, onClick, danger = false }: MenuButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick();
    event.currentTarget.closest("details")?.removeAttribute("open");
  };

  return (
    <button
      className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm transition hover:bg-neutral-100 ${danger ? "text-rose-700" : "text-neutral-700"}`}
      onClick={handleClick}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
