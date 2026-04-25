"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  createBatchImportItems,
  extractCandidatesFromText,
  mapBatchTypeToEntryImageType,
  refreshBatchImportItem
} from "@/lib/batch-image-import";
import {
  type ArchiveImageService
} from "@/lib/archive-image-service";
import { runImageOcr } from "@/lib/image-ocr-service";
import { mergeImagesWithDedup } from "@/lib/live-entry-actions";
import { createEntry, parseArtists } from "@/lib/live-entry-utils";
import type {
  BatchImageType,
  BatchImportItem,
  BatchReviewState,
  ExtractedImageCandidate,
  LiveEntry
} from "@/lib/types";

type BatchImportBoardProps = {
  entries: LiveEntry[];
  imageService: ArchiveImageService;
  onApply(entries: LiveEntry[] | ((current: LiveEntry[]) => LiveEntry[])): void;
  onLinkedToEntry?(entryId: string): void;
};

type BatchImportBoardItem = BatchImportItem & {
  file: File;
  approved: boolean;
  ocrStatus: "idle" | "processing" | "done" | "error";
  ocrText: string;
  ocrConfidence: number | null;
  ocrError?: string;
};

type ItemActionState = {
  tone: "info" | "error";
  message: string;
  progress?: number;
};

const REVIEW_STATE_LABELS: Record<BatchReviewState, string> = {
  unreviewed: "未確認",
  existing_match: "既存公演候補あり",
  new_candidate: "新規候補",
  attachment_only: "添付のみ",
  excluded: "除外",
  confirmed: "確定済み"
};

const TYPE_LABELS: Record<BatchImageType, string> = {
  ticket: "チケット",
  signboard: "立て看板",
  other: "その他"
};

