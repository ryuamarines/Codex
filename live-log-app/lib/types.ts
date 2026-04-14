export type LiveEntryImage = {
  id: string;
  type: "signboard" | "eticket" | "paperTicket";
  src: string;
  caption?: string;
  storageStatus?: "cloud" | "local_pending" | "syncing" | "error";
  uploadError?: string;
  driveFileId?: string;
  driveWebUrl?: string;
  driveThumbnailUrl?: string;
};

export type BatchImageType = "ticket" | "signboard" | "other";

export type BatchReviewState =
  | "unreviewed"
  | "existing_match"
  | "new_candidate"
  | "attachment_only"
  | "excluded"
  | "confirmed";

export type ExtractedImageCandidate = {
  dateCandidate?: string;
  venueCandidate?: string;
  openTimeCandidate?: string;
  startTimeCandidate?: string;
  artistCandidates: string[];
  titleFragment?: string;
  confidence: number;
};

export type EntryMatchCandidate = {
  entryId: string;
  title: string;
  date: string;
  place: string;
  artists: string[];
  venue: string;
  reason: string;
  score: number;
};

export type BatchImportItem = {
  id: string;
  fileName: string;
  previewUrl: string;
  imageType: BatchImageType;
  extracted: ExtractedImageCandidate;
  matches: EntryMatchCandidate[];
  reviewState: BatchReviewState;
  finalLinkedEntryId?: string;
  selected: boolean;
};

export type LiveEntry = {
  id: string;
  title: string;
  date: string;
  place: string;
  venue: string;
  artists: string[];
  genre: string;
  memo: string;
  images: LiveEntryImage[];
};
