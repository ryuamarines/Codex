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
  onForceCloudReplace(): void;
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
  onCloudLoad,
  onForceCloudReplace
}: CloudSyncPanelProps) {
  const [driveFolderInput, setDriveFolderInput] = useState(driveFolderId);

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
          <p className="cloudSyncCompactNote">この端末とクラウドの保存内容をここで更新します。</p>
          <div className="cloudSyncActions cloudSyncActionsCompact">
            <button className="toolButton compactToolButton" type="button" onClick={onSaveCurrentToCloud} disabled={!isLoggedIn}>
              この端末をクラウドへ保存
            </button>
            <button className="toolButton compactToolButton" type="button" onClick={onCloudLoad} disabled={!isLoggedIn}>
              クラウド同期
            </button>
            <button className="toolButton compactToolButton" type="button" onClick={onForceCloudReplace} disabled={!isLoggedIn}>
              クラウド版を再読込
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
