import type { BatchImageType, ExtractedImageCandidate, LiveEntryImage } from "@/lib/types";
import type { ManualEntryInput } from "@/lib/live-entry-utils";

export type AddPhotoType = LiveEntryImage["type"];
export type AddImageReviewStatus = "processing" | "review" | "saving" | "error";

export type AddImageReview = {
  file: File;
  fileName: string;
  previewUrl: string;
  photoType: AddPhotoType;
  status: AddImageReviewStatus;
  progress: number;
  ocrConfidence: number | null;
  candidateConfidence: number | null;
  matchedEntryId?: string;
  matchedEntryTitle?: string;
  matchReason?: string;
  error?: string;
};

export function mapAddPhotoTypeToBatchType(photoType: AddPhotoType): BatchImageType {
  return photoType === "signboard" ? "signboard" : "ticket";
}

export function applyOcrCandidatesToManualForm(
  current: ManualEntryInput,
  candidates: ExtractedImageCandidate
): ManualEntryInput {
  const timeMemo = [
    candidates.openTimeCandidate ? `OPEN ${candidates.openTimeCandidate}` : "",
    candidates.startTimeCandidate ? `START ${candidates.startTimeCandidate}` : ""
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    ...current,
    date: current.date || candidates.dateCandidate || "",
    title: current.title || candidates.titleFragment || "",
    venue: current.venue || candidates.venueCandidate || "",
    artistsText:
      current.artistsText ||
      (candidates.artistCandidates.length > 0 ? candidates.artistCandidates.join(" / ") : ""),
    memo: current.memo || timeMemo
  };
}
