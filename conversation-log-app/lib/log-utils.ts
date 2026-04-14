import type { ConversationLog, ConversationLogInput, LogFilters } from "@/lib/log-types";

export const LOG_STORAGE_KEY = "conversation-log-app.entries";

export function parseTags(input: string) {
  return input
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function createLogId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `log-${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeLog(input: ConversationLog): ConversationLog {
  return {
    id: input.id,
    title: input.title.trim(),
    date: input.date.trim(),
    category: input.category.trim(),
    content: input.content.trim(),
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    note: input.note.trim(),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export function sanitizeLogs(entries: ConversationLog[]) {
  return entries.map(sanitizeLog).sort((a, b) => b.date.localeCompare(a.date));
}

export function createLogEntry(input: ConversationLogInput): ConversationLog {
  const timestamp = new Date().toISOString();

  return {
    id: createLogId(),
    title: input.title.trim(),
    date: input.date,
    category: input.category.trim(),
    content: input.content.trim(),
    tags: parseTags(input.tagsText),
    note: input.note.trim(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function updateLogEntry(existing: ConversationLog, input: ConversationLogInput): ConversationLog {
  return {
    ...existing,
    title: input.title.trim(),
    date: input.date,
    category: input.category.trim(),
    content: input.content.trim(),
    tags: parseTags(input.tagsText),
    note: input.note.trim(),
    updatedAt: new Date().toISOString()
  };
}

export function toFormInput(entry?: ConversationLog): ConversationLogInput {
  return {
    title: entry?.title ?? "",
    date: entry?.date ?? "",
    category: entry?.category ?? "",
    content: entry?.content ?? "",
    tagsText: entry?.tags.join(", ") ?? "",
    note: entry?.note ?? ""
  };
}

export function matchesFilters(entry: ConversationLog, filters: LogFilters) {
  const query = filters.query.trim().toLowerCase();
  const category = filters.category.trim();
  const tag = filters.tag.trim();

  const matchesQuery =
    !query ||
    [entry.title, entry.date, entry.category, entry.content, entry.tags.join(" "), entry.note]
      .join(" ")
      .toLowerCase()
      .includes(query);

  const matchesCategory = !category || entry.category === category;
  const matchesTag = !tag || entry.tags.includes(tag);

  return matchesQuery && matchesCategory && matchesTag;
}

export function collectCategories(entries: ConversationLog[]) {
  return Array.from(new Set(entries.map((entry) => entry.category).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ja")
  );
}

export function collectTags(entries: ConversationLog[]) {
  return Array.from(new Set(entries.flatMap((entry) => entry.tags).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ja")
  );
}

export function formatDate(value: string) {
  if (!value) {
    return "日付未設定";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}
