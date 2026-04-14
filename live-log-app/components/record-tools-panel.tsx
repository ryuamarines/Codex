"use client";

import { ChangeEvent, FormEvent, RefObject } from "react";
import type { ManualEntryInput } from "@/lib/live-entry-utils";

type PhotoUploadInput = {
  title: string;
  date: string;
  place: string;
  venue: string;
  artistsText: string;
  genre: string;
  memo: string;
  photoType: "signboard" | "eticket" | "paperTicket";
};

type BulkEditInput = {
  place: string;
  venue: string;
  genre: string;
};

type ActiveTool = "create" | "csv" | "photo" | "bulk" | null;

type RecordToolsPanelProps = {
  activeTool: ActiveTool;
  onToggleTool(tool: Exclude<ActiveTool, null>): void;
  query: string;
  onQueryChange(value: string): void;
  recordVisibilityFilter: "all" | "withPhotos" | "withUnsyncedImages";
  onRecordVisibilityFilterChange(value: "all" | "withPhotos" | "withUnsyncedImages"): void;
  filteredEntryCount: number;
  visibleSelectedCount: number;
  csvMessage: string;
  imageMessage: string;
  manualForm: ManualEntryInput;
  photoForm: PhotoUploadInput;
  bulkEdit: BulkEditInput;
  csvInputRef: RefObject<HTMLInputElement | null>;
  photoInputRef: RefObject<HTMLInputElement | null>;
  onManualSubmit(event: FormEvent<HTMLFormElement>): void;
  onCsvImport(event: ChangeEvent<HTMLInputElement>): void;
  onPhotoImport(event: ChangeEvent<HTMLInputElement>): void;
  onUpdateForm<K extends keyof ManualEntryInput>(key: K, value: ManualEntryInput[K]): void;
  onUpdatePhotoForm<K extends keyof PhotoUploadInput>(key: K, value: PhotoUploadInput[K]): void;
  onUpdateBulkEdit<K extends keyof BulkEditInput>(key: K, value: BulkEditInput[K]): void;
  onApplyBulkUpdate(): void;
  onDeleteSelectedEntries(): void;
};

