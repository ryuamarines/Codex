"use client";

import { sampleLogs } from "@/data/sample-logs";
import type { ConversationLog } from "@/lib/log-types";
import { LOG_STORAGE_KEY, sanitizeLogs } from "@/lib/log-utils";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getAllLogs(): ConversationLog[] {
  if (!canUseStorage()) {
    return sampleLogs;
  }

  const raw = window.localStorage.getItem(LOG_STORAGE_KEY);

  if (!raw) {
    window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(sampleLogs));
    return sampleLogs;
  }

  try {
    const parsed = JSON.parse(raw) as ConversationLog[];
    return sanitizeLogs(parsed);
  } catch {
    window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(sampleLogs));
    return sampleLogs;
  }
}

export function saveAllLogs(entries: ConversationLog[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(sanitizeLogs(entries)));
}

export function getLogById(id: string) {
  return getAllLogs().find((entry) => entry.id === id);
}

export function createLog(entry: ConversationLog) {
  const current = getAllLogs();
  saveAllLogs([entry, ...current]);
}

export function replaceLog(entry: ConversationLog) {
  const current = getAllLogs();
  saveAllLogs(current.map((item) => (item.id === entry.id ? entry : item)));
}
