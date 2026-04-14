import { calculateFinance, getDueSoonTasks, getOverdueTasks, getUnsettledLines } from "./models.js";

export function hasAttentionItems(event) {
  return (
    getOverdueTasks(event.tasks).length > 0 ||
    getUnsettledLines(event.finance.lines).length > 0 ||
    (event.status !== "企画中" && !event.lumaUrl) ||
    (event.status !== "開催済み" && event.runbook.timetable.length === 0)
  );
}

export function buildHealthSnapshot(event) {
  const checks = [
    {
      label: "基本情報",
      passed: Boolean(event.name && event.startsAt && event.venue && event.owners),
      detail: "イベント名 / 開催日時 / 会場 / 主催担当"
    },
    {
      label: "Luma導線",
      passed: event.status === "企画中" || Boolean(event.lumaUrl && event.lumaStatus !== "未着手"),
      detail: "Luma URL / 公開状態"
    },
    {
      label: "準備進行",
      passed: event.tasks.length > 0 && getOverdueTasks(event.tasks).length === 0,
      detail: "期限超過なしで準備タスクが存在"
    },
    {
      label: "当日運営",
      passed: Boolean(event.runbook.timetable.length && event.runbook.roles.length && event.runbook.checklist.length),
      detail: "タイムテーブル / 役割 / チェック項目"
    },
    {
      label: "収支可視化",
      passed: Boolean(event.finance.lines.length || event.finance.memo),
      detail: "明細または収支メモ"
    }
  ];
  const score = checks.filter((check) => check.passed).length;
  const missing = checks.filter((check) => !check.passed);
  const label = score >= 5 ? "大きな抜けなし" : score >= 3 ? "あと少しで安定" : "先に穴埋めしたい状態";

  return {
    score,
    total: checks.length,
    label,
    checks,
    missing
  };
}

export function buildPrepAssigneeSummary(tasks) {
  const grouped = tasks.reduce((acc, task) => {
    const assignee = task.assignee?.trim() || "未割当";

    if (!acc[assignee]) {
      acc[assignee] = {
        assignee,
        total: 0,
        open: 0,
        overdue: 0,
        dueSoon: 0
      };
    }

    acc[assignee].total += 1;
    if (task.status !== "完了") {
      acc[assignee].open += 1;
    }
    if (getOverdueTasks([task]).length) {
      acc[assignee].overdue += 1;
    } else if (getDueSoonTasks([task]).length) {
      acc[assignee].dueSoon += 1;
    }

    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => {
    if (b.overdue !== a.overdue) {
      return b.overdue - a.overdue;
    }

    if (b.open !== a.open) {
      return b.open - a.open;
    }

    return a.assignee.localeCompare(b.assignee, "ja");
  });
}

export function buildFinanceGaps(event) {
  const lines = event.finance.lines || [];
  const issues = [];
  const warnings = [];
  const missingActualLines = lines.filter(
    (line) => Number(line.plannedAmount || 0) > 0 && Number(line.actualAmount || 0) === 0
  );

  if (event.status === "開催済み" && missingActualLines.length) {
    issues.push(`開催済みなのに実績未入力の明細が ${missingActualLines.length} 件あります。`);
  } else if (missingActualLines.length) {
    warnings.push(`実績未入力の明細が ${missingActualLines.length} 件あります。`);
  }

  if (!lines.length && event.status !== "企画中") {
    warnings.push("収支明細がまだありません。主要な収入・支出だけでも先に入れておくと追いやすいです。");
  }

  if (event.status === "開催済み" && getUnsettledLines(lines).length) {
    issues.push("開催済みイベントに未精算が残っています。");
  }

  if (calculateFinance(event).expenseActual > 0 && !event.finance.memo) {
    warnings.push("費用が発生していますが収支メモが未入力です。補足を残すと後で追いやすいです。");
  }

  return {
    issues,
    warnings,
    missingActualCount: missingActualLines.length
  };
}

export function buildRoleCoverage(roles) {
  const unassigned = roles.filter((role) => !role.owner?.trim());

  return {
    total: roles.length,
    assigned: roles.length - unassigned.length,
    unassigned
  };
}

export function buildResultCompleteness(event) {
  const items = [
    {
      label: "実参加人数",
      filled: Boolean(event.result.attendeeCount),
      detail: "参加人数を入れると次回比較しやすくなります。"
    },
    {
      label: "所感",
      filled: Boolean(event.result.impression),
      detail: "全体の温度感や印象です。"
    },
    {
      label: "良かった点",
      filled: Boolean(event.result.wentWell),
      detail: "次回も残したいことです。"
    },
    {
      label: "改善点",
      filled: Boolean(event.result.improvements),
      detail: "次回の修正点です。"
    },
    {
      label: "次回メモ / 接点",
      filled: Boolean(event.result.nextMemo || event.result.contactNotes || event.participantHub.touchedParticipants.length),
      detail: "次回への布石や参加者メモです。"
    }
  ];

  return {
    items,
    score: items.filter((item) => item.filled).length,
    total: items.length
  };
}
