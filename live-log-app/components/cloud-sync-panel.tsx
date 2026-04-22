"use client";

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
  onConfigureDriveFolder(): void;
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
  return (
    <section className="panel cloudSyncPanel">
      <div className="cloudSyncPanelHeader">
        <div>
          <p className="eyebrow">Cloud</p>
          <h2>ログインと同期</h2>
          <p className="cloudSyncPanelLead">
            Google / Drive の接続と、この端末のクラウド保存はここでまとめて扱います。
          </p>
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
            <h3>Google / Drive</h3>
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
          <div className="cloudSyncChecklist">
            <article className="cloudSyncChecklistItem">
              <strong>Google ログイン</strong>
              <p>{isLoggedIn ? "この端末でログイン済みです" : "まずここから始めます"}</p>
            </article>
            <article className="cloudSyncChecklistItem">
              <strong>Drive 連携</strong>
              <p>
                {hasDriveAccessToken
                  ? `利用できます${driveSessionSavedAtLabel ? ` / 前回更新 ${driveSessionSavedAtLabel}` : ""}`
                  : "未接続です"}
              </p>
            </article>
            <article className="cloudSyncChecklistItem">
              <strong>Drive 保存先</strong>
              <p>{driveFolderId ? "設定済みです" : "未設定です"}</p>
            </article>
          </div>
          <div className="cloudSyncActions">
            <button
              className="toolButton"
              type="button"
              onClick={onGoogleSignIn}
              disabled={!isFirebaseConfigured()}
            >
              {isLoggedIn ? "Google / Drive 連携更新" : "Googleでログイン"}
            </button>
            <button
              className="toolButton"
              type="button"
              onClick={onConfigureDriveFolder}
              disabled={!isLoggedIn}
            >
              {driveFolderId ? "Drive保存先変更" : "Drive保存先設定"}
            </button>
            {isLoggedIn ? (
              <button className="toolButton" type="button" onClick={onGoogleSignOut}>
                ログアウト
              </button>
            ) : null}
          </div>
        </article>

        <article className="cloudSyncCard">
          <div className="cloudSyncCardHeader">
            <h3>クラウド同期</h3>
            <p className="cloudSyncCardNote">
              この端末の変更を保存するか、クラウドの内容を読み込むかをここで選びます。
            </p>
          </div>
          <div className="cloudSyncChecklist">
            <article className="cloudSyncChecklistItem">
              <strong>この端末を保存</strong>
              <p>いま見えている内容をクラウドへ反映します。</p>
            </article>
            <article className="cloudSyncChecklistItem">
              <strong>クラウド同期</strong>
              <p>クラウド側の内容を読み込みます。</p>
            </article>
            <article className="cloudSyncChecklistItem">
              <strong>クラウドで置き換え</strong>
              <p>この端末の表示をクラウド内容で上書きします。</p>
            </article>
          </div>
          <div className="cloudSyncActions">
            <button className="toolButton" type="button" onClick={onSaveCurrentToCloud} disabled={!isLoggedIn}>
              この端末をクラウドへ保存
            </button>
            <button className="toolButton" type="button" onClick={onCloudLoad} disabled={!isLoggedIn}>
              クラウド同期
            </button>
            <button className="toolButton" type="button" onClick={onForceCloudReplace} disabled={!isLoggedIn}>
              この端末をクラウドで置き換え
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
