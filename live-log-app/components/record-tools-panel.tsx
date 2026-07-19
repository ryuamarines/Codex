"use client";

import { ChangeEvent, FormEvent, RefObject, useState } from "react";
import type { ManualEntryInput } from "@/lib/live-entry-utils";
import type { AddImageReview, AddPhotoType } from "@/lib/live-add-flow";

type BulkEditInput = {
  place: string;
  venue: string;
  genre: string;
};

type ActiveTool = "csv" | "bulk" | null;

type RecordToolsPanelProps = {
  imageMessage: string;
  manualForm: ManualEntryInput;
  addImageReview: AddImageReview | null;
  placeOptions: string[];
  genreOptions: string[];
  photoInputRef: RefObject<HTMLInputElement | null>;
  onManualSubmit(event: FormEvent<HTMLFormElement>): void;
  onPhotoImport(event: ChangeEvent<HTMLInputElement>): void;
  onOpenAddPhotoPicker(photoType: AddPhotoType): void;
  onClearAddImageReview(): void;
  onRetryAddImageOcr(): void;
  onAttachAddImageToMatch(): void;
  onUpdateForm<K extends keyof ManualEntryInput>(key: K, value: ManualEntryInput[K]): void;
};

type RecordUtilitiesPanelProps = {
  activeTool: ActiveTool;
  onToggleTool(tool: Exclude<ActiveTool, null>): void;
  query: string;
  onQueryChange(value: string): void;
  recordVisibilityFilter: "all" | "withPhotos" | "withUnsyncedImages";
  onRecordVisibilityFilterChange(value: "all" | "withPhotos" | "withUnsyncedImages"): void;
  filteredEntryCount: number;
  visibleSelectedCount: number;
  csvMessage: string;
  bulkEdit: BulkEditInput;
  csvInputRef: RefObject<HTMLInputElement | null>;
  onCsvImport(event: ChangeEvent<HTMLInputElement>): void;
  onUpdateBulkEdit<K extends keyof BulkEditInput>(key: K, value: BulkEditInput[K]): void;
  onApplyBulkUpdate(): void;
  onDeleteSelectedEntries(): void;
};

const REGION_GROUPS = [
  { label: "北海道", options: ["北海道"] },
  { label: "東北", options: ["青森", "岩手", "宮城", "秋田", "山形", "福島"] },
  { label: "関東", options: ["茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川"] },
  { label: "中部", options: ["新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知"] },
  { label: "近畿", options: ["三重", "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山"] },
  { label: "中国", options: ["鳥取", "島根", "岡山", "広島", "山口"] },
  { label: "四国", options: ["徳島", "香川", "愛媛", "高知"] },
  { label: "九州・沖縄", options: ["福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄"] }
] as const;

const REGION_LABEL_SET = new Set<string>(REGION_GROUPS.flatMap((group) => group.options));
const PLACE_EXCLUDE_SET = new Set([
  "ワンマン",
  "対バン",
  "フェス",
  "ツーマン",
  "スリーマン",
  "サーキット",
  "イベント"
]);

