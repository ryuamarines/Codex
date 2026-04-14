import type {
  BatchImageType,
  BatchImportItem,
  BatchReviewState,
  EntryMatchCandidate,
  ExtractedImageCandidate,
  LiveEntry
} from "@/lib/types";
import { normalizeDateValue } from "@/lib/live-entry-utils";

export function createBatchImportItems(files: File[], entries: LiveEntry[]) {
  return files.map((file, index) => createBatchImportItem(file, entries, index));
}

export function createBatchImportItem(file: File, entries: LiveEntry[], index: number): BatchImportItem {
  const imageType = inferBatchImageType(file.name);
  const extracted = extractCandidates(file.name, imageType, entries);
  const matches = buildEntryMatches(entries, extracted);
  const reviewState = defaultReviewState(imageType, matches);

  return {
    id: `batch-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: file.name,
    previewUrl: URL.createObjectURL(file),
    imageType,
    extracted,
    matches,
    reviewState,
    finalLinkedEntryId: matches[0]?.entryId,
    selected: false
  };
}

export function inferBatchImageType(fileName: string): BatchImageType {
  const normalized = fileName.toLowerCase();

  if (
    normalized.includes("ticket") ||
    normalized.includes("チケット") ||
    normalized.includes("qr") ||
    normalized.includes("e-ticket") ||
    normalized.includes("eticket")
  ) {
    return "ticket";
  }

  if (
    normalized.includes("看板") ||
    normalized.includes("board") ||
    normalized.includes("sign") ||
    normalized.includes("立て")
  ) {
    return "signboard";
  }

  return "other";
}

export function mapBatchTypeToEntryImageType(imageType: BatchImageType): "paperTicket" | "signboard" | "eticket" {
  if (imageType === "ticket") {
    return "paperTicket";
  }

  if (imageType === "signboard") {
    return "signboard";
  }

  return "signboard";
}

export function extractCandidatesFromText(
  text: string,
  imageType: BatchImageType,
  entries: LiveEntry[],
  fallbackTitle?: string
): ExtractedImageCandidate {
  const normalized = normalizeText(text);
  const dateCandidate = extractDateCandidateFromText(text, entries);
  const fallbackTimes = extractTimeCandidates(text);
  const openTimeCandidate = extractKeywordTime(text, [/open/i, /開場/]) ?? fallbackTimes[0];
  const startTimeCandidate = extractKeywordTime(text, [/start/i, /開演/]) ?? fallbackTimes[1];
  const venueCandidate =
    (imageType === "ticket" ? extractTicketVenueCandidate(text, entries) : undefined) ??
    findKnownToken(entries.map((entry) => entry.venue), normalized);
  const artistCandidates = selectArtistCandidates(text, entries, imageType);
  const titleFragment =
    imageType === "ticket"
      ? buildTicketTitleFragment(text, fallbackTitle)
      : buildTitleFragmentFromText(text, fallbackTitle);
  const explicitSignals = countExplicitSignals(text, imageType);

  const confidenceBase =
    imageType === "ticket" ? 0.7 : imageType === "signboard" ? 0.45 : 0.18;
  const confidenceBoost =
    (dateCandidate ? 0.12 : 0) +
    (venueCandidate ? 0.1 : 0) +
    (artistCandidates.length > 0 ? 0.08 : 0) +
    ((openTimeCandidate || startTimeCandidate) ? 0.05 : 0) +
    explicitSignals * 0.03;

  return {
    dateCandidate,
    venueCandidate,
    openTimeCandidate,
    startTimeCandidate,
    artistCandidates,
    titleFragment,
    confidence: Math.min(0.96, confidenceBase + confidenceBoost)
  };
}

export function refreshBatchImportItem(item: BatchImportItem, entries: LiveEntry[]): BatchImportItem {
  const matches = buildEntryMatches(entries, item.extracted);
  const fallbackReviewState =
    item.imageType === "ticket"
      ? "new_candidate"
      : item.imageType === "signboard"
        ? "attachment_only"
        : "attachment_only";
  const reviewState =
    item.reviewState === "confirmed"
      ? "confirmed"
      : item.reviewState === "excluded"
        ? "excluded"
        : item.reviewState;

  return {
    ...item,
    matches,
    reviewState:
      reviewState === "unreviewed" && matches.length > 0
        ? "existing_match"
        : reviewState === "unreviewed" && matches.length === 0
          ? fallbackReviewState
          : reviewState,
    finalLinkedEntryId:
      item.finalLinkedEntryId && matches.some((match) => match.entryId === item.finalLinkedEntryId)
        ? item.finalLinkedEntryId
        : matches[0]?.entryId
  };
}

function extractCandidates(fileName: string, imageType: BatchImageType, entries: LiveEntry[]): ExtractedImageCandidate {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return extractCandidatesFromText(baseName, imageType, entries, baseName);
}

function buildEntryMatches(entries: LiveEntry[], extracted: ExtractedImageCandidate): EntryMatchCandidate[] {
  const matches: Array<EntryMatchCandidate & { exactDate: boolean }> = [];
  const targetDate = normalizeDateValue(extracted.dateCandidate ?? "");
  const targetVenue = normalizeMatchText(extracted.venueCandidate ?? "");
  const artistFragments = extracted.artistCandidates.map((artist) => artist.toLowerCase());
  const targetTitle = normalizeMatchText(extracted.titleFragment ?? "");
  const targetMonthDay = extractMonthDay(targetDate);

  for (const entry of entries) {
    const normalizedEntryDate = normalizeDateValue(entry.date);
    const entryVenue = normalizeMatchText(entry.venue);
    const entryArtists = entry.artists.map((artist) => artist.toLowerCase());
    const entryTitle = normalizeMatchText(entry.title);
    const entryMonthDay = extractMonthDay(normalizedEntryDate);
    const exactDateMatch = targetDate && normalizedEntryDate === targetDate;
    const monthDayMatch = targetMonthDay && entryMonthDay && targetMonthDay === entryMonthDay;
    const venueMatch = targetVenue && isLooseTokenMatch(targetVenue, entryVenue);
    const artistMatch =
      artistFragments.length > 0 &&
      artistFragments.some((fragment) => {
        const normalizedFragment = normalizeMatchText(fragment);
        return entryArtists.some((artist) => isLooseTokenMatch(normalizedFragment, normalizeMatchText(artist)));
      });
    const titleMatch = targetTitle && isLooseTokenMatch(targetTitle, entryTitle);
    let score = 0;
    let reason = "";

    if (exactDateMatch && venueMatch) {
      score = 100;
      reason = "日付 + 会場";
    } else if (monthDayMatch && venueMatch) {
      score = 86;
      reason = "月日 + 会場";
    } else if (exactDateMatch && artistMatch) {
      score = 72;
      reason = "日付 + アーティスト断片";
    } else if (exactDateMatch && titleMatch) {
      score = 68;
      reason = "日付 + タイトル断片";
    } else if (monthDayMatch && artistMatch) {
      score = 62;
      reason = "月日 + アーティスト断片";
    } else if (monthDayMatch && titleMatch) {
      score = 58;
      reason = "月日 + タイトル断片";
    } else if (exactDateMatch) {
      score = 60;
      reason = "日付一致";
    } else if (monthDayMatch) {
      score = 44;
      reason = "月日一致";
    }

    if (score > 0) {
      matches.push({
        entryId: entry.id,
        title: entry.title,
        date: normalizedEntryDate,
        place: entry.place,
        artists: entry.artists,
        venue: entry.venue,
        reason,
        score,
        exactDate: Boolean(exactDateMatch)
      });
    }
  }

  const prioritized = matches.some((match) => match.exactDate)
    ? matches.filter((match) => match.exactDate)
    : matches;

  return prioritized
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.title.localeCompare(right.title, "ja");
    })
    .slice(0, 10)
    .map(({ exactDate: _exactDate, ...match }) => match);
}

function defaultReviewState(imageType: BatchImageType, matches: EntryMatchCandidate[]): BatchReviewState {
  if (matches.length > 0) {
    return "existing_match";
  }

  if (imageType === "ticket") {
    return "new_candidate";
  }

  return "attachment_only";
}

function extractDateCandidate(value: string) {
  const yyyyMmDd = value.match(/(20\d{2})[._-]?(\d{1,2})[._-]?(\d{1,2})/);

  if (yyyyMmDd) {
    const [, year, month, day] = yyyyMmDd;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const short = value.match(/(\d{2})(\d{2})(\d{2})/);

  if (short) {
    const [, yy, mm, dd] = short;
    return `20${yy}-${mm}-${dd}`;
  }

  return undefined;
}

function extractDateCandidateFromText(value: string, entries: LiveEntry[]) {
  const normalized = normalizeOcrDateText(value);
  const collapsed = normalized.replace(/\s+/g, "");
  const slash = normalized.match(/(20\d{2})\s*[\/.\-年]\s*(\d{1,2})\s*[\/.\-月]\s*(\d{1,2})/);

  if (slash) {
    const [, year, month, day] = slash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const compactSlash = normalized.match(/\b(20\d{2})(\d{2})(\d{2})\b/);

  if (compactSlash) {
    const [, year, month, day] = compactSlash;
    return `${year}-${month}-${day}`;
  }

  const jpWithoutYear = normalized.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);

  if (jpWithoutYear) {
    const [, month, day] = jpWithoutYear;
    return inferDateFromEntries(entries, month, day) ?? `${new Date().getFullYear()}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const shortYear = normalized.match(/\b(\d{2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\b/);

  if (shortYear) {
    const [, year, month, day] = shortYear;
    return `20${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const collapsedDate = collapsed.match(/(20\d{2})(\d{2})(\d{2})/);

  if (collapsedDate) {
    const [, year, month, day] = collapsedDate;
    return `${year}-${month}-${day}`;
  }

  return extractDateCandidate(normalized);
}

function extractTimeCandidates(value: string) {
  const matches = Array.from(value.matchAll(/(\d{1,2})[:時](\d{2})/g)).map((match) =>
    `${match[1].padStart(2, "0")}:${match[2]}`
  );

  return matches.slice(0, 2);
}

function extractKeywordTime(value: string, keywords: RegExp[]) {
  const lines = value.split(/\r?\n/);

  for (const line of lines) {
    if (!keywords.some((keyword) => keyword.test(line))) {
      continue;
    }

    const match = line.match(/(\d{1,2})[:時](\d{2})/);

    if (match) {
      return `${match[1].padStart(2, "0")}:${match[2]}`;
    }
  }

  return undefined;
}

function buildTitleFragment(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/20\d{2}[._-]?\d{1,2}[._-]?\d{1,2}/g, "")
    .replace(/\d{1,2}[:時]\d{2}/g, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .slice(0, 60);
}

function buildTitleFragmentFromText(value: string, fallbackTitle = "") {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\d{1,2}[:時]\d{2}$/.test(line))
    .filter((line) => !/(open|start|開場|開演)/i.test(line))
    .filter((line) => !/^\d{4}[\/.\-年]\d{1,2}[\/.\-月]\d{1,2}/.test(line));

  return (lines[0] ?? fallbackTitle ?? "").slice(0, 80).trim();
}

function buildTicketTitleFragment(value: string, fallbackTitle = "") {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/(open|start|開場|開演|整理番号|座席|料金|税込|ドリンク|入場|枚)/i.test(line))
    .filter((line) => !/^\d{1,2}[:時]\d{2}/.test(line))
    .filter((line) => !/^\d{4}[\/.\-年]\d{1,2}[\/.\-月]\d{1,2}/.test(line))
    .filter((line) => !/^\d+$/.test(line));

  const candidate = lines
    .slice(0, 3)
    .join(" / ")
    .slice(0, 100)
    .trim();

  return candidate || fallbackTitle || "";
}

function extractTicketVenueCandidate(value: string, entries: LiveEntry[]) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const knownVenue = findKnownToken(entries.map((entry) => entry.venue), normalizeText(value));

  if (knownVenue) {
    return knownVenue;
  }

  for (const line of lines) {
    if (!/(会場|venue)/i.test(line)) {
      continue;
    }

    const cleaned = line
      .replace(/^(会場|venue)[:：]?\s*/i, "")
      .trim()
      .slice(0, 80);

    if (cleaned) {
      return cleaned;
    }
  }

  return undefined;
}

function selectArtistCandidates(value: string, entries: LiveEntry[], imageType: BatchImageType) {
  const normalized = normalizeText(value);
  const known = findKnownTokens(entries.flatMap((entry) => entry.artists), normalized);

  if (known.length > 0) {
    return known.slice(0, imageType === "ticket" ? 8 : 6);
  }

  return [];
}

function countExplicitSignals(value: string, imageType: BatchImageType) {
  const patterns =
    imageType === "ticket"
      ? [/open/i, /start/i, /会場/, /venue/i, /開場/, /開演/]
      : [/open/i, /start/i, /開場/, /開演/];

  return patterns.reduce((count, pattern) => (pattern.test(value) ? count + 1 : count), 0);
}

function findKnownToken(candidates: string[], normalizedSource: string) {
  const sorted = [...new Set(candidates.map((item) => item.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length
  );

  return sorted.find((candidate) => normalizedSource.includes(normalizeMatchText(candidate)));
}

function findKnownTokens(candidates: string[], normalizedSource: string) {
  return [...new Set(candidates.map((item) => item.trim()).filter(Boolean))].filter((candidate) =>
    normalizedSource.includes(normalizeMatchText(candidate))
  );
}

function normalizeText(value: string) {
  return normalizeMatchText(normalizeOcrDateText(value));
}

function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[‐‑–—ー\-_/\\・.。,、()（）「」『』[\]]/g, "");
}

function normalizeOcrDateText(value: string) {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[／]/g, "/")
    .replace(/[．]/g, ".")
    .replace(/[ー―‐]/g, "-")
    .replace(/(?<=\d)[oOＯ](?=\d)/g, "0")
    .replace(/(?<=\d)[lIｌ](?=\d)/g, "1")
    .replace(/(?<=\d)[sS](?=\d)/g, "5")
    .replace(/\s+/g, " ");
}

function extractMonthDay(value: string) {
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function inferDateFromEntries(entries: LiveEntry[], month: string, day: string) {
  const key = `${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const matchedDates = Array.from(
    new Set(entries.map((entry) => entry.date).filter((date) => extractMonthDay(date) === key))
  ).sort((left, right) => right.localeCompare(left, "ja"));

  return matchedDates[0] ?? "";
}

function isLooseTokenMatch(left: string, right: string) {
  if (!left || !right) {
    return false;
  }

  return left === right || left.includes(right) || right.includes(left);
}
