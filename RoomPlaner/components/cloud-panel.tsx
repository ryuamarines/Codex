"use client";

import type { User } from "firebase/auth";
import {
  CloudDownload,
  CloudUpload,
  LoaderCircle,
  LogIn,
  LogOut,
  UserRound
} from "lucide-react";

type CloudPanelProps = {
  firebaseUser: User | null;
  cloudMessage: string;
  authMessage: string;
  storageError: string;
  storageNotice: string;
  cloudHydrating: boolean;
  cloudBusy: boolean;
  cloudUpdatedAtMs: number | null;
  authBusy: boolean;
  firebaseConfigured: boolean;
  projectCount: number;
  guestTransfer: { available: boolean; count: number };
  onSignIn: () => void;
  onSignOut: () => void;
  onSaveProjectToCloud: () => void;
  onLoadProjectFromCloud: () => void;
  onImportGuestProjects: () => void;
};

export function CloudPanel({
  firebaseUser,
  cloudMessage,
  authMessage,
  storageError,
  storageNotice,
  cloudHydrating,
  cloudBusy,
  cloudUpdatedAtMs,
  authBusy,
  firebaseConfigured,
  projectCount,
  guestTransfer,
  onSignIn,
  onSignOut,
  onSaveProjectToCloud,
  onLoadProjectFromCloud,
  onImportGuestProjects
}: CloudPanelProps) {
  return (
    <div className="panel-section mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-title">アカウント保存</div>
          <div className="mt-2 flex min-w-0 items-center gap-2 text-sm text-neutral-700">
            <UserRound className="shrink-0 text-neutral-500" size={16} />
            <span className="truncate">
              {firebaseUser ? firebaseUser.displayName || firebaseUser.email || firebaseUser.uid : "ゲスト保存"}
            </span>
          </div>
        </div>
        <span className={firebaseUser ? "status-count status-count-success" : "status-count"}>
          {firebaseUser ? "同期可" : "ゲスト"}
        </span>
      </div>

      {firebaseUser ? (
        <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
          <div className="flex items-center justify-between gap-2">
            <span>クラウド保存対象</span>
            <strong className="text-neutral-950">{projectCount}件</strong>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>最終同期</span>
            <strong className="text-right text-neutral-950">{formatCloudUpdatedAt(cloudUpdatedAtMs)}</strong>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2" aria-live="polite">
        {cloudMessage ? <div className="status-message">{cloudMessage}</div> : null}
        {authMessage ? <div className="status-message status-message-warning">{authMessage}</div> : null}
        {storageNotice ? <div className="status-message status-message-success">{storageNotice}</div> : null}
        {storageError ? <div className="status-message status-message-warning">{storageError}</div> : null}
      </div>

      {firebaseUser && guestTransfer.available ? (
        <div className="mt-3 border-t border-neutral-200 pt-3">
          <div className="flex items-center justify-between gap-2 text-sm font-semibold text-neutral-950">
            <span>ゲストデータ</span>
            <span className="status-count">{guestTransfer.count}件</span>
          </div>
          <button className="button-strong mt-3 w-full" onClick={onImportGuestProjects} disabled={authBusy || cloudBusy}>
            ゲストプロジェクトを引き継ぐ
          </button>
        </div>
      ) : null}
      {cloudHydrating ? (
        <div className="status-message mt-3 flex items-center gap-2">
          <LoaderCircle className="animate-spin" size={15} />
          クラウドを確認中
        </div>
      ) : cloudBusy ? (
        <div className="status-message mt-3 flex items-center gap-2">
          <LoaderCircle className="animate-spin" size={15} />
          クラウド処理中
        </div>
      ) : null}
      <div className="mt-3 grid gap-2">
        {firebaseUser ? (
          <>
            <button className="button-soft w-full" onClick={onLoadProjectFromCloud} disabled={cloudBusy || authBusy}>
              <CloudDownload size={16} />
              全プロジェクトを読込
            </button>
            <button className="button-soft w-full" onClick={onSaveProjectToCloud} disabled={cloudBusy || authBusy}>
              <CloudUpload size={16} />
              全プロジェクトを保存
            </button>
            <button className="button-danger w-full" onClick={onSignOut} disabled={authBusy}>
              <LogOut size={16} />
              ログアウト
            </button>
          </>
        ) : (
          <button className="button-strong w-full" onClick={onSignIn} disabled={!firebaseConfigured || cloudBusy || authBusy}>
            <LogIn size={16} />
            Googleでログイン
          </button>
        )}
      </div>
    </div>
  );
}

function formatCloudUpdatedAt(updatedAtMs: number | null) {
  if (!updatedAtMs) return "未確認";
  const date = new Date(updatedAtMs);
  if (!Number.isFinite(updatedAtMs) || Number.isNaN(date.getTime())) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
