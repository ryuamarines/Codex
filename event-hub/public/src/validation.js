const EVENT_STATUS_SET = new Set(["企画中", "公開準備中", "募集中", "開催済み"]);
const FINANCE_TYPE_SET = new Set(["収入", "支出"]);

function isValidDateTime(value) {
  return !value || !Number.isNaN(new Date(value).getTime());
}

function isValidDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseNonNegativeNumber(value, label) {
  const normalized = value === "" || value === null ? 0 : Number(value);

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${label} は 0 以上の数値で入力してください。`);
  }

  return normalized;
}

export function validateEventCore(payload) {
  if (!String(payload.name || "").trim()) {
    throw new Error("イベント名は必須です。");
  }

  if (!String(payload.startsAt || "").trim()) {
    throw new Error("開催日時は必須です。");
  }

  if (!isValidDateTime(payload.startsAt)) {
    throw new Error("開催日時の形式が不正です。");
  }

  if (payload.status && !EVENT_STATUS_SET.has(payload.status)) {
    throw new Error("イベントステータスが不正です。");
  }
}

export function validateEntity(kind, payload) {
  if (kind === "task") {
    if (!String(payload.title || "").trim()) {
      throw new Error("タスク名は必須です。");
    }

    if (!isValidDate(payload.dueDate)) {
      throw new Error("期限の日付形式が不正です。");
    }
  }

  if (kind === "timeline") {
    if (!String(payload.title || "").trim()) {
      throw new Error("タイムテーブル項目名は必須です。");
    }

    if (!String(payload.time || "").trim()) {
      throw new Error("タイムテーブルの時刻は必須です。");
    }
  }

  if (kind === "role" && !String(payload.role || "").trim()) {
    throw new Error("役割名は必須です。");
  }

  if (kind === "checklist" && !String(payload.label || "").trim()) {
    throw new Error("チェック項目名は必須です。");
  }

  if (kind === "finance") {
    if (!FINANCE_TYPE_SET.has(payload.type)) {
      throw new Error("収支種別が不正です。");
    }

    if (!String(payload.category || "").trim()) {
      throw new Error("収支カテゴリは必須です。");
    }

    if (!String(payload.name || "").trim()) {
      throw new Error("収支項目名は必須です。");
    }

    parseNonNegativeNumber(payload.plannedAmount, "予定金額");
    parseNonNegativeNumber(payload.actualAmount, "実績金額");
  }

  if (kind === "participant" && !String(payload.name || "").trim()) {
    throw new Error("参加者名は必須です。");
  }
}

export function parseFinanceAmount(value) {
  return parseNonNegativeNumber(value, "金額");
}
