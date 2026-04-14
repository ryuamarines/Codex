export const EVENT_STATUS_OPTIONS = ["企画中", "公開準備中", "募集中", "開催済み"];
export const TASK_STATUS_OPTIONS = ["未着手", "進行中", "完了"];
export const TASK_CATEGORY_OPTIONS = [
  "会場",
  "登壇者対応",
  "告知",
  "Luma対応",
  "備品",
  "当日準備",
  "終了後対応"
];
export const TAB_OPTIONS = ["基本情報", "準備", "当日", "終了後", "収支"];
export const FINANCE_TYPE_OPTIONS = ["収入", "支出"];
export const FINANCE_CATEGORIES = {
  収入: ["参加費収入", "スポンサー収入", "その他収入"],
  支出: ["会場費", "謝礼", "飲食費", "備品費", "デザイン費", "広告費", "交通費", "その他"]
};
export const SETTLEMENT_STATUS_OPTIONS = ["未精算", "精算済み"];
export const LUMA_STATUS_OPTIONS = ["未着手", "下書き中", "公開準備中", "公開中", "受付停止", "終了"];
export const PARTICIPANT_IMPORT_STATUS_OPTIONS = ["未準備", "手動メモのみ", "取り込み準備中", "取り込み済み"];

export const DEFAULT_TASK_TEMPLATES = [
  { title: "会場確認", category: "会場" },
  { title: "登壇者確認", category: "登壇者対応" },
  { title: "Lumaページ作成", category: "Luma対応" },
  { title: "告知文作成", category: "告知" },
  { title: "告知投稿", category: "告知" },
  { title: "当日役割確認", category: "当日準備" },
  { title: "備品確認", category: "備品" },
  { title: "終了後お礼", category: "終了後対応" },
  { title: "振り返り記入", category: "終了後対応" }
];

export const EVENT_TEMPLATES = [
  {
    id: "custom",
    label: "カスタム",
    description: "汎用テンプレ。まずは自由入力で作るときの土台です。",
    tasks: DEFAULT_TASK_TEMPLATES
  },
  {
    id: "talk",
    label: "登壇イベント",
    description: "登壇調整、投影確認、告知の流れを最初から持つテンプレです。",
    tasks: [
      ...DEFAULT_TASK_TEMPLATES,
      { title: "投影資料回収", category: "登壇者対応" },
      { title: "当日音響確認", category: "当日準備" }
    ],
    runbook: {
      timetable: [
        { time: "18:30", title: "開場", owner: "受付", note: "" },
        { time: "19:00", title: "オープニング", owner: "司会", note: "" },
        { time: "19:10", title: "セッション", owner: "登壇対応", note: "" },
        { time: "20:10", title: "交流", owner: "全員", note: "" }
      ],
      roles: [
        { role: "受付", owner: "", note: "" },
        { role: "司会", owner: "", note: "" },
        { role: "登壇対応", owner: "", note: "" }
      ],
      checklist: ["投影テスト", "マイク確認", "アナウンス文確認"],
      attentionNotes: "投影・音響・録画可否を事前に確認する。"
    }
  },
  {
    id: "networking",
    label: "交流会",
    description: "受付、会場導線、軽食、写真可否の確認を重視したテンプレです。",
    tasks: [
      ...DEFAULT_TASK_TEMPLATES,
      { title: "軽食発注", category: "備品" },
      { title: "ネームカード準備", category: "当日準備" }
    ],
    runbook: {
      timetable: [
        { time: "18:30", title: "開場", owner: "受付", note: "" },
        { time: "19:00", title: "乾杯", owner: "司会", note: "" },
        { time: "19:10", title: "交流", owner: "全員", note: "" },
        { time: "20:30", title: "締め", owner: "司会", note: "" }
      ],
      roles: [
        { role: "受付", owner: "", note: "" },
        { role: "会場導線", owner: "", note: "" },
        { role: "写真確認", owner: "", note: "" }
      ],
      checklist: ["受付札配置", "飲食物配置", "写真可否アナウンス"],
      attentionNotes: "飲食導線と、交流しやすい声掛けを当日確認する。"
    }
  },
  {
    id: "reading",
    label: "読書会 / 小規模会",
    description: "静かな運営、進行メモ、振り返りを重視したテンプレです。",
    tasks: [
      ...DEFAULT_TASK_TEMPLATES,
      { title: "当日進行台本確認", category: "当日準備" }
    ],
    runbook: {
      timetable: [
        { time: "18:30", title: "開始", owner: "進行", note: "" },
        { time: "18:40", title: "読み合わせ / 本編", owner: "進行", note: "" },
        { time: "20:00", title: "感想共有", owner: "進行", note: "" }
      ],
      roles: [
        { role: "進行", owner: "", note: "" },
        { role: "受付", owner: "", note: "" }
      ],
      checklist: ["配布物確認", "会場静音確認"],
      attentionNotes: "進行の切れ目を短く保ち、交流時間を最後に確保する。"
    }
  }
];

