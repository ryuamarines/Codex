"use client";

import type { ChangeEvent, FormEvent, RefObject } from "react";
import { BatchImportBoard } from "@/components/batch-import-board";
import { LiveLogArtistsView, LiveLogVenuesView } from "@/components/live-log-entity-views";
import { LiveLogHomeView } from "@/components/live-log-home-view";
import { RecordToolsPanel } from "@/components/record-tools-panel";
import { LiveLogTimelineView } from "@/components/live-log-timeline-view";
import type { ArchiveImageService } from "@/lib/archive-image-service";
import type { ManualEntryInput } from "@/lib/live-entry-utils";
import type { LiveEntry } from "@/lib/types";

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


type AddViewProps = {
  imageMessage: string;
  manualForm: ManualEntryInput;
  photoForm: PhotoUploadInput;
  placeOptions: string[];
  genreOptions: string[];
  driveFolderLabel: string;
  photoInputRef: RefObject<HTMLInputElement | null>;
  entries: LiveEntry[];
  imageService: ArchiveImageService;
  onManualSubmit(event: FormEvent<HTMLFormElement>): void;
  onPhotoImport(event: ChangeEvent<HTMLInputElement>): void;
  onUpdateForm<K extends keyof ManualEntryInput>(key: K, value: ManualEntryInput[K]): void;
  onUpdatePhotoForm<K extends keyof PhotoUploadInput>(
    key: K,
    value: PhotoUploadInput[K]
  ): void;
  onConfigureDriveFolder(): void;
  onBatchApply(entries: LiveEntry[] | ((current: LiveEntry[]) => LiveEntry[])): void;
  onLinkedToEntry(entryId: string): void;
};

export function LiveLogAddView({
  imageMessage,
  manualForm,
  photoForm,
  placeOptions,
  genreOptions,
  driveFolderLabel,
  photoInputRef,
  entries,
  imageService,
  onManualSubmit,
  onPhotoImport,
  onUpdateForm,
  onUpdatePhotoForm,
  onConfigureDriveFolder,
  onBatchApply,
  onLinkedToEntry
}: AddViewProps) {
  return (
    <section className="archiveAddLayout">
      <RecordToolsPanel
        imageMessage={imageMessage}
        manualForm={manualForm}
        photoForm={photoForm}
        placeOptions={placeOptions}
        genreOptions={genreOptions}
        driveFolderLabel={driveFolderLabel}
        photoInputRef={photoInputRef}
        onManualSubmit={onManualSubmit}
        onPhotoImport={onPhotoImport}
        onUpdateForm={onUpdateForm}
        onUpdatePhotoForm={onUpdatePhotoForm}
        onConfigureDriveFolder={onConfigureDriveFolder}
      />
      <BatchImportBoard
        entries={entries}
        imageService={imageService}
        onApply={onBatchApply}
        onLinkedToEntry={onLinkedToEntry}
      />
    </section>
  );
}