export function RecordToolsPanel({
  activeTool,
  onToggleTool,
  query,
  onQueryChange,
  recordVisibilityFilter,
  onRecordVisibilityFilterChange,
  filteredEntryCount,
  visibleSelectedCount,
  csvMessage,
  imageMessage,
  manualForm,
  photoForm,
  bulkEdit,
  csvInputRef,
  photoInputRef,
  onManualSubmit,
  onCsvImport,
  onPhotoImport,
  onUpdateForm,
  onUpdatePhotoForm,
  onUpdateBulkEdit,
  onApplyBulkUpdate,
  onDeleteSelectedEntries
}: RecordToolsPanelProps) {
  return (
    <>
      <div className="listHeader">
        <div>
          <h2>一覧</h2>
          <p>{filteredEntryCount}件を表示中</p>
        </div>
        <div className="toolButtons">
          <button
            className={activeTool === "create" ? "toolButton activeToolButton" : "toolButton"}
            type="button"
            onClick={() => onToggleTool("create")}
          >
            新規登録
          </button>
          <button
            className={activeTool === "csv" ? "toolButton activeToolButton" : "toolButton"}
            type="button"
            onClick={() => onToggleTool("csv")}
          >
            CSV取込み
          </button>
          <button
            className={activeTool === "photo" ? "toolButton activeToolButton" : "toolButton"}
            type="button"
            onClick={() => onToggleTool("photo")}
          >
            写真取込み
          </button>
          <button
            className={activeTool === "bulk" ? "toolButton activeToolButton" : "toolButton"}
            type="button"
            onClick={() => onToggleTool("bulk")}
          >
            まとめ編集
          </button>
        </div>
      </div>

      <label className="searchBox">
        <span>検索</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="公演名 / 会場 / 出演者 / メモ"
        />
      </label>

      <div className="densityToggle">
        <button
          className={recordVisibilityFilter === "all" ? "toolButton activeToolButton" : "toolButton"}
          type="button"
          onClick={() => onRecordVisibilityFilterChange("all")}
        >
          全件
        </button>
        <button
          className={recordVisibilityFilter === "withPhotos" ? "toolButton activeToolButton" : "toolButton"}
          type="button"
          onClick={() => onRecordVisibilityFilterChange("withPhotos")}
        >
          写真あり
        </button>
        <button
          className={recordVisibilityFilter === "withUnsyncedImages" ? "toolButton activeToolButton" : "toolButton"}
          type="button"
          onClick={() => onRecordVisibilityFilterChange("withUnsyncedImages")}
        >
          未同期画像あり
        </button>
      </div>

      {activeTool ? (
        <div className="panel toolPanel">
          {activeTool === "create" ? (
            <form className="compactForm" onSubmit={onManualSubmit}>
              <div className="panelHeader">
                <h2>新規登録</h2>
                <p>登録機能は補助的位置づけにしています。</p>
              </div>
              <div className="compactGrid">
                <input
                  required
                  value={manualForm.title}
                  onChange={(event) => onUpdateForm("title", event.target.value)}
                  placeholder="公演名"
                />
                <input
                  required
                  type="date"
                  value={manualForm.date}
                  onChange={(event) => onUpdateForm("date", event.target.value)}
                />
                <input
                  value={manualForm.place}
                  onChange={(event) => onUpdateForm("place", event.target.value)}
                  placeholder="場所"
                />
                <input
                  required
                  value={manualForm.venue}
                  onChange={(event) => onUpdateForm("venue", event.target.value)}
                  placeholder="会場"
                />
                <input
                  required
                  value={manualForm.artistsText}
                  onChange={(event) => onUpdateForm("artistsText", event.target.value)}
                  placeholder="出演者"
                />
                <input
                  value={manualForm.genre}
                  onChange={(event) => onUpdateForm("genre", event.target.value)}
                  placeholder="ジャンル"
                />
                <textarea
                  rows={3}
                  value={manualForm.memo}
                  onChange={(event) => onUpdateForm("memo", event.target.value)}
                  placeholder="メモ"
                />
              </div>
              <button className="actionButton" type="submit">
                追加する
              </button>
            </form>
          ) : null}

          {activeTool === "csv" ? (
            <section className="compactForm">
              <div className="panelHeader">
                <h2>CSV取込み</h2>
                <p>必要なときだけ使う補助機能です。</p>
              </div>
              <p className="importHint">{csvMessage}</p>
              <button
                className="actionButton secondaryButton"
                type="button"
                onClick={() => csvInputRef.current?.click()}
              >
                CSV を選択
              </button>
              <input
                ref={csvInputRef}
                className="hiddenInput"
                type="file"
                accept=".csv,text/csv"
                onChange={onCsvImport}
              />
              <code className="csvExample">
                date,event_title,venue,venues_raw,area,artists,event_type,notes
              </code>
            </section>
          ) : null}

          {activeTool === "photo" ? (
            <section className="compactForm">
              <div className="panelHeader">
                <h2>写真取込み</h2>
                <p>既存レコードに紐づけ、なければ新規作成します。</p>
              </div>
              <div className="compactGrid">
                <input
                  value={photoForm.title}
                  onChange={(event) => onUpdatePhotoForm("title", event.target.value)}
                  placeholder="公演名"
                />
                <input
                  type="date"
                  value={photoForm.date}
                  onChange={(event) => onUpdatePhotoForm("date", event.target.value)}
                />
                <input
                  value={photoForm.place}
                  onChange={(event) => onUpdatePhotoForm("place", event.target.value)}
                  placeholder="場所"
                />
                <input
                  value={photoForm.venue}
                  onChange={(event) => onUpdatePhotoForm("venue", event.target.value)}
                  placeholder="会場"
                />
                <input
                  value={photoForm.artistsText}
                  onChange={(event) => onUpdatePhotoForm("artistsText", event.target.value)}
                  placeholder="出演者"
                />
                <input
                  value={photoForm.genre}
                  onChange={(event) => onUpdatePhotoForm("genre", event.target.value)}
                  placeholder="ジャンル"
                />
                <select
                  value={photoForm.photoType}
                  onChange={(event) =>
                    onUpdatePhotoForm("photoType", event.target.value as PhotoUploadInput["photoType"])
                  }
                >
                  <option value="signboard">立て看板</option>
                  <option value="eticket">電子チケット</option>
                  <option value="paperTicket">リアルチケット</option>
                </select>
                <textarea
                  rows={3}
                  value={photoForm.memo}
                  onChange={(event) => onUpdatePhotoForm("memo", event.target.value)}
                  placeholder="メモ"
                />
              </div>
              <button className="actionButton" type="button" onClick={() => photoInputRef.current?.click()}>
                写真を選択
              </button>
              <input
                ref={photoInputRef}
                className="hiddenInput"
                type="file"
                accept="image/*"
                multiple
                onChange={onPhotoImport}
              />
              <p className="importHint">{imageMessage}</p>
            </section>
          ) : null}

          {activeTool === "bulk" ? (
            <section className="compactForm">
              <div className="panelHeader">
                <h2>まとめ編集</h2>
                <p>{visibleSelectedCount}件選択中。空欄は変更しません。</p>
              </div>
              <div className="compactGrid">
                <input
                  value={bulkEdit.place}
                  onChange={(event) => onUpdateBulkEdit("place", event.target.value)}
                  placeholder="場所を一括更新"
                />
                <input
                  value={bulkEdit.venue}
                  onChange={(event) => onUpdateBulkEdit("venue", event.target.value)}
                  placeholder="会場を一括更新"
                />
                <input
                  value={bulkEdit.genre}
                  onChange={(event) => onUpdateBulkEdit("genre", event.target.value)}
                  placeholder="ジャンルを一括更新"
                />
              </div>
              <div className="bulkActions">
                <button className="actionButton" type="button" onClick={onApplyBulkUpdate}>
                  選択行を更新
                </button>
                <button className="actionButton dangerButton" type="button" onClick={onDeleteSelectedEntries}>
                  選択行を削除
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
