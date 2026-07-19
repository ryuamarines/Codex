"use client";

import type { ChangeEvent, FormEvent, RefObject } from "react";
import { BatchImportBoard } from "@/components/batch-import-board";
import { RecordToolsPanel } from "@/components/record-tools-panel";
import type { ArchiveImageService } from "@/lib/archive-image-service";
import type { ManualEntryInput } from "@/lib/live-entry-utils";
import type { AddImageReview, AddPhotoType } from "@/lib/live-add-flow";
import type { LiveEntry } from "@/lib/types";

type AddViewProps = {
  imageMessage: string;
  manualForm: ManualEntryInput;
  addImageReview: AddImageReview | null;
  placeOptions: string[];
  genreOptions: string[];
  photoInputRef: RefObject<HTMLInputElement | null>;
  entries: LiveEntry[];
  imageService: ArchiveImageService;
  onManualSubmit(event: FormEvent<HTMLFormElement>): void;
  onPhotoImport(event: ChangeEvent<HTMLInputElement>): void;
  onOpenAddPhotoPicker(photoType: AddPhotoType): void;
  onClearAddImageReview(): void;
  onRetryAddImageOcr(): void;
  onAttachAddImageToMatch(): void;
  onUpdateForm<K extends keyof ManualEntryInput>(key: K, value: ManualEntryInput[K]): void;
  onBatchApply(entries: LiveEntry[] | ((current: LiveEntry[]) => LiveEntry[])): void;
  onLinkedToEntry(entryId: string): void;
};

export function LiveLogAddView({
  imageMessage,
  manualForm,
  addImageReview,
  placeOptions,
  genreOptions,
  photoInputRef,
  entries,
  imageService,
  onManualSubmit,
  onPhotoImport,
  onOpenAddPhotoPicker,
  onClearAddImageReview,
  onRetryAddImageOcr,
  onAttachAddImageToMatch,
  onUpdateForm,
  onBatchApply,
  onLinkedToEntry
}: AddViewProps) {
  return (
    <section className="archiveAddLayout">
      <RecordToolsPanel
        imageMessage={imageMessage}
        manualForm={manualForm}
        addImageReview={addImageReview}
        placeOptions={placeOptions}
        genreOptions={genreOptions}
        photoInputRef={photoInputRef}
        onManualSubmit={onManualSubmit}
        onPhotoImport={onPhotoImport}
        onOpenAddPhotoPicker={onOpenAddPhotoPicker}
        onClearAddImageReview={onClearAddImageReview}
        onRetryAddImageOcr={onRetryAddImageOcr}
        onAttachAddImageToMatch={onAttachAddImageToMatch}
        onUpdateForm={onUpdateForm}
      />
      <details className="panel archiveAddBatchPanel archiveAddBatchDisclosure">
        <summary>複数画像をまとめて整理</summary>
        <div className="archiveAddBatchContent">
          <BatchImportBoard
            entries={entries}
            imageService={imageService}
            onApply={onBatchApply}
            onLinkedToEntry={onLinkedToEntry}
          />
        </div>
      </details>
    </section>
  );
}
