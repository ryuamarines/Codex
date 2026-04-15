import { getDueSoonTasks, getOverdueTasks } from "./models.js";

function formatRemainingTime(diffDays) {
  if (diffDays <= 0) {
    return "";
  }

  if (diffDays < 7) {
    return `あと${diffDays}日`;
  }

  const weeks = Math.floor(diffDays / 7);
  const days = diffDays % 7;

  if (days === 0) {
    return `あと${weeks}週間`;
  }

  return `あと${weeks}週間+${days}日`;
}

export function buildScheduleStatus(event) {
  if (!event.startsAt) {
    return {
      tone: "",
      label: "日程未設定",
      shortLabel: "未設定",
      detail: "開催日時を入れると優先順位を付けやすくなります。"
    };
  }

  const now = new Date();
  const start = new Date(event.startsAt);

  if (Number.isNaN(start.getTime())) {
    return {
      tone: "",
      label: "日程形式を確認",
      shortLabel: "要確認",
      detail: "開催日時の形式が崩れています。"
    };
  }

  const diffDays = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      tone: "",
      label: `${Math.abs(diffDays)}日経過`,
      shortLabel: "終了後",
      detail: `${start.toISOString()} に開催予定でした。`
    };
  }

  if (diffDays === 0) {
    return {
      tone: "warning",
      label: "本日開催",
      shortLabel: "本日",
      detail: "開催当日です。"
    };
  }

  if (diffDays <= 7) {
    const remaining = formatRemainingTime(diffDays);
    return {
      tone: "warning",
      label: remaining,
      shortLabel: remaining,
      detail: "開催が近づいています。"
    };
  }

  const remaining = formatRemainingTime(diffDays);
  return {
    tone: "due",
    label: remaining,
    shortLabel: remaining,
    detail: "まだ準備の余裕があります。"
  };
}

export function matchesPrepFilter(task, prepFilter) {
  switch (prepFilter) {
    case "open":
      return task.status !== "完了";
    case "overdue":
      return getOverdueTasks([task]).length > 0;
    case "dueSoon":
      return getDueSoonTasks([task]).length > 0;
    case "completed":
      return task.status === "完了";
    case "noDue":
      return !task.dueDate;
    case "all":
    default:
      return true;
  }
}

export function matchesPrepAssigneeFilter(task, prepAssigneeFilter) {
  if (prepAssigneeFilter === "all") {
    return true;
  }

  if (prepAssigneeFilter === "__unassigned__") {
    return !task.assignee?.trim();
  }

  return (task.assignee || "").trim() === prepAssigneeFilter;
}

export function matchesCurrentPrepFilters(task, filters) {
  return matchesPrepFilter(task, filters.prepFilter) && matchesPrepAssigneeFilter(task, filters.prepAssigneeFilter);
}

export function getFilteredFinanceLines(lines, financeFilter) {
  return lines.filter((line) => {
    switch (financeFilter) {
      case "収入":
        return line.type === "収入";
      case "支出":
        return line.type === "支出";
      case "unsettled":
        return line.settlementStatus === "未精算";
      case "advanced":
        return Boolean(line.advanceBy);
      case "actualMissing":
        return Number(line.plannedAmount || 0) > 0 && Number(line.actualAmount || 0) === 0;
      case "all":
      default:
        return true;
    }
  });
}
