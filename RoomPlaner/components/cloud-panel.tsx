"use client";

import type { User } from "firebase/auth";

type CloudPanelProps = {
  firebaseUser: User | null;
  cloudMessage: string;
  authMessage: string;
  storageError: string;
  storageNotice: string;
  cloudHydrating: boolean;
  cloudBusy: boolean;
  authBusy: boolean;
  firebaseConfigured: boolean;
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
  authBusy,
  firebaseConfigured,
  guestTransfer,
  onSignIn,
  onSignOut,
  onSaveProjectToCloud,
  onLoadProjectFromCloud,
  onImportGuestProjects
}: CloudPanelProps) {
  return (
    <div className="mt-4 rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-950">アカウント / クラウド</div>
          <div className="mt-2 text-sm text-neutral-600">
            {firebaseUser ? `ログイン中: ${firebaseUser.displayName || firebaseUser.email || firebaseUser.uid}` : "未ログイン"}
          </div>
        </div>
        <div
          className={
            firebaseUser
              ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
              : "rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-500"
          }
        >
          {firebaseUser ? "ONLINE" : "OFFLINE"}
        </div>
      </div>
      <div className="mt-2 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-xs leading-5 text-neutral-500">
        {firebaseUser
          ? "このアカウント専用のブラウザ保存と Firestore 保存を使います。"
          : "ログイン前はこのブラウザのゲスト保存を使います。"}
      </div>
      {cloudMessage ? (
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-3 text-sm text-neutral-700">{cloudMessage}</div>
      ) : null}
      {authMessage ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{authMessage}</div>
      ) : null}
      {storageNotice ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{storageNotice}</div>
      ) : null}
      {storageError ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{storageError}</div>
      ) : null}
      {firebaseUser && guestTransfer.available ? (
        <div className="mt-3 rounded-2xl border border-neutral-300 bg-white p-3">
          <div className="text-sm font-semibold text-neutral-950">ゲストデータがあります</div>
          <div className="mt-1 text-xs leading-5 text-neutral-600">
            ログイン前に作成した{guestTransfer.count}件を、このアカウントへコピーできます。ゲスト側も残ります。
          </div>
          <button className="button-strong mt-3 w-full" onClick={onImportGuestProjects} disabled={authBusy || cloudBusy}>
            ゲストプロジェクトを引き継ぐ
          </button>
        </div>
      ) : null}
      {cloudHydrating ? (
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-600">
          Firestore の保存内容を確認しています。読込中でもログアウトはできます。
        </div>
      ) : null}
      <div className="mt-3 grid gap-2">
        {firebaseUser ? (
          <>
            <p className="text-xs leading-5 text-neutral-500">
              Firestoreとの読込・保存は、現在選択している1件が対象です。
            </p>
            <button className="button-soft w-full" onClick={onLoadProjectFromCloud} disabled={cloudBusy || authBusy}>
              選択中へFirestoreから読込
            </button>
            <button className="button-soft w-full" onClick={onSaveProjectToCloud} disabled={cloudBusy || authBusy}>
              選択中をFirestoreに保存
            </button>
            <button className="button-danger w-full" onClick={onSignOut} disabled={authBusy}>
              ログアウト
            </button>
          </>
        ) : (
          <button className="button-strong w-full" onClick={onSignIn} disabled={!firebaseConfigured || cloudBusy || authBusy}>
            Googleでログイン
          </button>
        )}
      </div>
    </div>
  );
}
