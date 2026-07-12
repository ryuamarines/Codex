"use client";

import type { User } from "firebase/auth";

type CloudPanelProps = {
  firebaseUser: User | null;
  cloudMessage: string;
  storageError: string;
  cloudHydrating: boolean;
  cloudBusy: boolean;
  firebaseConfigured: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onSaveProjectToCloud: () => void;
  onLoadProjectFromCloud: () => void;
};

export function CloudPanel({
  firebaseUser,
  cloudMessage,
  storageError,
  cloudHydrating,
  cloudBusy,
  firebaseConfigured,
  onSignIn,
  onSignOut,
  onSaveProjectToCloud,
  onLoadProjectFromCloud
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
      {storageError ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{storageError}</div>
      ) : null}
      {cloudHydrating ? (
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-600">
          Firestore の保存内容を確認しています。読込中でもログアウトはできます。
        </div>
      ) : null}
      <div className="mt-3 grid gap-2">
        {firebaseUser ? (
          <>
            <button className="button-soft w-full" onClick={onLoadProjectFromCloud} disabled={cloudBusy}>
              Firestore から読込
            </button>
            <button className="button-soft w-full" onClick={onSaveProjectToCloud} disabled={cloudBusy}>
              Firestore に保存
            </button>
            <button className="button-danger w-full" onClick={onSignOut} disabled={cloudBusy}>
              ログアウト
            </button>
          </>
        ) : (
          <button className="button-strong w-full" onClick={onSignIn} disabled={!firebaseConfigured || cloudBusy}>
            Googleでログイン
          </button>
        )}
      </div>
    </div>
  );
}
