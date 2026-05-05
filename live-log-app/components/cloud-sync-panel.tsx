"use client";

import { FormEvent, useEffect, useState } from "react";
import { isFirebaseConfigured } from "@/lib/firebase/client";

type CloudSyncPanelProps = {
  isLoggedIn: boolean;
  syncStatus: string;
  authMessage: string;
  lastSyncedAtLabel: string;
  hasDriveAccessToken: boolean;
  driveFolderId: string;
  driveSessionSavedAtLabel: string;
  isDriveAccessStale: boolean;
  onGoogleSignIn(): void;
  onGoogleSignOut(): void;
  onConfigureDriveFolder(value: string): void;
  onSaveCurrentToCloud(): void;
  onCloudLoad(): void;
};

export function CloudSyncPanel({
  isLoggedIn,
  syncStatus,
  authMessage,
  lastSyncedAtLabel,
  hasDriveAccessToken,
  driveFolderId,
  driveSessionSavedAtLabel,
  isDriveAccessStale,
  onGoogleSignIn,
  onGoogleSignOut,
  onConfigureDriveFolder,
  onSaveCurrentToCloud,
  onCloudLoad
}: CloudSyncPanelProps) {
  const [driveFolderInput, setDriveFolderInput] = useState(driveFolderId);
  const syncGuidance = getSyncGuidance(syncStatus);

  useEffect(() => {
    setDriveFolderInput(driveFolderId);
  }, [driveFolderId]);

  function handleDriveFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfigureDriveFolder(driveFolderInput);
  }

  return (
    <section className="panel cloudSyncPanel">
      <div className="cloudSyncPanelHeader">
        <div className="cloudSyncTitleRow">
          <span className="cloudSyncSectionLabel">Cloud</span>
          <h2>ログインと同期</h2>
        </div>
        <div className="cloudSyncStatusRow">
          <span className="statusBadge">{syncStatus}</span>
          {lastSyncedAtLabel ? (
            <span className="statusBadge statusBadgeSoft">最終同期 {lastSyncedAtLabel}</span>
          ) : null}
        </div>
      </div>

      {authMessage ? <p className="cloudSyncPanelMessage">{authMessage}</p> : null}

      <div className="cloudSyncGrid">
        <article className="cloudSyncCard">
          <div className="cloudSyncCardHeader">
            <h3>Google / Drive 設定</h3>
            <div className="cloudSyncBadgeRow">
              <span className={`cloudSyncBadge ${isLoggedIn ? "cloudSyncBadgeReady" : ""}`}>
                {isLoggedIn ? "Google ログイン済み" : "Google 未ログイン"}
              </span>
              <span className={`cloudSyncBadge ${hasDriveAccessToken ? "cloudSyncBadgeReady" : ""}`}>
                {hasDriveAccessToken ? "Drive 連携済み" : "Drive 未連携"}
              </span>
              <span className={`cloudSyncBadge ${driveFolderId ? "cloudSyncBadgeReady" : ""}`}>
                {driveFolderId ? "保存先設定済み" : "保存先未設定"}
              </span>
              {isDriveAccessStale ? <span className="cloudSyncBadge">連携更新推奨</span> : null}
            </div>
          </div>
          <p className="cloudSyncCompactNote">
            {hasDriveAccessToken
              ? driveSessionSavedAtLabel
                ? `Drive 前回更新 ${driveSessionSavedAtLabel}`
                : "Drive 連携済み"
              : "Drive 未連携"}
            {" / "}
            {driveFolderId ? "保存先設定済み" : "保存先未設定"}
          </p>
          <form className="driveFolderForm" onSubmit={handleDriveFolderSubmit}>
            <label>
              <span>Drive 保存先フォルダ</span>
              <input
                value={driveFolderInput}
                onChange={(event) => setDriveFolderInput(event.target.value)}
                placeholder="フォルダURL または フォルダID"
                disabled={!isLoggedIn}
              />
            </label>
            <div className="cloudSyncActions cloudSyncActionsCompact">
              <button className="toolButton compactToolButton" type="submit" disabled={!isLoggedIn}>
                保存先を反映
              </button>
              <button
                className="toolButton compactToolButton"
                type="button"
                onClick={() => {
                  setDriveFolderInput("");
                  onConfigureDriveFolder("");
                }}
                disabled={!isLoggedIn || !driveFolderId}
              >
                保存先を解除
              </button>
            </div>
          </form>
          <div className="cloudSyncActions cloudSyncActionsCompact">
            <button
              className="toolButton compactToolButton"
              type="button"
              onClick={onGoogleSignIn}
              disabled={!isFirebaseConfigured()}
            >
              {isLoggedIn ? "Google / Drive 連携更新" : "Googleでログイン"}
            </button>
            {isLoggedIn ? (
              <button className="toolButton compactToolButton" type="button" onClick={onGoogleSignOut}>
                ログアウト
              </button>
            ) : null}
          </div>
        </article>

        <article className="cloudSyncCard">
          <div className="cloudSyncCardHeader">
            <h3>クラウド反映</h3>
          </div>
          <p className="cloudSyncCompactNote">この端末とクラウドの保存内容を確認しながら更新します。</p>
          <p className="cloudSyncCompactNote">{syncGuidance}</p>
          <div className="cloudSyncActions cloudSyncActionsCompact">
            <button className="toolButton compactToolButton" type="button" onClick={onSaveCurrentToCloud} disabled={!isLoggedIn}>
              この端末をクラウドへ保存
            </button>
            <button className="toolButton compactToolButton" type="button" onClick={onCloudLoad} disabled={!isLoggedIn}>
              クラウド同期
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

function getSyncGuidance(syncStatus: string) {
  if (syncStatus === "未同期の変更あり" || syncStatus === "クラウド保存失敗" || syncStatus === "クラウド競合") {
    return "この端末の内容を残したい場合は、先に「この端末をクラウドへ保存」を押してください。";
  }

  if (syncStatus === "Drive連携待ち" || syncStatus === "Drive保存先未設定" || syncStatus === "画像同期待ち") {
    return "写真の同期には Google / Drive 連携と保存先フォルダの設定が必要です。";
  }

  if (syncStatus === "クラウド同期済み") {
    return "同期済みです。別端末の更新を確認したい場合だけ「クラウド同期」を使います。";
  }

  return "ログイン後は変更が自動でクラウド保存されます。必要なときだけ手動で更新できます。";
}