export function RecordToolsPanel({
  imageMessage,
  manualForm,
  addImageReview,
  placeOptions,
  genreOptions,
  photoInputRef,
  onManualSubmit,
  onPhotoImport,
  onOpenAddPhotoPicker,
  onClearAddImageReview,
  onRetryAddImageOcr,
  onAttachAddImageToMatch,
  onUpdateForm
}: RecordToolsPanelProps) {
  const [entryMode, setEntryMode] = useState<"capture" | "manual">("capture");
  const normalizedPlaces = Array.from(
    new Set(
      placeOptions
        .map((option) => option.trim())
        .filter((option) => option && !PLACE_EXCLUDE_SET.has(option))
    )
  );
  const availablePlaceOptions =
    manualForm.place && !normalizedPlaces.includes(manualForm.place)
      ? [manualForm.place, ...normalizedPlaces]
      : normalizedPlaces;
  const groupedPlaceOptions = REGION_GROUPS.map((group) => ({
    ...group,
    options: group.options.filter((option) => availablePlaceOptions.includes(option))
  })).filter((group) => group.options.length > 0);
  const otherPlaceOptions = availablePlaceOptions.filter((option) => !REGION_LABEL_SET.has(option));
  const availableGenreOptions = manualForm.genre && !genreOptions.includes(manualForm.genre)
    ? [manualForm.genre, ...genreOptions]
    : genreOptions;
  const showEntryForm = entryMode === "manual" || Boolean(addImageReview);
  const isImageBusy = addImageReview?.status === "processing" || addImageReview?.status === "saving";

  return (
    <>
      <section className="panel archiveAddComposer">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Add Event</p>
            <h2>ライブを追加する</h2>
          </div>
        </div>

        <div className="archiveCaptureChoices" role="group" aria-label="追加方法">
          <button
            type="button"
            onClick={() => {
              setEntryMode("capture");
              onOpenAddPhotoPicker("eticket");
            }}
          >
            電子チケットを選ぶ
          </button>
          <button
            type="button"
            onClick={() => {
              setEntryMode("capture");
              onOpenAddPhotoPicker("signboard");
            }}
          >
            立て看板を撮る / 選ぶ
          </button>
          <button
            className={entryMode === "manual" && !addImageReview ? "activeCaptureChoice" : ""}
            type="button"
            onClick={() => setEntryMode("manual")}
          >
            手入力
          </button>
        </div>
        <input
          ref={photoInputRef}
          className="hiddenInput"
          type="file"
          accept="image/*"
          onChange={onPhotoImport}
        />

        {addImageReview ? (
          <section className="archiveAddImageReview" aria-live="polite">
            <img src={addImageReview.previewUrl} alt={addImageReview.fileName} />
            <div className="archiveAddImageReviewBody">
              <strong>{addImageReview.fileName}</strong>
              <span>
                {addImageReview.status === "processing"
                  ? `解析中 ${Math.round(addImageReview.progress * 100)}%`
                  : addImageReview.status === "saving"
                    ? "画像を保存中"
                    : addImageReview.status === "review"
                      ? "候補を反映済み"
                      : "要確認"}
              </span>
              <small>{addImageReview.error ?? imageMessage}</small>
              {addImageReview.matchedEntryId ? (
                <button
                  className="archiveMatchedEntryAction"
                  type="button"
                  disabled={isImageBusy}
                  onClick={onAttachAddImageToMatch}
                >
                  「{addImageReview.matchedEntryTitle}」に画像を追加
                  {addImageReview.matchReason ? <small>{addImageReview.matchReason}</small> : null}
                </button>
              ) : null}
              <div className="archiveAddImageReviewActions">
                <button type="button" disabled={isImageBusy} onClick={onRetryAddImageOcr}>
                  再解析
                </button>
                <button type="button" disabled={addImageReview.status === "saving"} onClick={onClearAddImageReview}>
                  画像を外す
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {showEntryForm ? <form className="archiveAddSteps" onSubmit={onManualSubmit}>
          <section className="archiveAddStep">
            <div className="archiveAddStepHeader">
              <span>1</span>
              <div>
                <strong>基本情報</strong>
                <small>まずは日付・公演名・会場だけで始められます。</small>
              </div>
            </div>
            <div className="archiveAddGrid archiveAddGridPrimary">
              <label className="archiveField">
                <span>日付</span>
                <input
                  required
                  type="date"
                  value={manualForm.date}
                  onChange={(event) => onUpdateForm("date", event.target.value)}
                />
              </label>
              <label className="archiveField archiveFieldWide">
                <span>公演名</span>
                <input
                  required
                  value={manualForm.title}
                  onChange={(event) => onUpdateForm("title", event.target.value)}
                  placeholder="公演名"
                />
              </label>
              <label className="archiveField">
                <span>会場</span>
                <input
                  required
                  value={manualForm.venue}
                  onChange={(event) => onUpdateForm("venue", event.target.value)}
                  placeholder="会場"
                />
              </label>
              <label className="archiveField">
                <span>地域</span>
                <select
                  value={manualForm.place}
                  onChange={(event) => onUpdateForm("place", event.target.value)}
                >
                  <option value="">未選択</option>
                  {groupedPlaceOptions.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {otherPlaceOptions.length > 0 ? (
                    <optgroup label="その他">
                      {otherPlaceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
            </div>
          </section>

          <section className="archiveAddStep">
            <div className="archiveAddStepHeader">
              <span>2</span>
              <div>
                <strong>出演アーティストとメモ</strong>
                <small>あとで追記しても大丈夫です。</small>
              </div>
            </div>
            <div className="archiveAddGrid">
              <label className="archiveField archiveFieldWide">
                <span>出演アーティスト</span>
                <input
                  value={manualForm.artistsText}
                  onChange={(event) => onUpdateForm("artistsText", event.target.value)}
                  placeholder="出演者（あとで追加でもOK）"
                />
                <small className="importHint">
                  複数入れるときは `UNISON SQUARE GARDEN / SUPER BEAVER / ASIAN KUNG-FU GENERATION` のように `/`
                  区切りで入力します。
                </small>
              </label>
              <label className="archiveField">
                <span>形式</span>
                <select
                  value={manualForm.genre}
                  onChange={(event) => onUpdateForm("genre", event.target.value)}
                >
                  <option value="">未選択</option>
                  {availableGenreOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="archiveField archiveFieldWide">
                <span>メモ</span>
                <textarea
                  rows={4}
                  value={manualForm.memo}
                  onChange={(event) => onUpdateForm("memo", event.target.value)}
                  placeholder="メモ"
                />
              </label>
            </div>
          </section>

          <div className="archiveAddSubmitRow">
            <div className="archiveAddSubmitHint">
              <strong>この内容で新しい記録を作成します。</strong>
              <small>追加したあとはタイムラインでこの記録を開きます。写真を選んでいれば、そのまま同じ記録に添えて追加されます。</small>
            </div>
            <button className="actionButton" type="submit" disabled={isImageBusy}>
              {addImageReview ? "確認して登録" : "記録を追加"}
            </button>
          </div>
        </form> : null}
      </section>
    </>
  );
}

export function RecordUtilitiesPanel({
  activeTool,
  onToggleTool,
  query,
  onQueryChange,
  recordVisibilityFilter,
  onRecordVisibilityFilterChange,
  filteredEntryCount,
  visibleSelectedCount,
  csvMessage,
  bulkEdit,
  csvInputRef,
  onCsvImport,
  onUpdateBulkEdit,
  onApplyBulkUpdate,
  onDeleteSelectedEntries
}: RecordUtilitiesPanelProps) {
  return (
      <section className="panel archiveAddUtilities">
        <div className="archiveSectionHeader">
          <div>
            <p className="eyebrow">Utilities</p>
            <h2>検索と補助操作</h2>
            <p>既存記録を探したり、CSV と一括編集を使うときだけ開きます。</p>
          </div>
          <div className="toolButtons">
            <button
              className={activeTool === "csv" ? "toolButton activeToolButton" : "toolButton"}
              type="button"
              onClick={() => onToggleTool("csv")}
            >
              CSV取込み
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

        <div className="archiveAddUtilityGrid">
          <label className="searchBox">
            <span>既存記録を探す</span>
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
              全件 {filteredEntryCount}
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

          {activeTool === "csv" ? (
            <section className="archiveUtilityCard">
              <div className="panelHeader">
                <h2>CSV取込み</h2>
                <p>大量登録をしたいときだけ使う補助機能です。</p>
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
              <code className="csvExample">date,event_title,venue,venues_raw,area,artists,event_type,notes</code>
            </section>
          ) : null}

          {activeTool === "bulk" ? (
            <section className="archiveUtilityCard">
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
      </section>
  );
}