export function BatchImportBoard({
  entries,
  imageService,
  onApply,
  onLinkedToEntry
}: BatchImportBoardProps) {
  const [items, setItems] = useState<BatchImportBoardItem[]>([]);
  const [processingItemIds, setProcessingItemIds] = useState<string[]>([]);
  const [itemActionStates, setItemActionStates] = useState<Record<string, ItemActionState>>({});
  const [bulkReviewState, setBulkReviewState] = useState<BatchReviewState>("existing_match");
  const [message, setMessage] = useState(
    "複数画像を投入すると、仮分類・候補抽出・既存公演との照合を一覧で整理できます。Google / Drive の設定は上の「ログインと同期」で行います。"
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedCount = useMemo(() => items.filter((item) => item.selected).length, [items]);
  const pendingCount = useMemo(
    () => items.filter((item) => !item.approved && item.reviewState !== "excluded").length,
    [items]
  );
  const approvedCount = useMemo(() => items.filter((item) => item.approved).length, [items]);

  function updateItem(itemId: string, updater: (item: BatchImportBoardItem) => BatchImportBoardItem) {
    setItems((current) => current.map((item) => (item.id === itemId ? updater(item) : item)));
  }

  function updateSelectedItems(updater: (item: BatchImportBoardItem) => BatchImportBoardItem) {
    setItems((current) => current.map((item) => (item.selected ? updater(item) : item)));
  }

  function applyExtractedPatch(
    itemId: string,
    patch: Partial<ExtractedImageCandidate>,
    nextType?: BatchImageType
  ) {
    updateItem(itemId, (current) => {
      const refreshed = refreshBatchImportItem(
        {
          ...current,
          imageType: nextType ?? current.imageType,
          extracted: {
            ...current.extracted,
            ...patch
          }
        },
        entries
      );

      return {
        ...current,
        ...refreshed
      };
    });
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    const nextItems = createBatchImportItems(files, entries).map((item, index) => ({
      ...item,
      file: files[index],
      approved: false,
      ocrStatus: "idle" as const,
      ocrText: "",
      ocrConfidence: null
    }));
    setItems((current) => [...nextItems, ...current]);
    setMessage(`${files.length} 枚を取り込み候補へ追加しました。`);
    event.target.value = "";
  }

  function recheckSelectedItems() {
    if (selectedCount === 0) {
      setMessage("再照合する画像を選んでください。");
      return;
    }

    updateSelectedItems((item) => ({
      ...item,
      ...refreshBatchImportItem(item, entries)
    }));
    setMessage("選択した画像の候補を再照合しました。");
  }

  async function runOcrForItem(itemId: string) {
    const target = items.find((item) => item.id === itemId);

    if (!target) {
      return;
    }

    updateItem(itemId, (current) => ({
      ...current,
      ocrStatus: "processing",
      ocrError: undefined
    }));

    try {
      const result = await runImageOcr(target.file, target.imageType);
      const extractedFromOcr = extractCandidatesFromText(
        result.text,
        target.imageType,
        entries,
        target.extracted.titleFragment || target.fileName.replace(/\.[^.]+$/, "")
      );

      updateItem(itemId, (current) => {
        const refreshed = refreshBatchImportItem(
          {
            ...current,
            extracted: {
              ...current.extracted,
              ...mergeExtractedCandidates(current.extracted, extractedFromOcr),
              confidence: Math.max(current.extracted.confidence, extractedFromOcr.confidence)
            }
          },
          entries
        );

        return {
          ...current,
          ...refreshed,
          ocrStatus: "done",
          ocrText: result.text,
          ocrConfidence: result.confidence,
          ocrError: undefined
        };
      });
    } catch (error) {
      updateItem(itemId, (current) => ({
        ...current,
        ocrStatus: "error",
        ocrError: error instanceof Error ? error.message : "OCR に失敗しました。"
      }));
    }
  }

  async function runOcrForSelected() {
    const targets = items.filter(
      (item) => item.selected && item.reviewState !== "confirmed" && item.reviewState !== "excluded"
    );

    if (targets.length === 0) {
      setMessage("OCR を実行する画像を選んでください。");
      return;
    }

    setMessage(`${targets.length} 件に OCR を実行しています。`);

    for (const item of targets) {
      await runOcrForItem(item.id);
    }

    setMessage(`${targets.length} 件の OCR を反映しました。候補を確認して確定してください。`);
  }

  async function confirmSelectedItems() {
    const targets = items.filter((item) => item.approved && item.reviewState !== "confirmed");

    if (targets.length === 0) {
      setMessage("まず候補を確定してください。");
      return;
    }

    let nextEntries = [...entries];
    let applied = 0;
    let skipped = 0;
    let duplicateCount = 0;

    for (const item of targets) {
      if (item.reviewState === "excluded") {
        applied += 1;
        continue;
      }

      const shouldAttachToExisting =
        (item.reviewState === "existing_match" || item.reviewState === "attachment_only") &&
        item.finalLinkedEntryId;

      if (shouldAttachToExisting) {
        try {
          const image = await imageService.saveFile(
            item.file,
            mapBatchTypeToEntryImageType(item.imageType),
            item.fileName
          );

          nextEntries = nextEntries.map((entry) => {
            if (entry.id !== item.finalLinkedEntryId) {
              return entry;
            }

            const merged = mergeImagesWithDedup(entry.images, [image]);
            duplicateCount += merged.duplicateCount;

            if (merged.addedCount > 0) {
              applied += 1;
            }

            return { ...entry, images: merged.images };
          });
        } catch {
          skipped += 1;
        }

        continue;
      }

      if (item.reviewState === "new_candidate") {
        try {
          const image = await imageService.saveFile(
            item.file,
            mapBatchTypeToEntryImageType(item.imageType),
            item.fileName
          );

          const title = item.extracted.titleFragment || item.fileName.replace(/\.[^.]+$/, "");
          const venue = item.extracted.venueCandidate || "未設定";
          const artistsText = item.extracted.artistCandidates.join(" / ") || "未設定";
          const nextEntry = createEntry({
            title,
            date: item.extracted.dateCandidate || "",
            place: "",
            venue,
            artistsText,
            genre: "",
            memo: buildImportMemo(item)
          });

          nextEntries = [{ ...nextEntry, images: [image] }, ...nextEntries];
          applied += 1;
        } catch {
          skipped += 1;
        }

        continue;
      }

      skipped += 1;
    }

    onApply(nextEntries);
    setItems((current) =>
      current.map((item) =>
        item.selected
          ? {
              ...item,
              selected: false,
              approved: false,
              reviewState: item.reviewState === "excluded" ? "excluded" : "confirmed"
            }
          : item
      )
    );

    if (skipped > 0 || duplicateCount > 0) {
      const parts = [`${applied} 件を確定しました。`];

      if (duplicateCount > 0) {
        parts.push(`重複 ${duplicateCount} 件は追加していません。`);
      }

      if (skipped > 0) {
        parts.push(`${skipped} 件は紐づけ先不足などで保留にしました。`);
      }

      setMessage(parts.join(" "));
      return;
    }

    setMessage(`${applied} 件を確定しました。`);
  }

  function confirmSelectedCandidates() {
    const targets = items.filter((item) => item.selected && item.reviewState !== "excluded");

    if (targets.length === 0) {
      setMessage("候補確定する画像を選んでください。");
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.selected && item.reviewState !== "excluded"
          ? { ...item, approved: true, selected: false }
          : item
      )
    );
    setMessage(`${targets.length} 件を候補確定しました。内容を確認してから登録できます。`);
  }

  async function attachItemToExisting(itemId: string, entryId: string) {
    const target = items.find((item) => item.id === itemId);
    const matchedEntry = entries.find((entry) => entry.id === entryId);

    if (!target) {
      return;
    }

    setProcessingItemIds((current) => [...current, itemId]);
    setItemActionState(itemId, { tone: "info", message: "画像を追加しています..." });
    setMessage("画像を追加しています...");

    try {
      const image = await imageService.saveFile(
        target.file,
        mapBatchTypeToEntryImageType(target.imageType),
        target.fileName,
        {
          onStatus(statusMessage) {
            setItemActionStates((current) => ({
              ...current,
              [itemId]: {
                tone: "info",
                message: statusMessage,
                progress: current[itemId]?.progress
              }
            }));
          },
          onProgress(progress) {
            setItemActionState(itemId, {
              tone: "info",
              message:
                progress >= 1
                  ? "画像を仕上げています..."
                  : `画像を保存しています... ${Math.round(progress * 100)}%`,
              progress
            });
          }
        }
      );

      const merged = mergeImagesWithDedup(matchedEntry?.images ?? [], [image]);

      if (merged.addedCount === 0) {
        setItems((current) => current.filter((item) => item.id !== itemId));
        setItemActionState(itemId, null);
        setMessage(`「${matchedEntry?.title ?? "既存公演"}」には同じ画像があるため追加していません。`);
        onLinkedToEntry?.(entryId);
        return;
      }

      setItems((current) => current.filter((item) => item.id !== itemId));
      setItemActionState(itemId, null);
      onApply((current) =>
        current.map((entry) =>
          entry.id === entryId ? { ...entry, images: merged.images } : entry
        )
      );
      onLinkedToEntry?.(entryId);
      setMessage(
        image.storageStatus === "local_pending"
          ? `「${matchedEntry?.title ?? "既存公演"}」に画像を追加しました。Drive 保存はこのあと続けます。`
          : `「${matchedEntry?.title ?? "既存公演"}」に画像を追加しました。候補一覧から外しています。`
      );
    } catch (error) {
      const failureMessage =
        error instanceof Error
          ? error.message
          : "画像の追加に失敗しました。ログイン状態や保存先を確認して、もう一度試してください。";
      setItemActionState(itemId, { tone: "error", message: failureMessage });
      setMessage(failureMessage);
    } finally {
      setProcessingItemIds((current) => current.filter((id) => id !== itemId));
    }
  }

  function toggleSelectAll(checked: boolean) {
    setItems((current) => current.map((item) => ({ ...item, selected: checked })));
  }

  function setItemActionState(itemId: string, next: ItemActionState | null) {
    setItemActionStates((current) => {
      if (!next) {
        const { [itemId]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [itemId]: next
      };
    });
  }

  function applyBulkReviewState() {
    if (selectedCount === 0) {
      setMessage("状態を変える画像を選んでください。");
      return;
    }

    updateSelectedItems((item) => ({
      ...item,
      reviewState: bulkReviewState
    }));
    setMessage(`選択した画像を「${REVIEW_STATE_LABELS[bulkReviewState]}」に更新しました。`);
  }

  return (
    <section className="panel batchBoard">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Batch Import</p>
          <h2>画像ロット取り込み</h2>
          <p>{message}</p>
        </div>
        <div className="batchToolbar">
          <div className="batchToolbarPrimary">
            <button className="actionButton" type="button" onClick={() => inputRef.current?.click()}>
              画像を追加
            </button>
            <button className="toolButton" type="button" onClick={runOcrForSelected}>
              選択に OCR
            </button>
            <button className="toolButton" type="button" onClick={recheckSelectedItems}>
              選択を再照合
            </button>
            <button className="toolButton" type="button" onClick={confirmSelectedCandidates}>
              選択を候補確定
            </button>
            <button className="actionButton secondaryButton" type="button" onClick={confirmSelectedItems}>
              確定分を登録
            </button>
          </div>
          <div className="batchToolbarSecondary">
            <label className="batchBulkStateControl">
              <span>選択中の状態</span>
              <select value={bulkReviewState} onChange={(event) => setBulkReviewState(event.target.value as BatchReviewState)}>
                <option value="existing_match">既存公演候補あり</option>
                <option value="new_candidate">新規候補</option>
                <option value="attachment_only">添付のみ</option>
                <option value="excluded">除外</option>
              </select>
            </label>
            <button className="toolButton" type="button" onClick={applyBulkReviewState}>
              状態をまとめて適用
            </button>
          </div>
        </div>
      </div>

      <div className="batchWorkflowStrip">
        <article className="batchWorkflowCard">
          <strong>1. OCR / 候補確認</strong>
          <p>画像を追加して、OCR と候補欄を確認します。</p>
        </article>
        <article className="batchWorkflowCard">
          <strong>2. 候補確定</strong>
          <p>内容がよければ候補確定へ寄せて、保留と本登録を分けます。</p>
        </article>
        <article className="batchWorkflowCard">
          <strong>3. 本登録 / 画像追加</strong>
          <p>既存へ追加するか、新規候補としてまとめて登録します。</p>
        </article>
      </div>

      <input
        ref={inputRef}
        className="hiddenInput"
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
      />

      <div className="batchMetaRow">
        <label className="batchSelectAll">
          <input
            type="checkbox"
            checked={items.length > 0 && selectedCount === items.length}
            onChange={(event) => toggleSelectAll(event.target.checked)}
          />
          <span>すべて選択</span>
        </label>
        <span>{items.length} 件</span>
        <span>{selectedCount} 件選択中</span>
        <span>{pendingCount} 件未確定</span>
        <span>{approvedCount} 件候補確定済み</span>
      </div>

      {items.length === 0 ? (
        <div className="emptyState batchEmptyState">
          <h2>画像をまだ取り込んでいません</h2>
          <p>チケット、立て看板、その他画像をまとめて入れて、一覧で整理できます。</p>
        </div>
      ) : (
        <div className="batchList">
          {items.map((item) => (
            <article key={item.id} className="batchItem">
              <div className="batchItemPreview">
                <label className="batchCheck">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(event) =>
                      updateItem(item.id, (current) => ({ ...current, selected: event.target.checked }))
                    }
                  />
                  <span>選択</span>
                </label>
                <img src={item.previewUrl} alt={item.fileName} />
              </div>

              <div className="batchItemBody">
                <div className="batchItemHeader">
                  <div>
                    <strong>{item.fileName}</strong>
                    <p>{REVIEW_STATE_LABELS[item.reviewState]}</p>
                  </div>
                  <div className="batchBadgeRow">
                    {item.approved ? <span className="batchBadge batchBadgeReady">候補確定済み</span> : null}
                    <span className="batchBadge">{TYPE_LABELS[item.imageType]}</span>
                    <span className="batchBadge">{Math.round(item.extracted.confidence * 100)}%</span>
                  </div>
                </div>

                <div className="batchOcrRow">
                  <div className="batchOcrMeta">
                    <strong>OCR</strong>
                    <span>
                      {item.ocrStatus === "idle"
                        ? "未実行"
                        : item.ocrStatus === "processing"
                          ? "実行中"
                          : item.ocrStatus === "done"
                            ? `反映済み ${item.ocrConfidence !== null ? `${Math.round(item.ocrConfidence * 100)}%` : ""}`
                            : "エラー"}
                    </span>
                  </div>
                  <button className="toolButton" type="button" onClick={() => runOcrForItem(item.id)}>
                    この画像に OCR
                  </button>
                </div>
                {item.ocrError ? <p className="emptyInline">{item.ocrError}</p> : null}

                <div className="batchControls">
                  <label>
                    <span>画像タイプ</span>
                    <select
                      value={item.imageType}
                      onChange={(event) =>
                        applyExtractedPatch(item.id, {}, event.target.value as BatchImageType)
                      }
                    >
                      <option value="ticket">チケット</option>
                      <option value="signboard">立て看板</option>
                      <option value="other">その他</option>
                    </select>
                  </label>
                  <label>
                    <span>処理状態</span>
                    <select
                      value={item.reviewState}
                      onChange={(event) =>
                        updateItem(item.id, (current) => ({
                          ...current,
                          approved: false,
                          reviewState: event.target.value as BatchReviewState
                        }))
                      }
                    >
                      <option value="unreviewed">未確認</option>
                      <option value="existing_match">既存公演候補あり</option>
                      <option value="new_candidate">新規候補</option>
                      <option value="attachment_only">添付のみ</option>
                      <option value="excluded">除外</option>
                      <option value="confirmed">確定済み</option>
                    </select>
                  </label>
                </div>

                <div className="batchCandidateEditor">
                  <label>
                    <span>日付候補</span>
                    <input
                      type="date"
                      value={item.extracted.dateCandidate ?? ""}
                      onChange={(event) => applyExtractedPatch(item.id, { dateCandidate: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>会場候補</span>
                    <input
                      value={item.extracted.venueCandidate ?? ""}
                      onChange={(event) => applyExtractedPatch(item.id, { venueCandidate: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>開場候補</span>
                    <input
                      value={item.extracted.openTimeCandidate ?? ""}
                      onChange={(event) => applyExtractedPatch(item.id, { openTimeCandidate: event.target.value })}
                      placeholder="18:00"
                    />
                  </label>
                  <label>
                    <span>開演候補</span>
                    <input
                      value={item.extracted.startTimeCandidate ?? ""}
                      onChange={(event) => applyExtractedPatch(item.id, { startTimeCandidate: event.target.value })}
                      placeholder="19:00"
                    />
                  </label>
                  <label className="batchWideField">
                    <span>アーティスト候補</span>
                    <input
                      value={item.extracted.artistCandidates.join(" / ")}
                      onChange={(event) =>
                        applyExtractedPatch(item.id, {
                          artistCandidates: parseArtists(event.target.value)
                        })
                      }
                    />
                  </label>
                  <label className="batchWideField">
                    <span>公演タイトル断片</span>
                    <input
                      value={item.extracted.titleFragment ?? ""}
                      onChange={(event) => applyExtractedPatch(item.id, { titleFragment: event.target.value })}
                    />
                  </label>
                </div>

                {item.ocrText ? (
                  <details className="batchOcrText">
                    <summary>OCR テキストを確認</summary>
                    <pre>{item.ocrText.slice(0, 2400)}</pre>
                  </details>
                ) : null}

                <div className="batchMatchBlock">
                  <div className="batchMatchHeader">
                    <span>一致候補</span>
                    <button
                      className="toolButton"
                      type="button"
                      onClick={() =>
                        updateItem(item.id, (current) => ({
                          ...current,
                          ...refreshBatchImportItem(current, entries)
                        }))
                      }
                    >
                      この画像だけ再照合
                    </button>
                  </div>
                  {item.matches.length > 0 ? (
                    <div className="batchMatchList">
                      {item.matches.map((match) => (
                        <div key={match.entryId} className="batchMatchOption">
                          <label className="batchMatchOptionMain">
                            <input
                              type="radio"
                              name={`match-${item.id}`}
                              checked={item.finalLinkedEntryId === match.entryId}
                              onChange={() =>
                                updateItem(item.id, (current) => ({
                                  ...current,
                                  finalLinkedEntryId: match.entryId,
                                  reviewState:
                                    current.reviewState === "unreviewed" ? "existing_match" : current.reviewState
                                  }))
                              }
                            />
                            <div className="batchMatchMeta">
                              <span className="batchMatchSummary">
                                {match.date} / {match.artists[0] || "出演者未設定"} / {match.place || "地域未設定"} / {match.title}
                              </span>
                            </div>
                            <strong>{match.reason}</strong>
                          </label>
                          <button
                            className="actionButton batchAddButton"
                            type="button"
                            disabled={processingItemIds.includes(item.id)}
                            onClick={() => void attachItemToExisting(item.id, match.entryId)}
                          >
                            {processingItemIds.includes(item.id) ? "追加中..." : "追加"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="emptyInline">既存公演候補はまだ見つかっていません。</p>
                  )}
                  {item.approved ? (
                    <p className="batchApprovedHint">
                      候補を確認済みです。必要なら候補値を直してから「確定分を登録」で本データへ反映できます。
                    </p>
                  ) : null}
                  {itemActionStates[item.id] ? (
                    <p
                      className={
                        itemActionStates[item.id].tone === "error"
                          ? "batchItemStatus batchItemStatusError"
                          : "batchItemStatus"
                      }
                    >
                      {itemActionStates[item.id].message}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function buildImportMemo(item: BatchImportBoardItem) {
  const ticketDetails = extractTicketDetailFragments(item.ocrText);
  const fragments = [
    `画像ロット取込みから作成: ${item.fileName}`,
    item.extracted.openTimeCandidate ? `開場候補 ${item.extracted.openTimeCandidate}` : "",
    item.extracted.startTimeCandidate ? `開演候補 ${item.extracted.startTimeCandidate}` : "",
    ...ticketDetails
  ].filter(Boolean);

  return fragments.join(" / ");
}

function mergeExtractedCandidates(
  current: ExtractedImageCandidate,
  incoming: ExtractedImageCandidate
): ExtractedImageCandidate {
  return {
    dateCandidate: incoming.dateCandidate || current.dateCandidate,
    venueCandidate: incoming.venueCandidate || current.venueCandidate,
    openTimeCandidate: incoming.openTimeCandidate || current.openTimeCandidate,
    startTimeCandidate: incoming.startTimeCandidate || current.startTimeCandidate,
    artistCandidates:
      incoming.artistCandidates.length > 0 ? incoming.artistCandidates : current.artistCandidates,
    titleFragment: incoming.titleFragment || current.titleFragment,
    confidence: Math.max(current.confidence, incoming.confidence)
  };
}

function extractTicketDetailFragments(ocrText: string) {
  if (!ocrText) {
    return [];
  }

  const fragments: string[] = [];
  const normalized = ocrText.replace(/\s+/g, " ");

  const serial = normalized.match(/(?:整理番号|整理No\.?|No\.?)\s*[:：]?\s*([A-Z]?-?\d{1,4})/i);

  if (serial?.[1]) {
    fragments.push(`整理番号 ${serial[1]}`);
  }

  const seat = normalized.match(
    /(?:席種|座席|seat)\s*[:：]?\s*([A-Z0-9一-龠ぁ-んァ-ヶー\s\-\/]{2,30})/i
  );

  if (seat?.[1]) {
    fragments.push(`座席 ${seat[1].trim()}`);
  }

  const quantity = normalized.match(/(\d+)\s*(?:枚|tickets?)/i);

  if (quantity?.[1]) {
    fragments.push(`枚数 ${quantity[1]}`);
  }

  return fragments;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}
