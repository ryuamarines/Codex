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

export function inferBatchImageTypeFromText(
  text: string,
  fallbackType: BatchImageType = "other"
): BatchImageType {
  if (/(電子チケット|ticket|qr\s*code|整理番号|座席|発券|入場口|購入番号)/i.test(text)) {
    return "ticket";
  }

  if (/(本日の公演|today'?s\s+(show|event)|出演(?:者)?|開場|開演)/i.test(text)) {
    return "signboard";
  }

  return fallbackType;
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
  const dateCandidate = extractDateCandidateFromText(text, entries);
  const fallbackTimes = extractTimeCandidates(text);
  const openTimeCandidate = extractKeywordTime(text, [/open/i, /開場/]) ?? fallbackTimes[0];
  const startTimeCandidate = extractKeywordTime(text, [/start/i, /開演/]) ?? fallbackTimes[1];
  const venueCandidate = extractVenueCandidateFromText(text, entries);
  const artistCandidates = selectArtistCandidates(text, entries, imageType);
  const titleFragment =
    imageType === "ticket"
      ? buildTicketTitleFragment(text, fallbackTitle)
      : buildTitleFragmentFromText(text, fallbackTitle);
  const explicitSignals = countExplicitSignals(text, imageType);

  const confidenceBase = imageType === "ticket" ? 0.08 : 0.04;
  const confidenceBoost =
    (dateCandidate ? 0.26 : 0) +
    (venueCandidate ? 0.2 : 0) +
    (artistCandidates.length > 0 ? 0.18 : 0) +
    (titleFragment ? 0.14 : 0) +
    ((openTimeCandidate || startTimeCandidate) ? 0.06 : 0) +
    Math.min(explicitSignals, 3) * 0.025;

  return {
    dateCandidate,
    venueCandidate,
    openTimeCandidate,
    startTimeCandidate,
    artistCandidates,
    titleFragment,
    confidence: Math.min(0.94, confidenceBase + confidenceBoost)
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

export function findEntryMatchesForCandidates(
  entries: LiveEntry[],
  extracted: ExtractedImageCandidate
) {
  return buildEntryMatches(entries, extracted);
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
    return createValidDateCandidate(year, month, day);
  }

  const short = value.match(/(\d{2})(\d{2})(\d{2})/);

  if (short) {
    const [, yy, mm, dd] = short;
    return createValidDateCandidate(`20${yy}`, mm, dd);
  }

  return undefined;
}

function extractDateCandidateFromText(value: string, entries: LiveEntry[]) {
  const normalized = normalizeOcrDateText(value);
  const collapsed = normalized.replace(/\s+/g, "");
  const slash = normalized.match(/(20\d{2})\s*[\/.\-年]\s*(\d{1,2})\s*[\/.\-月]\s*(\d{1,2})/);

  if (slash) {
    const [, year, month, day] = slash;
    return createValidDateCandidate(year, month, day);
  }

  const compactSlash = normalized.match(/\b(20\d{2})(\d{2})(\d{2})\b/);

  if (compactSlash) {
    const [, year, month, day] = compactSlash;
    return createValidDateCandidate(year, month, day);
  }

  const jpWithoutYear = normalized.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);

  if (jpWithoutYear) {
    const [, month, day] = jpWithoutYear;
    return (
      inferDateFromEntries(entries, month, day) ??
      createValidDateCandidate(String(new Date().getFullYear()), month, day)
    );
  }

  const shortYear = normalized.match(/\b(\d{2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\b/);

  if (shortYear) {
    const [, year, month, day] = shortYear;
    return createValidDateCandidate(`20${year}`, month, day);
  }

  const collapsedDate = collapsed.match(/(20\d{2})(\d{2})(\d{2})/);

  if (collapsedDate) {
    const [, year, month, day] = collapsedDate;
    return createValidDateCandidate(year, month, day);
  }

  return extractDateCandidate(normalized);
}

function createValidDateCandidate(yearValue: string, monthValue: string, dayValue: string) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${yearValue.padStart(4, "0")}-${monthValue.padStart(2, "0")}-${dayValue.padStart(2, "0")}`;
}

function extractTimeCandidates(value: string) {
  const matches = Array.from(value.matchAll(/(\d{1,2})[:時](\d{2})/g))
    .map((match) => createValidTimeCandidate(match[1], match[2]))
    .filter((candidate): candidate is string => Boolean(candidate));

  return matches.slice(0, 2);
}

function extractKeywordTime(value: string, keywords: RegExp[]) {
  const lines = value.split(/\r?\n/);

  for (const line of lines) {
    for (const keyword of keywords) {
      const keywordMatch = line.match(keyword);

      if (!keywordMatch || keywordMatch.index === undefined) {
        continue;
      }

      const afterKeyword = line.slice(keywordMatch.index + keywordMatch[0].length);
      const match = afterKeyword.match(/(\d{1,2})[:時](\d{2})/);

      if (match) {
        return createValidTimeCandidate(match[1], match[2]);
      }
    }
  }

  return undefined;
}

function createValidTimeCandidate(hourValue: string, minuteValue: string) {
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (hour < 0 || hour > 29 || minute < 0 || minute > 59) {
    return undefined;
  }

  return `${hourValue.padStart(2, "0")}:${minuteValue}`;
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
    .filter((line) => !/(open|start|開場|開演|整理番号|座席|料金|税込|ドリンク|入場|枚|出演(?:者)?|artist|act)/i.test(line))
    .filter((line) => !/(電子チケット|ticket\s*board|eplus|イープラス|ローチケ|ぴあ|qr\s*code|受付番号)/i.test(line))
    .filter((line) => !/^\d{1,2}[:時]\d{2}/.test(line))
    .filter((line) => !/^\d{4}[\/.\-年]\d{1,2}[\/.\-月]\d{1,2}/.test(line))
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !isLikelyVenueLine(line));

  const candidate = lines
    .slice(0, 3)
    .join(" / ")
    .slice(0, 100)
    .trim();

  return candidate || fallbackTitle || "";
}

function extractVenueCandidateFromText(value: string, entries: LiveEntry[]) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const knownVenue = findKnownToken(entries.map((entry) => entry.venue), normalizeText(value));

  if (knownVenue) {
    return knownVenue;
  }

  for (const line of lines) {
    if (!/(会場|venue|場所)/i.test(line)) {
      continue;
    }

    const cleaned = line
      .replace(/^.*?(会場|venue|場所)[:：]?\s*/i, "")
      .trim()
      .slice(0, 80);

    if (isLikelyVenueLine(cleaned)) {
      return cleaned;
    }
  }

  return lines
    .map((line) => cleanVenueLine(line))
    .filter(isLikelyVenueLine)
    .sort((left, right) => scoreVenueLine(right) - scoreVenueLine(left))[0];

}

function cleanVenueLine(value: string) {
  return value
    .replace(/^(会場|venue|場所)[:：]?\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 80);
}

function isLikelyVenueLine(value: string) {
  if (!value || value.length < 2 || value.length > 80) {
    return false;
  }

  if (/(https?:|www\.|開場|開演|open|start|料金|整理番号|座席|発券|入場)/i.test(value)) {
    return false;
  }

  return scoreVenueLine(value) > 0;
}

function scoreVenueLine(value: string) {
  const venueSignals = value.match(
    /(zepp|hall|ホール|会館|会場|ドーム|dome|アリーナ|arena|スタジアム|stadium|劇場|ライブハウス|live\s*house|club|クラブ|loft|quattro|blaze|o[-\s]?east|www\s*x?|garden|garage|unit|liquidroom|baysis|eggman)/gi
  );
  return venueSignals?.length ?? 0;
}

function extractLabeledArtistCandidates(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const candidates: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const labelMatch = line.match(/^(出演(?:者)?|artist(?:s)?|act(?:s)?|cast)\s*[:：]?\s*(.*)$/i);

    if (!labelMatch) {
      continue;
    }

    const candidateText = labelMatch[2] || lines[index + 1] || "";
    candidates.push(...splitArtistCandidateText(candidateText));
  }

  return candidates;
}

function splitArtistCandidateText(value: string) {
  return value
    .split(/\s*(?:\/|／|\||、|,)\s*/)
    .map((candidate) => candidate.trim())
    .filter((candidate) =>
      candidate.length >= 2 &&
      candidate.length <= 100 &&
      !/(open|start|開場|開演|会場|venue|料金|ticket)/i.test(candidate)
    );
}

function selectArtistCandidates(value: string, entries: LiveEntry[], imageType: BatchImageType) {
  const normalized = normalizeText(value);
  const known = findKnownTokens(entries.flatMap((entry) => entry.artists), normalized);
  const labeled = extractLabeledArtistCandidates(value);
  const combined = Array.from(new Set([...known, ...labeled]));

  if (combined.length > 0) {
    return combined.slice(0, imageType === "ticket" ? 8 : 6);
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