export function createId(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function createDefaultTasks() {
  return DEFAULT_TASK_TEMPLATES.map((template, index) => ({
    id: createId("task"),
    title: template.title,
    assignee: "",
    dueDate: "",
    status: index < 2 ? "進行中" : "未着手",
    memo: "",
    category: template.category
  }));
}

export function getEventTemplate(templateId = "custom") {
  return EVENT_TEMPLATES.find((template) => template.id === templateId) || EVENT_TEMPLATES[0];
}

export function createTasksFromTemplate(templateId = "custom") {
  const template = getEventTemplate(templateId);

  return template.tasks.map((task, index) => ({
    id: createId("task"),
    title: task.title,
    assignee: "",
    dueDate: "",
    status: index < 2 ? "進行中" : "未着手",
    memo: "",
    category: task.category
  }));
}

export function createRunbookFromTemplate(templateId = "custom") {
  const template = getEventTemplate(templateId);

  return {
    timetable: (template.runbook?.timetable || []).map((item) => ({
      id: createId("time"),
      time: item.time || "",
      title: item.title || "",
      owner: item.owner || "",
      note: item.note || ""
    })),
    roles: (template.runbook?.roles || []).map((item) => ({
      id: createId("role"),
      role: item.role || "",
      owner: item.owner || "",
      note: item.note || ""
    })),
    attentionNotes: template.runbook?.attentionNotes || "",
    receptionMemo: "",
    emergencyMemo: "",
    checklist: (template.runbook?.checklist || []).map((label) => ({
      id: createId("check"),
      label,
      checked: false,
      note: ""
    })),
    participantMemoPlaceholder: ""
  };
}

export function createEmptyEvent({ withTemplateTasks = true, templateId = "custom" } = {}) {
  return {
    id: createId("event"),
    name: "",
    startsAt: "",
    venue: "",
    status: "企画中",
    summary: "",
    theme: "",
    speakers: "",
    owners: "",
    lumaUrl: "",
    lumaStatus: "未着手",
    lumaRegistrationCount: "",
    lumaCheckedAt: "",
    lumaNotes: "",
    templateId,
    notes: "",
    tasks: withTemplateTasks ? createTasksFromTemplate(templateId) : [],
    runbook: createRunbookFromTemplate(templateId),
    result: {
      attendeeCount: "",
      impression: "",
      wentWell: "",
      improvements: "",
      nextMemo: "",
      contactNotes: "",
      closedAt: ""
    },
    participantHub: {
      source: "Luma",
      importStatus: "未準備",
      checkedInCount: "",
      lastImportedAt: "",
      notes: "",
      touchedParticipants: []
    },
    finance: {
      memo: "",
      lines: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeEvent(event) {
  const base = createEmptyEvent({ withTemplateTasks: false });
  const { drive: _legacyDrive, ...eventWithoutDrive } = event || {};

  return {
    ...base,
    ...eventWithoutDrive,
    tasks: Array.isArray(eventWithoutDrive.tasks) ? eventWithoutDrive.tasks : [],
    runbook: {
      ...base.runbook,
      ...(eventWithoutDrive.runbook || {}),
      timetable: Array.isArray(eventWithoutDrive.runbook?.timetable) ? eventWithoutDrive.runbook.timetable : [],
      roles: Array.isArray(eventWithoutDrive.runbook?.roles) ? eventWithoutDrive.runbook.roles : [],
      checklist: Array.isArray(eventWithoutDrive.runbook?.checklist) ? eventWithoutDrive.runbook.checklist : []
    },
    result: {
      ...base.result,
      ...(eventWithoutDrive.result || {})
    },
    participantHub: {
      ...base.participantHub,
      ...(eventWithoutDrive.participantHub || {}),
      touchedParticipants: Array.isArray(eventWithoutDrive.participantHub?.touchedParticipants)
        ? eventWithoutDrive.participantHub.touchedParticipants
        : []
    },
    finance: {
      ...base.finance,
      ...(eventWithoutDrive.finance || {}),
      lines: Array.isArray(eventWithoutDrive.finance?.lines) ? eventWithoutDrive.finance.lines : []
    }
  };
}

export function touchEvent(event) {
  return {
    ...event,
    updatedAt: new Date().toISOString()
  };
}

export function calculateFinance(event) {
  const lines = event.finance?.lines || [];
  const summary = lines.reduce(
    (acc, line) => {
      const planned = Number(line.plannedAmount || 0);
      const actual = Number(line.actualAmount || 0);

      if (line.type === "収入") {
        acc.revenuePlan += planned;
        acc.revenueActual += actual;
      } else {
        acc.expensePlan += planned;
        acc.expenseActual += actual;
      }

      return acc;
    },
    { revenuePlan: 0, revenueActual: 0, expensePlan: 0, expenseActual: 0 }
  );

  return {
    ...summary,
    profitPlan: summary.revenuePlan - summary.expensePlan,
    profitActual: summary.revenueActual - summary.expenseActual
  };
}

export function getFinanceTone(event) {
  const totals = calculateFinance(event);
  const hasAnyInput = (event.finance?.lines || []).some((line) => {
    return (
      Number(line.plannedAmount || 0) !== 0 ||
      Number(line.actualAmount || 0) !== 0 ||
      Boolean(line.name)
    );
  });

  if (!hasAnyInput) {
    return {
      label: "未入力",
      tone: "neutral"
    };
  }

  if (totals.profitActual > 0) {
    return {
      label: "黒字",
      tone: "positive"
    };
  }

  if (totals.profitActual < 0) {
    return {
      label: "赤字",
      tone: "negative"
    };
  }

  return {
    label: "収支均衡",
    tone: "neutral"
  };
}

export function getTaskProgress(tasks) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "完了").length;
  const inProgress = tasks.filter((task) => task.status === "進行中").length;

  return { total, done, inProgress };
}

export function isTaskOverdue(task, now = new Date()) {
  if (!task?.dueDate || task.status === "完了") {
    return false;
  }

  const due = new Date(`${task.dueDate}T23:59:59`);
  return due.getTime() < now.getTime();
}

export function isTaskDueSoon(task, days = 3, now = new Date()) {
  if (!task?.dueDate || task.status === "完了") {
    return false;
  }

  const due = new Date(`${task.dueDate}T23:59:59`);
  const diff = due.getTime() - now.getTime();
  const daysMs = days * 24 * 60 * 60 * 1000;

  return diff >= 0 && diff <= daysMs;
}

export function getOverdueTasks(tasks, now = new Date()) {
  return tasks.filter((task) => isTaskOverdue(task, now));
}

export function getDueSoonTasks(tasks, days = 3, now = new Date()) {
  return tasks.filter((task) => isTaskDueSoon(task, days, now));
}

export function getUnsettledLines(lines) {
  return lines.filter((line) => line.settlementStatus === "未精算");
}

export function buildReadinessReview(event) {
  const blockers = [];
  const needsAttention = [];
  const niceToHave = [];

  if (!event.name) blockers.push("イベント名が未入力");
  if (!event.startsAt) blockers.push("開催日時が未入力");
  if (!event.venue) blockers.push("会場が未入力");
  if (!event.lumaUrl && event.status !== "企画中") blockers.push("Luma URL が未設定");

  if (!event.speakers) needsAttention.push("登壇者情報が未入力");
  if (!event.owners) needsAttention.push("担当者が未入力");
  if (!event.runbook.timetable.length && event.status !== "企画中") needsAttention.push("タイムテーブル未作成");
  if (!event.runbook.roles.length && event.status !== "企画中") needsAttention.push("役割分担未作成");
  if (!event.lumaCheckedAt && ["公開準備中", "募集中"].includes(event.status)) needsAttention.push("Luma確認日時が未入力");
  if (!event.finance.lines.length) needsAttention.push("収支明細が未入力");

  if (!event.runbook.checklist.length) niceToHave.push("当日チェック項目を足すと現場で使いやすい");
  if (!event.participantHub.notes) niceToHave.push("参加者取り込みの方針メモを残すと次の拡張が楽");
  if (!event.result.nextMemo && event.status === "開催済み") niceToHave.push("次回へのメモを残すと再現性が上がる");

  return { blockers, needsAttention, niceToHave };
}
