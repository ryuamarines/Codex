"use client";

import { ChangeEvent, RefObject, useEffect, useState } from "react";
import { countRenderableImages, countUnsyncedImages, isRenderableImage } from "@/lib/live-image-state";
import type { LiveEntry } from "@/lib/types";

type RecordDetailPanelProps = {
  selectedEntry: LiveEntry | null;
  detailPhotoInputRef: RefObject<HTMLInputElement | null>;
  variant?: "panel" | "drawer" | "overlay";
  isOpen?: boolean;
  onOpenPhotoPicker(): void;
  onClose?(): void;
  onEntryImageUpload(entryId: string, event: ChangeEvent<HTMLInputElement>): void;
  onDeleteImage?(entryId: string, imageId: string): void;
  onRetryImageSync?(entryId: string, imageId: string): void;
  onRetryEntryImageSync?(entryId: string): void;
  onDeleteEntry?(entryId: string): void;
  onUpdateEntryField(
    entryId: string,
    key: keyof Omit<LiveEntry, "id" | "images">,
    value: string
  ): void;
};

export function RecordDetailPanel({
  selectedEntry,
  detailPhotoInputRef,
  variant = "panel",
  isOpen = true,
  onOpenPhotoPicker,
  onClose,
  onEntryImageUpload,
  onDeleteImage,
  onRetryImageSync,
  onRetryEntryImageSync,
  onDeleteEntry,
  onUpdateEntryField
}: RecordDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const renderableImages = selectedEntry ? selectedEntry.images.filter(isRenderableImage) : [];
  const statusOnlyImages = selectedEntry
    ? selectedEntry.images.filter((image) => !isRenderableImage(image))
    : [];
  const renderableImageCount = renderableImages.length;
  const unsyncedImageCount = selectedEntry ? countUnsyncedImages(selectedEntry.images) : 0;
  const hasRetryableImages = Boolean(
    selectedEntry?.images.some(
      (image) => image.storageStatus === "local_pending" || image.storageStatus === "error"
    )
  );

  useEffect(() => {
    setIsEditing(false);
  }, [selectedEntry?.id, variant]);

  return (
    <section
      className={`panel detailPanel ${
        variant === "drawer"
          ? "detailPanelDrawer"
          : variant === "overlay"
            ? "detailPanelOverlay"
            : "detailPanelTop"
      } ${
        (variant === "drawer" || variant === "overlay") && isOpen ? "detailPanelDrawerOpen" : ""
      }`}
    >
      {selectedEntry ? (
        <>
          <div className="detailHeader">
            <div>
              <p className="eyebrow">Detail</p>
              <h2>{selectedEntry.title}</h2>
            </div>
            <div className="detailHeaderActions">
              <button className="toolButton" type="button" onClick={() => setIsEditing((current) => !current)}>
                {isEditing ? "修正終了" : "修正する"}
              </button>
              <button className="actionButton secondaryButton" type="button" onClick={onOpenPhotoPicker}>
                この記録に写真追加
              </button>
              {onDeleteEntry ? (
                <button
                  className="toolButton imageDeleteButton"
                  type="button"
                  onClick={() => onDeleteEntry(selectedEntry.id)}
                >
                  この記録を削除
                </button>
              ) : null}
              {(variant === "drawer" || variant === "overlay") && onClose ? (
                <button className="toolButton" type="button" onClick={onClose}>
                  閉じる
                </button>
              ) : null}
            </div>
            <input
              ref={detailPhotoInputRef}
              className="hiddenInput"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => onEntryImageUpload(selectedEntry.id, event)}
            />
          </div>

          <div className="detailForm">
            <label>
              <span>公演名</span>
              <input
                value={selectedEntry.title}
                readOnly={!isEditing}
                className={!isEditing ? "readonlyField" : ""}
                onChange={(event) => onUpdateEntryField(selectedEntry.id, "title", event.target.value)}
              />
            </label>
            <label>
              <span>日付</span>
              <input
                value={selectedEntry.date}
                readOnly={!isEditing}
                className={!isEditing ? "readonlyField" : ""}
                onChange={(event) => onUpdateEntryField(selectedEntry.id, "date", event.target.value)}
              />
            </label>
            <label>
              <span>場所</span>
              <input
                value={selectedEntry.place}
                readOnly={!isEditing}
                className={!isEditing ? "readonlyField" : ""}
                onChange={(event) => onUpdateEntryField(selectedEntry.id, "place", event.target.value)}
              />
            </label>
            <label>
              <span>会場</span>
              <input
                value={selectedEntry.venue}
                readOnly={!isEditing}
                className={!isEditing ? "readonlyField" : ""}
                onChange={(event) => onUpdateEntryField(selectedEntry.id, "venue", event.target.value)}
              />
            </label>
            <label>
              <span>出演者</span>
              <input
                value={selectedEntry.artists.join(" / ")}
                readOnly={!isEditing}
                className={!isEditing ? "readonlyField" : ""}
                onChange={(event) => onUpdateEntryField(selectedEntry.id, "artists", event.target.value)}
              />
            </label>
            <label>
              <span>開催年</span>
              <input value={extractYear(selectedEntry.date)} readOnly />
            </label>
            <label>
              <span>ジャンル</span>
              <input
                value={selectedEntry.genre}
                readOnly={!isEditing}
                className={!isEditing ? "readonlyField" : ""}
                onChange={(event) => onUpdateEntryField(selectedEntry.id, "genre", event.target.value)}
              />
            </label>
            <label className="detailMemo">
              <span>メモ</span>
              <textarea
                rows={5}
                value={selectedEntry.memo}
                readOnly={!isEditing}
                className={!isEditing ? "readonlyField" : ""}
                onChange={(event) => onUpdateEntryField(selectedEntry.id, "memo", event.target.value)}
              />
            </label>
          </div>

          <section className="photoSection">
            <div className="panelHeader">
              <div>
                <h2>写真</h2>
                <p>
                  {renderableImageCount}件
                  {unsyncedImageCount > 0 ? ` / 未同期${unsyncedImageCount}` : ""}
                </p>
              </div>
              {onRetryEntryImageSync && hasRetryableImages ? (
                <button
                  className="toolButton"
                  type="button"
                  onClick={() => onRetryEntryImageSync(selectedEntry.id)}
                >
                  未同期画像を同期
                </button>
              ) : null}
            </div>
            {renderableImages.length > 0 ? (
              <div className="imageGrid">
                {renderableImages.map((image) => (
                  <figure key={image.id} className="imageCard">
                    <DriveAwareImage
                      src={image.src}
                      alt={image.caption ?? selectedEntry.title}
                      driveWebUrl={image.driveWebUrl}
                    />
                    <figcaption>
                      <strong>{formatImageType(image.type)}</strong>
                      {image.storageStatus === "local_pending" ? (
                        <em className="imageSyncBadge">未同期</em>
                      ) : null}
                      {image.storageStatus === "syncing" ? (
                        <em className="imageSyncBadge">同期中</em>
                      ) : null}
                      {image.storageStatus === "error" ? (
                        <em className="imageSyncBadge imageSyncBadgeError">同期失敗</em>
                      ) : null}
                      <span>{image.caption ?? "画像"}</span>
                      <small className="imageSyncDescription">{describeImageSyncState(image.storageStatus)}</small>
                      {image.uploadError ? <small>{image.uploadError}</small> : null}
                      {image.driveWebUrl ? (
                        <a
                          className="imageDriveLink"
                          href={image.driveWebUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Driveで開く
                        </a>
                      ) : null}
                      {onDeleteImage ? (
                        <button
                          className="toolButton imageDeleteButton"
                          type="button"
                          onClick={() => onDeleteImage(selectedEntry.id, image.id)}
                        >
                          削除
                        </button>
                      ) : null}
                      {onRetryImageSync &&
                      (image.storageStatus === "local_pending" || image.storageStatus === "error") ? (
                        <button
                          className="toolButton imageRetryButton"
                          type="button"
                          onClick={() => onRetryImageSync(selectedEntry.id, image.id)}
                        >
                          再試行
                        </button>
                      ) : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : statusOnlyImages.length === 0 ? (
              <p className="emptyInline">まだ写真はありません。</p>
            ) : null}
            {statusOnlyImages.length > 0 ? (
              <div className="detailStatusOnlyImages">
                <h3>未同期・要確認</h3>
                <div className="detailStatusOnlyList">
                  {statusOnlyImages.map((image) => (
                    <article key={image.id} className="detailStatusOnlyCard">
                      <div>
                        <strong>{formatImageType(image.type)}</strong>
                        <span>{image.caption ?? "画像"}</span>
                        <small className="imageSyncDescription">
                          {describeImageSyncState(image.storageStatus)}
                        </small>
                        {image.uploadError ? <small>{image.uploadError}</small> : null}
                      </div>
                      <div className="detailStatusOnlyActions">
                        {onDeleteImage ? (
                          <button
                            className="toolButton imageDeleteButton"
                            type="button"
                            onClick={() => onDeleteImage(selectedEntry.id, image.id)}
                          >
                            削除
                          </button>
                        ) : null}
                        {onRetryImageSync &&
                        (image.storageStatus === "local_pending" || image.storageStatus === "error") ? (
                          <button
                            className="toolButton imageRetryButton"
                            type="button"
                            onClick={() => onRetryImageSync(selectedEntry.id, image.id)}
                          >
                            再試行
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <div className="emptyState">
          <h2>記録を選択してください</h2>
          <p>一覧から 1 件選ぶと、ここで詳細と編集ができます。</p>
        </div>
      )}
    </section>
  );
}

function DriveAwareImage({
  src,
  alt,
  driveWebUrl
}: {
  src: string;
  alt: string;
  driveWebUrl?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src) {
    return (
      <div className="imageFallback">
        <span>この端末には画像のプレビューがありません</span>
        {driveWebUrl ? (
          <a className="imageDriveLink" href={driveWebUrl} target="_blank" rel="noreferrer">
            Driveで開く
          </a>
        ) : (
          <small>画像原本の同期待ちです</small>
        )}
      </div>
    );
  }

  if (failed && driveWebUrl) {
    return (
      <div className="imageFallback">
        <span>このブラウザではプレビューできません</span>
        <a className="imageDriveLink" href={driveWebUrl} target="_blank" rel="noreferrer">
          Driveで開く
        </a>
      </div>
    );
  }

  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

function extractYear(date: string) {
  return date.slice(0, 4);
}

function formatImageType(type: "signboard" | "eticket" | "paperTicket") {
  if (type === "signboard") {
    return "立て看板";
  }

  if (type === "eticket") {
    return "電子チケット";
  }

  return "リアルチケット";
}

function describeImageSyncState(status: LiveEntry["images"][number]["storageStatus"]) {
  if (status === "local_pending") {
    return "この端末にだけ原本があります。Drive へ保存すると他端末でも追えます。";
  }

  if (status === "syncing") {
    return "Google Drive へ保存中です。完了すると他端末でも Drive リンクが見えます。";
  }

  if (status === "error") {
    return "Google Drive への保存に失敗しています。再試行か削除で整理できます。";
  }

  return "Google Drive 保存済みです。プレビューできないときも Drive から開けます。";
}
