import {
  EVENT_STATUS_OPTIONS,
  EVENT_TEMPLATES,
  FINANCE_CATEGORIES,
  FINANCE_TYPE_OPTIONS,
  LUMA_STATUS_OPTIONS,
  PARTICIPANT_IMPORT_STATUS_OPTIONS,
  SETTLEMENT_STATUS_OPTIONS,
  TAB_OPTIONS,
  TASK_CATEGORY_OPTIONS,
  TASK_STATUS_OPTIONS,
  buildReadinessReview,
  calculateFinance,
  createDefaultTasks,
  createEmptyEvent,
  createId,
  getDueSoonTasks,
  getFinanceTone,
  getOverdueTasks,
  getTaskProgress,
  getUnsettledLines,
  normalizeEvent,
  touchEvent
} from "./models.js";
import {
  buildFinanceGaps,
  buildHealthSnapshot,
  buildPrepAssigneeSummary,
  buildResultCompleteness,
  buildRoleCoverage,
  hasAttentionItems
} from "./event-insights.js";
import {
  buildScheduleStatus,
  getFilteredFinanceLines,
  matchesCurrentPrepFilters as matchesPrepFilters
} from "./event-selectors.js";
import { copyText } from "./clipboard.js";
import { parseFinanceAmount, validateEntity, validateEventCore } from "./validation.js";
import { APP_TITLE } from "./app-config.js";
import {
  exportEventsCsv,
  importEventsCsv,
  initializeStorage,
  loadEvents,
  resetEvents,
  saveEvents,
  signInWithGoogle,
  signOutStorage,
  subscribeStorageSession
} from "./storage.js";

const app = document.getElementById("app");
let persistedEvents = [];
let queuedSnapshot = null;
let saveInFlight = false;
const LOCAL_BACKUP_KEY = "event-hub:last-known-events";

const state = {
  events: [],
  selectedEventId: null,
  activeView: "dashboard",
  activeTab: "基本情報",
  filter: "all",
  attentionOnly: false,
  sortMode: "smart",
  searchQuery: "",
  eventStageFilter: "進行中",
  prepFilter: "all",
  prepAssigneeFilter: "all",
  financeFilter: "all",
  taskBoardFilter: "open",
  taskBoardAssigneeFilter: "all",
  modal: null,
  mobileSidebarOpen: false,
  backendLabel: "Local JSON / Node",
  authRequired: false,
  authUser: null,
  isLoading: true,
  error: "",
  saveState: "idle",
  lastSavedAt: ""
};

const STATUS_FLOW = ["企画中", "公開準備中", "募集中", "開催済み"];

function sortEvents(a, b) {
  const aDone = a.status === "開催済み";
  const bDone = b.status === "開催済み";

  if (aDone !== bDone) {
    return aDone ? 1 : -1;
  }

  const aTime = toTimestamp(a.startsAt);
  const bTime = toTimestamp(b.startsAt);

  if (aDone && bDone) {
    return bTime - aTime;
  }

  return aTime - bTime;
}

function toTimestamp(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function getSelectedEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || null;
}

function ensureSelectedEvent() {
  if (!state.events.some((event) => event.id === state.selectedEventId)) {
    state.selectedEventId = state.events[0]?.id || null;
  }
}

function cloneEventsSnapshot(events) {
  return events.map((event) => normalizeEvent(event)).sort(sortEvents);
}

function writeLocalBackup(events) {
  try {
    window.localStorage.setItem(
      LOCAL_BACKUP_KEY,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        events: cloneEventsSnapshot(events)
      })
    );
  } catch (error) {
    console.warn("local backup skipped", error);
  }
}

function readLocalBackup() {
  try {
    const raw = window.localStorage.getItem(LOCAL_BACKUP_KEY);

    if (!raw) {
      return [];
    }

    const payload = JSON.parse(raw);
    return Array.isArray(payload?.events) ? cloneEventsSnapshot(payload.events) : [];
  } catch (error) {
    console.warn("local backup read failed", error);
    return [];
  }
}

function applyLoadedEvents(events) {
  state.events = cloneEventsSnapshot(events);
  persistedEvents = cloneEventsSnapshot(events);
  ensureSelectedEvent();
  writeLocalBackup(events);
}

function isMobileLayout() {
  return typeof window !== "undefined" && window.innerWidth <= 1080;
}

function getVisibleEvents() {
  const scoped =
    state.filter === "all"
      ? state.events
      : state.events.filter((event) => event.status === state.filter);

  return sortVisibleEvents(scoped.filter(matchesEventSearch).filter(matchesEventAttention));
}

function sortVisibleEvents(events) {
  const next = [...events];

  switch (state.sortMode) {
    case "dateDesc":
      return next.sort((a, b) => toTimestamp(b.startsAt) - toTimestamp(a.startsAt));
    case "updatedDesc":
      return next.sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt));
    case "nameAsc":
      return next.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));
    case "smart":
    default:
      return next.sort(sortEvents);
  }
}

function getOrderedEventsForDetail() {
  const visible = getVisibleEvents();

  if (visible.some((event) => event.id === state.selectedEventId)) {
    return visible;
  }

  return sortVisibleEvents(state.events);
}

function getNeighborEvents() {
  const ordered = getOrderedEventsForDetail();
  const index = ordered.findIndex((event) => event.id === state.selectedEventId);

  if (index === -1) {
    return { previous: null, next: null };
  }

  return {
    previous: ordered[index - 1] || null,
    next: ordered[index + 1] || null
  };
}

function matchesEventSearch(event) {
  const query = state.searchQuery.trim().toLowerCase();

  if (!query) {
    return true;
  }

  const haystack = [
    event.name,
    event.venue,
    event.status,
    event.owners,
    event.theme,
    event.speakers,
    event.summary,
    event.lumaStatus
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function matchesEventAttention(event) {
  if (!state.attentionOnly) {
    return true;
  }

  return hasAttentionItems(event);
}

function render() {
  if (state.isLoading) {
    app.innerHTML = `
      <div class="loading-view">
        <div class="loading-card">
          <p class="eyebrow">${escapeHtml(APP_TITLE)}</p>
          <h1>イベントデータを読み込み中</h1>
          <p class="subtle">${escapeHtml(state.backendLabel)} からイベント一覧を準備しています。</p>
        </div>
      </div>
    `;
    return;
  }

  if (state.authRequired && !state.authUser) {
    app.innerHTML = renderAuthGate();
    return;
  }

  const selectedEvent = getSelectedEvent();
  const mobileLayout = isMobileLayout();

  app.innerHTML = `
    <div class="shell ${mobileLayout ? "mobile-shell" : ""}">
      ${mobileLayout ? renderMobileTopbar(selectedEvent) : renderDesktopSidebar()}
      <main class="main workspace-main ${mobileLayout ? "mobile-main" : ""}">
        ${state.error ? `<div class="app-banner error">${escapeHtml(state.error)}</div>` : ""}
        ${renderWorkspace(selectedEvent)}
      </main>
      ${mobileLayout ? renderMobileBottomNav() : ""}
    </div>
    ${state.modal ? renderModal() : ""}
    <input id="events-import-input" type="file" accept="text/csv,.csv" hidden />
  `;
}

function renderAuthGate() {
  return `
    <div class="loading-view">
      <div class="loading-card auth-card">
        <p class="eyebrow">${escapeHtml(APP_TITLE)}</p>
        <h1>Googleでログイン</h1>
        <p class="subtle">Vercel 公開版は Firestore に保存します。まず Google アカウントでログインしてください。</p>
        <p class="subtle">保存先: ${escapeHtml(state.backendLabel)}</p>
        ${state.error ? `<div class="app-banner error">${escapeHtml(state.error)}</div>` : ""}
        <div class="auth-actions">
          <button class="button button-primary" data-action="sign-in-google">Googleでログイン</button>
        </div>
      </div>
    </div>
  `;
}

function getStorageHint() {
  if (state.authRequired) {
    return "Vercel 公開版では Google ログイン後に Firestore を使います。CSV は退避と復元用に使えます。";
  }

  return "ローカルでは `/api` 経由で JSON に保存します。CSV は退避と復元用に使えます。";
}

function renderDesktopSidebar() {
  return `
    <aside class="sidebar workspace-sidebar">
      <div class="brand-card brand-card-compact">
        <div class="brand-head">
          <div>
            <p class="eyebrow">${escapeHtml(APP_TITLE)}</p>
            <h1>Event Hub</h1>
            <p class="subtle">いま危ないイベントと、次にやることを動かすための運営ツールです。</p>
            <p class="subtle">保存先: ${escapeHtml(state.backendLabel)}</p>
          </div>
          ${renderSavePill()}
        </div>
        <div class="sidebar-actions sidebar-actions-primary">
          <button class="button button-primary" data-action="open-create-event">新しいイベント</button>
        </div>
      </div>

      <nav class="panel workspace-nav">
        ${renderWorkspaceNavItems()}
      </nav>

      <section class="panel sidebar-utility-panel">
        <div class="panel-head compact">
          <h2>運用</h2>
          <span class="count-pill">${state.events.length}件</span>
        </div>
        <div class="sidebar-actions sidebar-actions-utility stack-utility-actions">
          <button class="button button-ghost" data-action="reset-sample">サンプルに戻す</button>
          <button class="button button-ghost" data-action="export-events">CSV書き出し</button>
          <button class="button button-ghost" data-action="trigger-import">CSV読込</button>
          ${state.authRequired ? `<button class="button button-ghost" data-action="sign-out">ログアウト</button>` : ""}
        </div>
        <p class="subtle">${escapeHtml(getStorageHint())}</p>
        ${state.authUser ? `<p class="subtle">ログイン中: ${escapeHtml(state.authUser.displayName || state.authUser.email || "")}</p>` : ""}
      </section>
    </aside>
  `;
}

function renderWorkspaceNavItems() {
  const items = [
    { id: "dashboard", label: "ダッシュボード", count: buildDashboardSnapshot(state.events).activeEvents },
    { id: "events", label: "イベント", count: state.events.length },
    { id: "tasks", label: "タスク", count: buildGlobalTaskItems(state.events, { mode: "open", assignee: "all" }).length },
    { id: "finance", label: "収支", count: state.events.filter((event) => event.finance.lines.length > 0).length }
  ];

  return items
    .map(
      (item) => `
        <button class="nav-item ${state.activeView === item.id ? "active" : ""}" data-action="set-view" data-view="${item.id}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${item.count}</strong>
        </button>
      `
    )
    .join("");
}

function renderMobileTopbar(selectedEvent) {
  const titleMap = {
    dashboard: "ダッシュボード",
    events: "イベント",
    tasks: "タスク",
    finance: "収支",
    detail: selectedEvent?.name || "イベント詳細"
  };

  return `
    <header class="mobile-topbar">
      <div>
        <p class="eyebrow">${escapeHtml(APP_TITLE)}</p>
        <strong>${escapeHtml(titleMap[state.activeView] || "Event Hub")}</strong>
        <small>${state.activeView === "detail" && selectedEvent ? escapeHtml(formatDateTime(selectedEvent.startsAt)) : "運営状況を確認できます"}</small>
      </div>
      <div class="mobile-toolbar-actions">
        ${state.activeView === "detail" ? `<button class="button button-ghost" data-action="set-view" data-view="events">戻る</button>` : ""}
        <button class="button button-primary" data-action="open-create-event">＋</button>
      </div>
    </header>
  `;
}

function renderMobileBottomNav() {
  const currentView = state.activeView === "detail" ? "events" : state.activeView;
  const items = [
    { id: "dashboard", label: "ホーム" },
    { id: "events", label: "イベント" },
    { id: "tasks", label: "タスク" },
    { id: "finance", label: "収支" }
  ];

  return `
    <nav class="mobile-bottom-nav">
      ${items
        .map(
          (item) => `
            <button class="mobile-nav-item ${currentView === item.id ? "active" : ""}" data-action="set-view" data-view="${item.id}">
              <span>${escapeHtml(item.label)}</span>
            </button>
          `
        )
        .join("")}
    </nav>
  `;
}

function renderWorkspace(selectedEvent) {
  switch (state.activeView) {
    case "events":
      return renderEventsWorkspace();
    case "tasks":
      return renderTasksWorkspace();
    case "finance":
      return renderFinanceWorkspace();
    case "detail":
      return selectedEvent ? renderEventDetailWorkspace(selectedEvent) : renderEmptyState();
    case "dashboard":
    default:
      return renderDashboardView();
  }
}

function renderDashboardView() {
  const dashboard = buildDashboardSnapshot(state.events);
  const spotlightEvents = getStageScopedEvents("進行中").slice(0, 4);
  const todayTasks = buildGlobalTaskItems(state.events, { mode: "today", assignee: "all" }).slice(0, 6);
  const monthSummary = buildMonthlyFinanceSummary(state.events)[0];

  return `
    <section class="workspace-section">
      <div class="workspace-header">
        <div>
          <p class="eyebrow">Dashboard</p>
          <h2>今の運営状況</h2>
          <p class="subtle">イベント名よりも、いま詰まりそうな状態と判断材料を先に見せます。</p>
        </div>
        <div class="header-actions">
          <button class="button button-secondary" data-action="set-view" data-view="finance">収支を見る</button>
          <button class="button button-primary" data-action="open-create-event">新規イベント</button>
        </div>
      </div>

      <section class="dashboard-metrics">
        ${renderDashboardMetric("進行中イベント", dashboard.activeEvents, "公開準備中 / 募集中")}
        ${renderDashboardMetric("未完了タスク", dashboard.openTasks, `期限超過 ${dashboard.overdueTasks}`)}
        ${renderDashboardMetric("合計申込数", dashboard.totalRegistrations, "Luma 手入力合計")}
        ${renderDashboardMetric("収支サマリー", formatSignedCurrency(dashboard.totalProfit), dashboard.totalProfit >= 0 ? "全体で黒字" : "全体で赤字")}
      </section>

      <section class="panel workspace-panel">
        <div class="panel-head">
          <div>
            <h3>進行中イベント</h3>
            <p class="subtle">危ない順に優先して見られるよう、状態値を前に出しています。</p>
          </div>
          <button class="button button-ghost" data-action="set-view" data-view="events">すべて見る</button>
        </div>
        <div class="state-card-grid">
          ${
            spotlightEvents.length
              ? spotlightEvents.map((event) => renderEventStateCard(event, "dashboard")).join("")
              : `<div class="empty-panel">進行中イベントはまだありません。</div>`
          }
        </div>
      </section>

      <section class="workspace-split">
        <div class="panel workspace-panel">
          <div class="panel-head compact">
            <h3>今日やること</h3>
            <span class="count-pill">${todayTasks.length}</span>
          </div>
          <div class="global-task-list">
            ${
              todayTasks.length
                ? todayTasks.map((item) => renderGlobalTaskRow(item, true)).join("")
                : `<div class="empty-panel small">今日優先したいタスクはまだありません。</div>`
            }
          </div>
        </div>
        <div class="panel workspace-panel">
          <div class="panel-head compact">
            <h3>収支サマリー</h3>
            <span class="count-pill">${monthSummary ? monthSummary.label : "全体"}</span>
          </div>
          <div class="finance-summary-stack">
            <div class="finance-balance-card ${dashboard.totalProfit >= 0 ? "positive" : "negative"}">
              <span>合計利益</span>
              <strong>${formatSignedCurrency(dashboard.totalProfit)}</strong>
              <small>売上 ${formatCurrency(dashboard.totalRevenue)} / 支出 ${formatCurrency(dashboard.totalExpense)}</small>
            </div>
            ${monthSummary ? renderMiniMonthSummary(monthSummary) : `<p class="subtle">月別集計はイベントを追加すると表示されます。</p>`}
          </div>
        </div>
      </section>
    </section>
  `;
}

function renderDashboardMetric(label, value, detail) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function renderEventsWorkspace() {
  const stageEvents = getStageScopedEvents(state.eventStageFilter);

  return `
    <section class="workspace-section">
      <div class="workspace-header">
        <div>
          <p class="eyebrow">Events</p>
          <h2>イベント一覧</h2>
          <p class="subtle">状態から見るための一覧です。必要最小限の情報だけで危険度が分かるようにしています。</p>
        </div>
        <div class="header-actions">
          <label class="search-field compact-search">
            <span>検索</span>
            <input type="search" data-action="search-events" placeholder="イベント名・会場・担当で検索" value="${escapeAttr(state.searchQuery)}" />
          </label>
        </div>
      </div>

      <div class="segmented-row">
        ${renderStageFilterChip("進行中")}
        ${renderStageFilterChip("予定")}
        ${renderStageFilterChip("終了")}
      </div>

      <section class="state-card-grid wide">
        ${
          stageEvents.length
            ? stageEvents.map((event) => renderEventStateCard(event, "events")).join("")
            : `<div class="empty-panel">この条件のイベントはまだありません。</div>`
        }
      </section>
    </section>
  `;
}

function renderStageFilterChip(value) {
  const count = getStageScopedEvents(value).length;
  return `
    <button class="filter-chip ${state.eventStageFilter === value ? "active" : ""}" data-action="set-event-stage" data-stage="${value}">
      <span>${escapeHtml(value)}</span>
      <span class="chip-count">${count}</span>
    </button>
  `;
}

function renderEventStateCard(event, context) {
  const progress = getTaskProgress(event.tasks);
  const completionRate = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const finance = calculateFinance(event);
  const ops = buildOperationalSummary(event);
  const registrationCount = Number(event.lumaRegistrationCount || 0);
  const schedule = buildScheduleStatus(event);

  return `
    <article class="state-card ${context === "dashboard" ? "spotlight" : ""}">
      <button class="state-card-hit" data-action="open-event-detail" data-event-id="${event.id}" aria-label="${escapeAttr(event.name || "イベント詳細")}"></button>
      <div class="state-card-head">
        <div>
          <small>${escapeHtml(formatDate(event.startsAt))}</small>
          <h3>${escapeHtml(event.name || "名称未設定")}</h3>
          <p>${escapeHtml(event.venue || "会場未設定")}</p>
        </div>
        <span class="status-badge">${escapeHtml(event.status)}</span>
      </div>
      <div class="state-card-metrics">
        <div><span>申込</span><strong>${registrationCount}</strong></div>
        <div><span>進捗</span><strong>${completionRate}%</strong></div>
        <div><span>収支見込み</span><strong class="${finance.profitActual >= 0 ? "text-positive" : "text-negative"}">${formatSignedCurrency(finance.profitActual)}</strong></div>
      </div>
      <div class="progress-track"><span style="width:${completionRate}%"></span></div>
      <div class="state-card-foot">
        <span class="mini-pill">${escapeHtml(schedule.shortLabel)}</span>
        <span class="mini-pill warning">未完了 ${progress.total - progress.done}</span>
        ${ops.overdueTasks.length ? `<span class="mini-pill warning">期限超過 ${ops.overdueTasks.length}</span>` : ""}
      </div>
    </article>
  `;
}

function renderEventDetailWorkspace(event) {
  const finance = calculateFinance(event);
  const progress = getTaskProgress(event.tasks);
  const completionRate = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const audience = buildAudienceSnapshot(event);
  const financeTone = getFinanceTone(event);
  const openTasks = event.tasks.slice().sort(sortTasks).filter((task) => task.status !== "完了");
  const completedTasks = event.tasks.filter((task) => task.status === "完了");
  const categoryBreakdown = buildFinanceCategoryBreakdown(event.finance.lines);
  const followUps = event.participantHub.touchedParticipants.filter((item) => item.followUp);

  return `
    <section class="workspace-section detail-workspace">
      <div class="detail-backbar">
        <button class="button button-ghost" data-action="set-view" data-view="events">イベント一覧に戻る</button>
      </div>

      <section class="detail-summary-card">
        <div class="detail-summary-main">
          <p class="eyebrow">Event Detail</p>
          <div class="detail-title-row">
            <div>
              <h2>${escapeHtml(event.name || "名称未設定")}</h2>
              <p class="subtle">${escapeHtml(event.venue || "会場未設定")} / ${escapeHtml(formatDateTime(event.startsAt))}</p>
            </div>
            <div class="detail-header-tags">
              <span class="status-badge">${escapeHtml(event.status)}</span>
              <span class="finance-badge ${financeTone.tone}">${financeTone.label}</span>
            </div>
          </div>
          <div class="detail-summary-grid">
            <div><span>申込数</span><strong>${audience.registrations}</strong><small>${escapeHtml(event.lumaStatus || "Luma未設定")}</small></div>
            <div><span>進捗</span><strong>${completionRate}%</strong><small>${progress.done}/${progress.total} 完了</small></div>
            <div><span>収支見込み</span><strong class="${finance.profitActual >= 0 ? "text-positive" : "text-negative"}">${formatSignedCurrency(finance.profitActual)}</strong><small>売上 ${formatCurrency(finance.revenueActual)}</small></div>
          </div>
          <div class="progress-track large"><span style="width:${completionRate}%"></span></div>
        </div>
        <div class="detail-summary-actions">
          ${renderStatusActions(event)}
          ${event.lumaUrl ? `<a class="button button-secondary" href="${escapeAttr(event.lumaUrl)}" target="_blank" rel="noreferrer">Luma を開く</a>` : ""}
          <button class="button button-ghost" data-action="duplicate-event" data-event-id="${event.id}">複製</button>
          <button class="button button-ghost button-danger" data-action="delete-event" data-event-id="${event.id}">削除</button>
        </div>
      </section>

      <section class="detail-block-grid">
        <div class="panel workspace-panel span-2">
          <div class="panel-head">
            <div>
              <h3>タスク</h3>
              <p class="subtle">未完了タスクを先に出し、完了済みは折りたたみで後ろに回します。</p>
            </div>
            <div class="inline-actions">
              <button class="button button-secondary" data-action="set-tab" data-tab="準備">詳細編集</button>
              <button class="button button-primary" data-action="open-task-modal" data-event-id="${event.id}">タスク追加</button>
            </div>
          </div>
          <div class="operational-task-list">
            ${
              openTasks.length
                ? openTasks.slice(0, 8).map((task) => renderOperationalTaskRow(event.id, task)).join("")
                : `<div class="empty-panel small">未完了タスクはありません。</div>`
            }
          </div>
          <details class="collapsible-panel" ${completedTasks.length && openTasks.length === 0 ? "open" : ""}>
            <summary>完了済みタスク ${completedTasks.length}件</summary>
            <div class="operational-task-list muted-list">
              ${
                completedTasks.length
                  ? completedTasks.map((task) => renderOperationalTaskRow(event.id, task)).join("")
                  : `<div class="empty-panel small">完了済みタスクはありません。</div>`
              }
            </div>
          </details>
        </div>

        <div class="panel workspace-panel">
          <div class="panel-head compact">
            <h3>集客</h3>
            <span class="count-pill">${audience.registrations}名</span>
          </div>
          <div class="audience-stat-grid">
            <div><span>申込数</span><strong>${audience.registrations}</strong></div>
            <div><span>参加見込み</span><strong>${audience.expectedLabel}</strong></div>
            <div><span>キャンセル数</span><strong>${audience.cancelledLabel}</strong></div>
          </div>
          <div class="audience-chart">
            ${renderAudienceMiniChart(audience)}
          </div>
        </div>

        <div class="panel workspace-panel">
          <div class="panel-head compact">
            <h3>収支</h3>
            <span class="count-pill">${event.finance.lines.length}件</span>
          </div>
          <div class="finance-summary-stack">
            <div class="finance-row"><span>売上</span><strong>${formatCurrency(finance.revenueActual)}</strong></div>
            <div class="finance-row"><span>支出</span><strong>${formatCurrency(finance.expenseActual)}</strong></div>
            <div class="finance-row total"><span>利益</span><strong class="${finance.profitActual >= 0 ? "text-positive" : "text-negative"}">${formatSignedCurrency(finance.profitActual)}</strong></div>
          </div>
          <div class="mini-breakdown-list">
            ${
              categoryBreakdown.length
                ? categoryBreakdown.slice(0, 4).map((item) => `<div class="finance-row"><span>${escapeHtml(item.category)}</span><strong>${formatCurrency(item.actual)}</strong></div>`).join("")
                : `<p class="subtle">収支明細はまだありません。</p>`
            }
          </div>
        </div>

        <div class="panel workspace-panel">
          <div class="panel-head compact">
            <h3>チーム</h3>
            <span class="count-pill">${event.runbook.roles.length}役割</span>
          </div>
          <div class="team-list">
            <div class="team-item">
              <span>担当メンバー</span>
              <strong>${escapeHtml(event.owners || "未設定")}</strong>
            </div>
            ${
              event.runbook.roles.length
                ? event.runbook.roles
                    .slice(0, 5)
                    .map(
                      (role) => `
                        <div class="team-item">
                          <span>${escapeHtml(role.role || "役割未設定")}</span>
                          <strong>${escapeHtml(role.owner || "担当未設定")}</strong>
                        </div>
                      `
                    )
                    .join("")
                : `<p class="subtle">役割分担はまだありません。</p>`
            }
          </div>
        </div>

        <div class="panel workspace-panel">
          <div class="panel-head compact">
            <h3>画像保管</h3>
            <span class="count-pill">${event.assetArchive.images.length}件</span>
          </div>
          <div class="team-list">
            <div class="team-item">
              <span>Drive フォルダ</span>
              ${
                event.assetArchive.driveFolderUrl
                  ? `<a href="${escapeAttr(event.assetArchive.driveFolderUrl)}" target="_blank" rel="noreferrer">開く</a>`
                  : `<strong>未設定</strong>`
              }
            </div>
            <div class="team-item">
              <span>画像リンク</span>
              <strong>${event.assetArchive.images.length ? `${event.assetArchive.images.length}件` : "未登録"}</strong>
            </div>
            <div class="team-item">
              <span>管理メモ</span>
              <strong>${escapeHtml(event.assetArchive.notes || "未入力")}</strong>
            </div>
          </div>
        </div>

        <div class="panel workspace-panel span-2">
          <div class="panel-head compact">
            <h3>振り返り</h3>
            <span class="count-pill">${followUps.length}件フォロー候補</span>
          </div>
          <div class="reflection-grid">
            <div><span>良かった点</span><p>${escapeHtml(event.result.wentWell || "未入力")}</p></div>
            <div><span>問題点</span><p>${escapeHtml(event.result.improvements || "未入力")}</p></div>
            <div><span>次回改善</span><p>${escapeHtml(event.result.nextMemo || "未入力")}</p></div>
          </div>
        </div>
      </section>

      <section class="panel workspace-panel detail-editor-panel">
        <div class="panel-head">
          <div>
            <h3>詳細編集</h3>
            <p class="subtle">PCではここから基本情報・当日・収支・画像リンクまで深く編集できます。</p>
          </div>
        </div>
        <div class="tabs">
          ${TAB_OPTIONS.map(
            (tab) => `
              <button class="tab-button ${state.activeTab === tab ? "active" : ""}" data-action="set-tab" data-tab="${escapeAttr(tab)}">
                ${escapeHtml(tab)}
              </button>
            `
          ).join("")}
        </div>
        <div class="tab-panel">${renderTabContent(event)}</div>
      </section>
    </section>
  `;
}

function renderOperationalTaskRow(eventId, task) {
  const overdue = getOverdueTasks([task]).length > 0;
  const dueSoon = !overdue && getDueSoonTasks([task]).length > 0;

  return `
    <div class="task-row ${task.status === "完了" ? "completed" : ""}">
      <label class="global-task-check">
        <input type="checkbox" data-action="toggle-task-status" data-event-id="${eventId}" data-task-id="${task.id}" ${task.status === "完了" ? "checked" : ""} />
      </label>
      <div class="task-row-main">
        <strong>${escapeHtml(task.title)}</strong>
        <p>${escapeHtml(task.assignee || "担当未設定")} / ${escapeHtml(task.category || "未分類")}</p>
      </div>
      <div class="task-row-meta">
        <span class="task-row-due ${overdue ? "overdue" : dueSoon ? "due-soon" : ""}">${escapeHtml(formatDate(task.dueDate))}</span>
        <button class="icon-button" type="button" data-action="edit-task" data-event-id="${eventId}" data-task-id="${task.id}">編集</button>
      </div>
    </div>
  `;
}

function buildAudienceSnapshot(event) {
  const registrations = Number(event.lumaRegistrationCount || 0);
  const checkedIn = Number(event.participantHub.checkedInCount || 0);
  const actualAttendees = Number(event.result.attendeeCount || 0);
  const expected = actualAttendees || checkedIn || 0;
  const cancelled = event.status === "開催済み" && registrations && expected ? Math.max(registrations - expected, 0) : 0;

  return {
    registrations,
    expected,
    cancelled,
    expectedLabel: expected ? `${expected}名` : "未入力",
    cancelledLabel: cancelled ? `${cancelled}名` : "未管理"
  };
}

function renderAudienceMiniChart(audience) {
  const maxValue = Math.max(audience.registrations, audience.expected, audience.cancelled, 1);
  const items = [
    { label: "申込", value: audience.registrations },
    { label: "見込み", value: audience.expected },
    { label: "キャンセル", value: audience.cancelled }
  ];

  return items
    .map(
      (item) => `
        <div class="mini-chart-row">
          <span>${escapeHtml(item.label)}</span>
          <div class="mini-chart-track"><i style="width:${Math.max((item.value / maxValue) * 100, item.value ? 12 : 0)}%"></i></div>
          <strong>${item.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderTasksWorkspace() {
  const taskItems = buildGlobalTaskItems(state.events, {
    mode: state.taskBoardFilter,
    assignee: state.taskBoardAssigneeFilter
  });
  const assigneeOptions = Array.from(
    new Set(
      state.events
        .flatMap((event) => event.tasks)
        .map((task) => task.assignee?.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ja"));

  return `
    <section class="workspace-section">
      <div class="workspace-header">
        <div>
          <p class="eyebrow">Tasks</p>
          <h2>全イベントのタスク</h2>
          <p class="subtle">今日やること、未完了、担当者別で切り替えて、運営全体のボトルネックを見ます。</p>
        </div>
      </div>
      <div class="workspace-toolbar">
        <div class="segmented-row">
          ${renderTaskBoardFilterChip("open", "未完了")}
          ${renderTaskBoardFilterChip("today", "今日やること")}
          ${renderTaskBoardFilterChip("done", "完了")}
        </div>
        <label class="search-field compact-search">
          <span>担当者</span>
          <select data-action="set-task-board-assignee-filter">
            <option value="all" ${state.taskBoardAssigneeFilter === "all" ? "selected" : ""}>すべて</option>
            <option value="__unassigned__" ${state.taskBoardAssigneeFilter === "__unassigned__" ? "selected" : ""}>未割当</option>
            ${assigneeOptions
              .map(
                (assignee) =>
                  `<option value="${escapeAttr(assignee)}" ${state.taskBoardAssigneeFilter === assignee ? "selected" : ""}>${escapeHtml(
                    assignee
                  )}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>
      <section class="panel workspace-panel">
        <div class="panel-head compact">
          <h3>タスクリスト</h3>
          <span class="count-pill">${taskItems.length}件</span>
        </div>
        <div class="global-task-list">
          ${
            taskItems.length
              ? taskItems.map((item) => renderGlobalTaskRow(item, false)).join("")
              : `<div class="empty-panel">この条件のタスクはありません。</div>`
          }
        </div>
      </section>
    </section>
  `;
}

function renderTaskBoardFilterChip(value, label) {
  return `
    <button class="filter-chip ${state.taskBoardFilter === value ? "active" : ""}" data-action="set-task-board-filter" data-task-filter="${value}">
      ${escapeHtml(label)}
    </button>
  `;
}

function buildGlobalTaskItems(events, { mode = "open", assignee = "all" } = {}) {
  return events
    .flatMap((event) =>
      event.tasks.map((task) => ({
        eventId: event.id,
        eventName: event.name || "名称未設定",
        eventStatus: event.status,
        startsAt: event.startsAt,
        task
      }))
    )
    .filter((item) => {
      if (assignee === "__unassigned__") {
        return !item.task.assignee?.trim();
      }
      if (assignee !== "all" && item.task.assignee?.trim() !== assignee) {
        return false;
      }
      if (mode === "open") {
        return item.task.status !== "完了";
      }
      if (mode === "done") {
        return item.task.status === "完了";
      }
      if (mode === "today") {
        return item.task.status !== "完了" && (getOverdueTasks([item.task]).length || getDueSoonTasks([item.task], 1).length);
      }
      return true;
    })
    .sort((a, b) => {
      const rankDiff = getTaskRank(a.task) - getTaskRank(b.task);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return toTimestamp(a.startsAt) - toTimestamp(b.startsAt);
    });
}

function renderGlobalTaskRow(item, compact) {
  const overdue = getOverdueTasks([item.task]).length > 0;
  const dueSoon = !overdue && getDueSoonTasks([item.task], compact ? 1 : 3).length > 0;

  return `
    <div class="global-task-row ${compact ? "compact" : ""}">
      <label class="global-task-check">
        <input type="checkbox" data-action="toggle-task-status" data-event-id="${item.eventId}" data-task-id="${item.task.id}" ${item.task.status === "完了" ? "checked" : ""} />
        <span></span>
      </label>
      <div class="global-task-content">
        <strong>${escapeHtml(item.task.title)}</strong>
        <p>${escapeHtml(item.eventName)} / ${escapeHtml(item.task.assignee || "担当未設定")}</p>
      </div>
      <div class="global-task-side">
        <span class="mini-pill">${escapeHtml(item.task.category || "未分類")}</span>
        <span class="task-row-due ${overdue ? "overdue" : dueSoon ? "due-soon" : ""}">${escapeHtml(formatDate(item.task.dueDate))}</span>
        <button class="button button-ghost compact-button" data-action="open-event-detail" data-event-id="${item.eventId}">イベントへ</button>
      </div>
    </div>
  `;
}

function renderFinanceWorkspace() {
  const monthly = buildMonthlyFinanceSummary(state.events);
  const summary = buildDashboardSnapshot(state.events);
  const orderedEvents = [...state.events].sort((a, b) => toTimestamp(a.startsAt) - toTimestamp(b.startsAt));

  return `
    <section class="workspace-section">
      <div class="workspace-header">
        <div>
          <p class="eyebrow">Finance</p>
          <h2>収支</h2>
          <p class="subtle">イベント別の収支を横断して、利益の偏りや未精算を見つけやすくします。</p>
        </div>
      </div>
      <section class="dashboard-metrics">
        ${renderDashboardMetric("売上合計", formatCurrency(summary.totalRevenue), "実績ベース")}
        ${renderDashboardMetric("支出合計", formatCurrency(summary.totalExpense), "実績ベース")}
        ${renderDashboardMetric("利益合計", formatSignedCurrency(summary.totalProfit), summary.totalProfit >= 0 ? "黒字" : "赤字")}
        ${renderDashboardMetric("未精算", formatCurrency(summary.totalUnsettledAmount), `${summary.totalUnsettledLines}件`)}
      </section>
      <section class="workspace-split">
        <div class="panel workspace-panel">
          <div class="panel-head compact">
            <h3>月別サマリー</h3>
            <span class="count-pill">${monthly.length}ヶ月</span>
          </div>
          <div class="month-summary-list">
            ${
              monthly.length
                ? monthly.map((item) => renderMiniMonthSummary(item)).join("")
                : `<div class="empty-panel small">月別サマリーはまだありません。</div>`
            }
          </div>
        </div>
        <div class="panel workspace-panel">
          <div class="panel-head compact">
            <h3>イベント別収支</h3>
            <span class="count-pill">${orderedEvents.length}件</span>
          </div>
          <div class="finance-event-list">
            ${orderedEvents
              .map((event) => {
                const finance = calculateFinance(event);
                return `
                  <button class="finance-event-row" data-action="open-event-detail" data-event-id="${event.id}">
                    <div>
                      <strong>${escapeHtml(event.name || "名称未設定")}</strong>
                      <p>${escapeHtml(formatDate(event.startsAt))}</p>
                    </div>
                    <div class="finance-event-meta">
                      <span>売上 ${formatCurrency(finance.revenueActual)}</span>
                      <span>支出 ${formatCurrency(finance.expenseActual)}</span>
                      <strong class="${finance.profitActual >= 0 ? "text-positive" : "text-negative"}">${formatSignedCurrency(finance.profitActual)}</strong>
                    </div>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      </section>
    </section>
  `;
}

function buildDashboardSnapshot(events) {
  return events.reduce(
    (acc, event) => {
      const finance = calculateFinance(event);
      acc.activeEvents += ["公開準備中", "募集中"].includes(event.status) ? 1 : 0;
      acc.openTasks += event.tasks.filter((task) => task.status !== "完了").length;
      acc.overdueTasks += getOverdueTasks(event.tasks).length;
      acc.totalRegistrations += Number(event.lumaRegistrationCount || 0);
      acc.totalRevenue += finance.revenueActual;
      acc.totalExpense += finance.expenseActual;
      acc.totalProfit += finance.profitActual;
      acc.totalUnsettledLines += getUnsettledLines(event.finance.lines).length;
      acc.totalUnsettledAmount += getUnsettledLines(event.finance.lines).reduce(
        (sum, line) => sum + Number(line.actualAmount || line.plannedAmount || 0),
        0
      );
      return acc;
    },
    {
      activeEvents: 0,
      openTasks: 0,
      overdueTasks: 0,
      totalRegistrations: 0,
      totalRevenue: 0,
      totalExpense: 0,
      totalProfit: 0,
      totalUnsettledLines: 0,
      totalUnsettledAmount: 0
    }
  );
}

function getStageScopedEvents(stage) {
  const visible = getVisibleEvents();

  if (stage === "進行中") {
    return visible.filter((event) => ["公開準備中", "募集中"].includes(event.status));
  }

  if (stage === "予定") {
    return visible.filter((event) => event.status === "企画中");
  }

  if (stage === "終了") {
    return visible.filter((event) => event.status === "開催済み");
  }

  return visible;
}

function buildMonthlyFinanceSummary(events) {
  const grouped = new Map();

  events.forEach((event) => {
    if (!event.startsAt) {
      return;
    }

    const key = event.startsAt.slice(0, 7);
    const finance = calculateFinance(event);
    const current = grouped.get(key) || {
      key,
      label: formatMonthLabel(key),
      revenue: 0,
      expense: 0,
      profit: 0,
      events: 0
    };

    current.revenue += finance.revenueActual;
    current.expense += finance.expenseActual;
    current.profit += finance.profitActual;
    current.events += 1;
    grouped.set(key, current);
  });

  return [...grouped.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function renderMiniMonthSummary(item) {
  const denominator = Math.max(item.revenue, item.expense, Math.abs(item.profit), 1);
  const profitWidth = Math.min((Math.abs(item.profit) / denominator) * 100, 100);

  return `
    <div class="month-summary-card">
      <div class="month-summary-head">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${item.events}件</span>
      </div>
      <div class="finance-row"><span>売上</span><strong>${formatCurrency(item.revenue)}</strong></div>
      <div class="finance-row"><span>支出</span><strong>${formatCurrency(item.expense)}</strong></div>
      <div class="mini-chart-track profit ${item.profit >= 0 ? "positive" : "negative"}"><i style="width:${profitWidth}%"></i></div>
      <div class="finance-row total"><span>利益</span><strong class="${item.profit >= 0 ? "text-positive" : "text-negative"}">${formatSignedCurrency(item.profit)}</strong></div>
    </div>
  `;
}

function renderMobileToolbar(selectedEvent) {
  const schedule = selectedEvent ? buildScheduleStatus(selectedEvent) : null;

  return `
    <section class="mobile-toolbar">
      <div>
        <p class="eyebrow">Mobile</p>
        <strong>${escapeHtml(selectedEvent?.name || "イベント未選択")}</strong>
        <small>${escapeHtml(schedule?.shortLabel || "イベント一覧から選択")}</small>
      </div>
      <div class="mobile-toolbar-actions">
        ${renderSavePill()}
        <button class="button button-secondary" data-action="open-mobile-sidebar">イベント一覧</button>
      </div>
    </section>
  `;
}

function renderPortfolioSummary() {
  const summary = buildPortfolioSummary(state.events);

  return `
    <section class="panel">
      <div class="panel-head compact">
        <h2>全体サマリー</h2>
        <span class="count-pill">${summary.totalEvents}件</span>
      </div>
      <div class="portfolio-grid">
        <div class="alert-card">
          <span>開催前</span>
          <strong>${summary.upcomingEvents}</strong>
          <small>企画中〜募集中</small>
        </div>
        <div class="alert-card">
          <span>募集中</span>
          <strong>${summary.recruitingEvents}</strong>
          <small>集客中のイベント</small>
        </div>
        <div class="alert-card">
          <span>申込数合計</span>
          <strong>${summary.totalRegistrations}</strong>
          <small>Lumaの手入力合計</small>
        </div>
        <div class="alert-card">
          <span>期限超過</span>
          <strong>${summary.totalOverdueTasks}</strong>
          <small>全イベント合計</small>
        </div>
        <div class="alert-card">
          <span>未精算総額</span>
          <strong>${formatCurrency(summary.totalUnsettledAmount)}</strong>
          <small>${summary.totalUnsettledLines}件の未精算</small>
        </div>
      </div>
    </section>
  `;
}

function buildPortfolioSummary(events) {
  return events.reduce(
    (acc, event) => {
      const registrationCount = Number(event.lumaRegistrationCount || 0);
      const unsettledLines = getUnsettledLines(event.finance.lines);
      const unsettledAmount = unsettledLines.reduce(
        (sum, line) => sum + Number(line.actualAmount || line.plannedAmount || 0),
        0
      );

      acc.totalEvents += 1;
      if (event.status !== "開催済み") {
        acc.upcomingEvents += 1;
      }
      if (event.status === "募集中") {
        acc.recruitingEvents += 1;
      }
      acc.totalRegistrations += registrationCount;
      acc.totalOverdueTasks += getOverdueTasks(event.tasks).length;
      acc.totalUnsettledLines += unsettledLines.length;
      acc.totalUnsettledAmount += unsettledAmount;

      return acc;
    },
    {
      totalEvents: 0,
      upcomingEvents: 0,
      recruitingEvents: 0,
      totalRegistrations: 0,
      totalOverdueTasks: 0,
      totalUnsettledLines: 0,
      totalUnsettledAmount: 0
    }
  );
}

function renderSavePill() {
  const labels = {
    idle: "未保存",
    saving: "保存中...",
    saved: state.lastSavedAt ? `保存済み ${formatTime(state.lastSavedAt)}` : "保存済み",
    error: "保存失敗"
  };

  return `<span class="save-pill ${state.saveState}">${labels[state.saveState]}</span>`;
}

function renderFilterButton(value, label) {
  const isActive = state.filter === value;
  const count =
    value === "all"
      ? state.events.length
      : state.events.filter((event) => event.status === value).length;

  return `
    <button class="filter-chip ${isActive ? "active" : ""}" data-action="set-filter" data-filter="${escapeAttr(
      value
    )}">
      <span>${escapeHtml(label)}</span>
      <span class="chip-count">${count}</span>
    </button>
  `;
}

function renderEventList() {
  const events = getVisibleEvents();

  if (!events.length) {
    return `<div class="empty-panel small">該当するイベントはまだありません。</div>`;
  }

  return events
    .map((event) => {
      const financeTone = getFinanceTone(event);
      const ops = buildOperationalSummary(event);
      const health = buildHealthSnapshot(event);
      const schedule = buildScheduleStatus(event);
      const isSelected = event.id === state.selectedEventId;

      return `
        <button class="event-card ${isSelected ? "selected" : ""}" data-action="select-event" data-event-id="${event.id}">
          <div class="event-card-top">
            <span class="status-badge">${escapeHtml(event.status)}</span>
            <span class="mini-pill ${schedule.tone}">${escapeHtml(schedule.shortLabel)}</span>
          </div>
          <h3>${escapeHtml(event.name || "名称未設定")}</h3>
          <p class="event-card-summary">${escapeHtml(event.summary || event.theme || "準備・当日・終了後・収支をまとめて管理")}</p>
          <dl class="meta-list compact-meta-list">
            <div><dt>開催</dt><dd>${formatDateTime(event.startsAt)}</dd></div>
            <div><dt>会場</dt><dd>${escapeHtml(event.venue || "未設定")}</dd></div>
            <div><dt>Luma</dt><dd>${escapeHtml(formatShortUrl(event.lumaUrl) || "未設定")}</dd></div>
          </dl>
          <div class="card-foot">
            <span class="mini-pill">${event.lumaRegistrationCount || 0}名</span>
            <span class="finance-badge ${financeTone.tone}">${financeTone.label}</span>
            <span class="mini-pill">${health.score}/${health.total} 健全性</span>
            ${ops.overdueTasks.length ? `<span class="mini-pill warning">期限超過 ${ops.overdueTasks.length}</span>` : ""}
            ${ops.unsettledLines.length ? `<span class="mini-pill warning">未精算 ${ops.unsettledLines.length}</span>` : ""}
          </div>
        </button>
      `;
    })
    .join("");
}

function renderEventDetail(event) {
  const financeTone = getFinanceTone(event);
  const finance = calculateFinance(event);
  const progress = getTaskProgress(event.tasks);
  const neighbors = getNeighborEvents();
  const health = buildHealthSnapshot(event);
  const schedule = buildScheduleStatus(event);
  const review = buildReadinessReview(event);
  const ops = buildOperationalSummary(event);
  const nextActions = buildNextActions(event);

  return `
    <section class="detail-header">
      <div class="detail-hero">
        <div class="detail-hero-main">
          <p class="eyebrow">Event Hub</p>
          <h2>${escapeHtml(event.name || "名称未設定")}</h2>
          <div class="detail-meta">
            <span>${formatDateTime(event.startsAt)}</span>
            <span>${escapeHtml(event.venue || "会場未設定")}</span>
            <span class="status-badge">${escapeHtml(event.status)}</span>
            <span class="finance-badge ${financeTone.tone}">${financeTone.label}</span>
          </div>
          <p class="subtle">${escapeHtml(event.summary || "概要未入力")}</p>
        </div>
        <div class="detail-hero-actions">
          <div class="action-cluster">
            ${renderStatusActions(event)}
            ${event.lumaUrl ? `<a class="button button-secondary" href="${escapeAttr(event.lumaUrl)}" target="_blank" rel="noreferrer">Lumaを開く</a>` : ""}
          </div>
          <div class="action-cluster action-cluster-muted">
            <button class="button button-ghost" data-action="select-event" data-event-id="${neighbors.previous?.id || ""}" ${
              neighbors.previous ? "" : "disabled"
            }>前へ</button>
            <button class="button button-ghost" data-action="select-event" data-event-id="${neighbors.next?.id || ""}" ${
              neighbors.next ? "" : "disabled"
            }>次へ</button>
            <button class="button button-ghost" data-action="duplicate-event" data-event-id="${event.id}">複製</button>
            <button class="button button-ghost button-danger" data-action="delete-event" data-event-id="${event.id}">削除</button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel overview-panel">
      <div class="overview-grid">
        <div class="overview-primary">
          <div class="panel-head compact">
            <h3>今やること</h3>
            <span class="count-pill">${nextActions.length}件</span>
          </div>
          <div class="highlight-list">
            <ul>${nextActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
          <div class="overview-links">
            <button class="button button-secondary" data-action="set-tab" data-tab="準備">準備を見る</button>
            <button class="button button-secondary" data-action="set-tab" data-tab="当日">当日を見る</button>
            <button class="button button-secondary" data-action="set-tab" data-tab="収支">収支を見る</button>
          </div>
        </div>
        <div class="overview-side">
          <div class="stats-grid compact-stats">
            <div class="stat-card compact">
              <span>準備進捗</span>
              <strong>${progress.done}/${progress.total}</strong>
              <small>${progress.inProgress}件進行中</small>
            </div>
            <div class="stat-card compact">
              <span>収支実績</span>
              <strong>${formatCurrency(finance.profitActual)}</strong>
              <small>${financeTone.label}</small>
            </div>
            <div class="stat-card compact">
              <span>健全性</span>
              <strong>${health.score}/${health.total}</strong>
              <small>${health.label}</small>
            </div>
            <div class="stat-card compact">
              <span>開催日程</span>
              <strong>${escapeHtml(schedule.shortLabel)}</strong>
              <small>${escapeHtml(schedule.detail)}</small>
            </div>
          </div>
          <div class="summary-row compact-summary-row">
            ${review.blockers.length ? `<span class="mini-pill warning">要対応 ${review.blockers.length}</span>` : `<span class="mini-pill">要対応 0</span>`}
            ${ops.overdueTasks.length ? `<span class="mini-pill warning">期限超過 ${ops.overdueTasks.length}</span>` : `<span class="mini-pill">期限超過 0</span>`}
            ${ops.unsettledLines.length ? `<span class="mini-pill warning">未精算 ${ops.unsettledLines.length}</span>` : `<span class="mini-pill">未精算 0</span>`}
            <span class="mini-pill">Luma ${event.lumaRegistrationCount || 0}名</span>
          </div>
        </div>
      </div>
    </section>

    ${renderTimelineMeta(event)}

    <section class="tabs">
      ${TAB_OPTIONS.map(
        (tab) => `
          <button class="tab-button ${state.activeTab === tab ? "active" : ""}" data-action="set-tab" data-tab="${escapeAttr(tab)}">
            ${escapeHtml(tab)}
          </button>
        `
      ).join("")}
    </section>

    <section class="tab-panel">
      ${renderTabContent(event)}
    </section>
  `;
}

function renderStatusActions(event) {
  const index = STATUS_FLOW.indexOf(event.status);
  const previousStatus = STATUS_FLOW[index - 1] || null;
  const nextStatus = STATUS_FLOW[index + 1] || null;

  return `
    ${previousStatus ? `<button class="button button-ghost" data-action="set-status" data-event-id="${event.id}" data-status="${previousStatus}">${previousStatus}へ戻す</button>` : ""}
    ${nextStatus ? `<button class="button button-secondary" data-action="set-status" data-event-id="${event.id}" data-status="${nextStatus}">${nextStatus}へ進める</button>` : ""}
  `;
}

function renderTimelineMeta(event) {
  return `
    <section class="panel timeline-panel">
      <div class="panel-head compact">
        <h3>更新履歴</h3>
        <span class="count-pill">簡易ログ</span>
      </div>
      <div class="history-grid">
        <div class="mini-stat">
          <span>作成日時</span>
          <strong>${formatDateTime(event.createdAt)}</strong>
        </div>
        <div class="mini-stat">
          <span>最終更新</span>
          <strong>${formatDateTime(event.updatedAt)}</strong>
        </div>
        <div class="mini-stat">
          <span>Luma確認</span>
          <strong>${formatDateTime(event.lumaCheckedAt)}</strong>
        </div>
        <div class="mini-stat">
          <span>開催締め</span>
          <strong>${formatDateTime(event.result.closedAt)}</strong>
        </div>
      </div>
    </section>
  `;
}

function buildOperationalSummary(event) {
  const overdueTasks = getOverdueTasks(event.tasks);
  const dueSoonTasks = getDueSoonTasks(event.tasks);
  const unsettledLines = getUnsettledLines(event.finance.lines);
  const runbookReadyCount = [
    event.runbook.timetable.length > 0,
    event.runbook.roles.length > 0,
    event.runbook.checklist.length > 0,
    Boolean(event.runbook.attentionNotes),
    Boolean(event.runbook.emergencyMemo)
  ].filter(Boolean).length;

  const focusItems = [];

  overdueTasks.slice(0, 2).forEach((task) => {
    focusItems.push(`期限超過: ${task.title} (${task.assignee || "担当未設定"})`);
  });

  dueSoonTasks.slice(0, 2).forEach((task) => {
    focusItems.push(`直近対応: ${task.title} (${formatDate(task.dueDate)}まで)`);
  });

  unsettledLines.slice(0, 2).forEach((line) => {
    focusItems.push(`未精算: ${line.name} ${formatCurrency(line.actualAmount || line.plannedAmount)}`);
  });

  if (!event.lumaUrl) {
    focusItems.push("Luma URLが未設定です。");
  }

  if (event.status !== "企画中" && !event.lumaCheckedAt) {
    focusItems.push("Lumaの確認日時が未入力です。");
  }

  if (event.status !== "開催済み" && runbookReadyCount < 3) {
    focusItems.push("当日運営の下地がまだ薄いです。タイムテーブル・役割・チェック項目を埋めたい状態です。");
  }

  return {
    overdueTasks,
    dueSoonTasks,
    unsettledLines,
    runbookReadyCount,
    focusItems
  };
}

function buildNextActions(event) {
  const actions = [];
  const overdueTasks = getOverdueTasks(event.tasks);
  const dueSoonTasks = getDueSoonTasks(event.tasks);
  const unsettledLines = getUnsettledLines(event.finance.lines);
  const schedule = buildScheduleStatus(event);

  if (!event.lumaUrl && event.status !== "企画中") {
    actions.push("Luma URLが未設定です。公開前ならページ作成とURL転記を先に済ませたい状態です。");
  }

  if (overdueTasks.length) {
    actions.push(`期限超過タスクが ${overdueTasks.length} 件あります。まずは最上位の遅延を解消したいです。`);
  } else if (dueSoonTasks.length) {
    actions.push(`3日以内のタスクが ${dueSoonTasks.length} 件あります。今日の着手対象をここから決めるのがおすすめです。`);
  }

  if (schedule.shortLabel === "本日" && event.runbook.checklist.some((item) => !item.checked)) {
    actions.push("本日開催です。当日チェック項目を見ながら現場確認に切り替える段階です。");
  } else if (schedule.tone === "warning" && event.runbook.timetable.length === 0) {
    actions.push("開催が近いのにタイムテーブルが薄いです。当日タブの流れを先に固めたいです。");
  }

  if (event.status === "開催済み" && !event.result.impression && !event.result.wentWell && !event.result.improvements) {
    actions.push("終了後記録がまだ薄いです。熱量が残っているうちに所感と改善点を残すと次回に効きます。");
  }

  if (unsettledLines.length) {
    actions.push(`未精算が ${unsettledLines.length} 件あります。収支タブで立替の精算状態を更新したいです。`);
  }

  if (!actions.length) {
    actions.push("大きな詰まりはありません。次はイベント内容の磨き込みか、次回用のテンプレ整理に集中できます。");
  }

  return actions.slice(0, 4);
}

function renderTabContent(event) {
  switch (state.activeTab) {
    case "準備":
      return renderPreparationTab(event);
    case "当日":
      return renderRunbookTab(event);
    case "終了後":
      return renderResultTab(event);
    case "収支":
      return renderFinanceTab(event);
    case "基本情報":
    default:
      return renderBasicsTab(event);
  }
}

function renderBasicsTab(event) {
  const templateLabel = EVENT_TEMPLATES.find((template) => template.id === event.templateId)?.label || "カスタム";
  const imageCount = event.assetArchive.images.length;

  return `
    <form class="stack-form" data-form="basic-info" data-event-id="${event.id}">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>基本情報</h3>
            <p class="subtle">イベントそのものの情報をまとめます。主役は Event で、People中心には寄せていません。</p>
          </div>
        </div>
        <div class="section-grid two-column">
          ${renderField("イベント名", `<input name="name" value="${escapeAttr(event.name)}" required />`)}
          ${renderField(
            "開催日時",
            `<input type="datetime-local" name="startsAt" step="300" value="${escapeAttr(toDatetimeLocalValue(event.startsAt))}" />`
          )}
          ${renderField("会場", `<input name="venue" value="${escapeAttr(event.venue)}" />`)}
          ${renderField(
            "ステータス",
            `<select name="status">${EVENT_STATUS_OPTIONS.map(
              (status) => `<option value="${status}" ${event.status === status ? "selected" : ""}>${status}</option>`
            ).join("")}</select>`
          )}
          ${renderField("テーマ", `<input name="theme" value="${escapeAttr(event.theme)}" />`)}
          ${renderField("登壇者", `<input name="speakers" value="${escapeAttr(event.speakers)}" />`)}
          ${renderField("主催 / 担当", `<input name="owners" value="${escapeAttr(event.owners)}" />`)}
          ${renderField("Luma URL", `<input type="url" name="lumaUrl" value="${escapeAttr(event.lumaUrl)}" placeholder="https://lu.ma/..." />`)}
          ${renderField("テンプレ種別", `<input value="${escapeAttr(templateLabel)}" disabled />`)}
        </div>
        ${renderField("概要", `<textarea name="summary" rows="4">${escapeHtml(event.summary)}</textarea>`)}
        ${renderField("備考", `<textarea name="notes" rows="4">${escapeHtml(event.notes)}</textarea>`)}
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Luma連携の入口</h3>
            <p class="subtle">今回は本格同期まではせず、URL・公開状態・申込数・最終確認メモを持てる入口だけ整えています。</p>
          </div>
        </div>
        <div class="section-grid two-column">
          ${renderField(
            "Luma状態",
            `<select name="lumaStatus">${LUMA_STATUS_OPTIONS.map(
              (status) => `<option value="${status}" ${event.lumaStatus === status ? "selected" : ""}>${status}</option>`
            ).join("")}</select>`
          )}
          ${renderField(
            "申込数メモ",
            `<input type="number" min="0" name="lumaRegistrationCount" value="${escapeAttr(event.lumaRegistrationCount)}" />`
          )}
          ${renderField(
            "最終確認日時",
            `<input type="datetime-local" name="lumaCheckedAt" step="300" value="${escapeAttr(toDatetimeLocalValue(event.lumaCheckedAt))}" />`
          )}
          ${renderField("公開URL", `<input type="url" name="lumaUrlMirror" value="${escapeAttr(event.lumaUrl)}" disabled />`)}
        </div>
        ${renderField("Luma運用メモ", `<textarea name="lumaNotes" rows="4">${escapeHtml(event.lumaNotes)}</textarea>`)}
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>画像保管</h3>
            <p class="subtle">画像本体は Google Drive 側で管理し、このイベントにはフォルダ URL と共有したい画像リンクだけを残します。</p>
          </div>
          <div class="inline-actions">
            <span class="count-pill">${imageCount}件</span>
            <button class="button button-primary" type="button" data-action="open-asset-modal" data-event-id="${event.id}">画像リンク追加</button>
          </div>
        </div>
        <div class="section-grid two-column">
          ${renderField(
            "Google Drive フォルダ URL",
            `<input type="url" name="imageDriveFolderUrl" value="${escapeAttr(event.assetArchive.driveFolderUrl)}" placeholder="https://drive.google.com/..." />`
          )}
          ${renderField(
            "フォルダ確認",
            event.assetArchive.driveFolderUrl
              ? `<a class="button button-secondary button-block" href="${escapeAttr(event.assetArchive.driveFolderUrl)}" target="_blank" rel="noreferrer">Google Drive を開く</a>`
              : `<input value="URL未設定" disabled />`
          )}
        </div>
        ${renderField("画像管理メモ", `<textarea name="imageArchiveNotes" rows="4">${escapeHtml(event.assetArchive.notes)}</textarea>`)}
        <div class="participant-list">
          ${
            imageCount
              ? event.assetArchive.images
                  .map(
                    (item) => `
                      <article class="compact-row">
                        <div>
                          <strong>${escapeHtml(item.label || "画像リンク")}</strong>
                          <p>${escapeHtml(formatShortUrl(item.url) || item.url || "URL未設定")}</p>
                          <small>${escapeHtml(item.note || "メモなし")}</small>
                        </div>
                        <div class="inline-actions">
                          <a class="icon-button" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">開く</a>
                          <button class="icon-button" type="button" data-action="edit-asset" data-event-id="${event.id}" data-item-id="${item.id}">編集</button>
                          <button class="icon-button danger" type="button" data-action="delete-asset" data-event-id="${event.id}" data-item-id="${item.id}">削除</button>
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : `<div class="empty-panel small">画像リンクはまだありません。Drive フォルダ URL と、共有したい画像リンクを残せます。</div>`
          }
        </div>
      </div>

      <div class="form-actions">
        <button class="button button-primary" type="submit">基本情報を保存</button>
        <button class="button button-ghost button-danger" type="button" data-action="delete-event" data-event-id="${event.id}">このイベントを削除</button>
      </div>
    </form>
  `;
}

function renderPreparationTab(event) {
  const progress = getTaskProgress(event.tasks);
  const overdueTasks = getOverdueTasks(event.tasks);
  const dueSoonTasks = getDueSoonTasks(event.tasks);
  const filteredTasks = getFilteredPrepTasks(event.tasks);
  const categorySummary = buildPrepCategorySummary(event.tasks);
  const prepBulkSummary = buildPrepBulkSummary(filteredTasks);
  const assigneeOptions = buildPrepAssigneeOptions(event.tasks);
  const assigneeSummary = buildPrepAssigneeSummary(event.tasks);

  return `
    <section class="section-stack">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>準備タスク</h3>
            <p class="subtle">期限超過と直近タスクが先に見えるようにしています。実運用ではここから優先順位を決めやすくします。</p>
          </div>
          <div class="inline-actions">
            <button class="button button-secondary" data-action="seed-tasks" data-event-id="${event.id}">テンプレ追加</button>
            <button class="button button-ghost" data-action="bulk-update-prep-status" data-event-id="${event.id}" data-status="進行中" ${
              prepBulkSummary.actionable ? "" : "disabled"
            }>表示中を進行中</button>
            <button class="button button-ghost" data-action="bulk-update-prep-status" data-event-id="${event.id}" data-status="完了" ${
              prepBulkSummary.actionable ? "" : "disabled"
            }>表示中を完了</button>
            <button class="button button-ghost" data-action="bulk-update-prep-status" data-event-id="${event.id}" data-status="未着手" ${
              prepBulkSummary.doneOnly ? "" : "disabled"
            }>完了を未着手へ戻す</button>
            <button class="button button-primary" data-action="open-task-modal" data-event-id="${event.id}">タスク追加</button>
          </div>
        </div>
        <div class="summary-row">
          <div class="mini-stat"><span>合計</span><strong>${progress.total}</strong></div>
          <div class="mini-stat"><span>完了</span><strong>${progress.done}</strong></div>
          <div class="mini-stat"><span>進行中</span><strong>${progress.inProgress}</strong></div>
          <div class="mini-stat"><span>期限超過</span><strong>${overdueTasks.length}</strong></div>
          <div class="mini-stat"><span>3日以内</span><strong>${dueSoonTasks.length}</strong></div>
          <div class="mini-stat"><span>表示中</span><strong>${prepBulkSummary.visible}</strong></div>
        </div>
        <div class="filter-row">
          ${renderPrepFilterButton("all", "全件")}
          ${renderPrepFilterButton("open", "未完了")}
          ${renderPrepFilterButton("overdue", "期限超過")}
          ${renderPrepFilterButton("dueSoon", "3日以内")}
          ${renderPrepFilterButton("completed", "完了")}
          ${renderPrepFilterButton("noDue", "期限未設定")}
        </div>
        <label class="search-field">
          <span>担当者で絞り込み</span>
          <select data-action="set-prep-assignee-filter">
            <option value="all" ${state.prepAssigneeFilter === "all" ? "selected" : ""}>すべて</option>
            <option value="__unassigned__" ${state.prepAssigneeFilter === "__unassigned__" ? "selected" : ""}>未割当</option>
            ${assigneeOptions
              .map(
                (assignee) =>
                  `<option value="${escapeAttr(assignee)}" ${state.prepAssigneeFilter === assignee ? "selected" : ""}>${escapeHtml(
                    assignee
                  )}</option>`
              )
              .join("")}
          </select>
        </label>
        <div class="prep-category-grid">
          ${categorySummary
            .map(
              (item) => `
                <div class="mini-stat">
                  <span>${escapeHtml(item.category)}</span>
                  <strong>${item.total}</strong>
                  <small>完了 ${item.done} / 未完了 ${item.open}</small>
                </div>
              `
            )
            .join("")}
        </div>
        ${
          assigneeSummary.length
            ? `
              <div class="panel">
                <div class="panel-head compact">
                  <h3>担当者サマリー</h3>
                  <span class="count-pill">${assigneeSummary.length}名</span>
                </div>
                <div class="portfolio-grid">
                  ${assigneeSummary
                    .map(
                      (item) => `
                        <div class="mini-stat">
                          <span>${escapeHtml(item.assignee)}</span>
                          <strong>${item.open}</strong>
                          <small>全${item.total}件 / 期限超過 ${item.overdue} / 3日以内 ${item.dueSoon}</small>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              </div>
            `
            : ""
        }
        <div class="task-list">
          ${
            filteredTasks.length
              ? filteredTasks.map((task) => renderTaskCard(event.id, task)).join("")
              : `<div class="empty-panel">この条件に合うタスクはありません。</div>`
          }
        </div>
      </div>
    </section>
  `;
}

function buildPrepCategorySummary(tasks) {
  const grouped = TASK_CATEGORY_OPTIONS.map((category) => ({
    category,
    total: 0,
    done: 0,
    open: 0
  }));

  tasks.forEach((task) => {
    const target = grouped.find((item) => item.category === task.category);

    if (!target) {
      return;
    }

    target.total += 1;
    if (task.status === "完了") {
      target.done += 1;
    } else {
      target.open += 1;
    }
  });

  return grouped.filter((item) => item.total > 0);
}

function getFilteredPrepTasks(tasks) {
  return tasks.slice().sort(sortTasks).filter(matchesCurrentPrepFilters);
}

function buildPrepBulkSummary(tasks) {
  return {
    visible: tasks.length,
    actionable: tasks.some((task) => task.status !== "完了"),
    doneOnly: tasks.some((task) => task.status === "完了")
  };
}

function buildPrepAssigneeOptions(tasks) {
  return Array.from(
    new Set(
      tasks
        .map((task) => task.assignee?.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ja"));
}

function renderPrepFilterButton(value, label) {
  return `
    <button class="filter-chip ${state.prepFilter === value ? "active" : ""}" data-action="set-prep-filter" data-prep-filter="${escapeAttr(value)}">
      ${escapeHtml(label)}
    </button>
  `;
}

function matchesCurrentPrepFilters(task) {
  return matchesPrepFilters(task, {
    prepFilter: state.prepFilter,
    prepAssigneeFilter: state.prepAssigneeFilter
  });
}

function sortTasks(a, b) {
  const aRank = getTaskRank(a);
  const bRank = getTaskRank(b);

  if (aRank !== bRank) {
    return aRank - bRank;
  }

  return (a.dueDate || "").localeCompare(b.dueDate || "") || a.title.localeCompare(b.title);
}

function getTaskRank(task) {
  if (task.status === "完了") {
    return 4;
  }

  if (getOverdueTasks([task]).length) {
    return 0;
  }

  if (getDueSoonTasks([task]).length) {
    return 1;
  }

  if (task.status === "進行中") {
    return 2;
  }

  return 3;
}

function renderTaskCard(eventId, task) {
  const overdue = getOverdueTasks([task]).length > 0;
  const dueSoon = !overdue && getDueSoonTasks([task]).length > 0;

  return `
    <article class="item-card ${overdue ? "overdue" : dueSoon ? "due-soon" : ""}">
      <div class="item-card-head">
        <div>
          <h4>${escapeHtml(task.title)}</h4>
          <div class="item-badges">
            <span class="tag">${escapeHtml(task.category || "未分類")}</span>
            <span class="tag">${escapeHtml(task.status || "未着手")}</span>
            ${overdue ? `<span class="tag warning">期限超過</span>` : ""}
            ${dueSoon ? `<span class="tag due">3日以内</span>` : ""}
          </div>
        </div>
        <div class="inline-actions">
          ${
            task.status !== "完了"
              ? `<button class="icon-button" data-action="mark-task-done" data-event-id="${eventId}" data-task-id="${task.id}">完了にする</button>`
              : ""
          }
          <button class="icon-button" data-action="edit-task" data-event-id="${eventId}" data-task-id="${task.id}">編集</button>
          <button class="icon-button danger" data-action="delete-task" data-event-id="${eventId}" data-task-id="${task.id}">削除</button>
        </div>
      </div>
      <dl class="detail-list">
        <div><dt>担当</dt><dd>${escapeHtml(task.assignee || "未設定")}</dd></div>
        <div><dt>期限</dt><dd>${formatDate(task.dueDate)}</dd></div>
      </dl>
      <p class="subtle">${escapeHtml(task.memo || "メモなし")}</p>
    </article>
  `;
}

function renderRunbookTab(event) {
  const runbook = event.runbook;
  const checkedCount = runbook.checklist.filter((item) => item.checked).length;
  const timelineChecks = buildTimelineChecks(event);
  const roleCoverage = buildRoleCoverage(runbook.roles);

  return `
    <section class="section-stack">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>当日運営</h3>
            <p class="subtle">当日画面だけで、流れ、役割、注意事項、チェック項目が追える構成です。印刷用にも使えます。</p>
          </div>
          <div class="inline-actions">
            <button class="button button-secondary" data-action="print-runbook">印刷</button>
            <button class="button button-secondary" data-action="copy-runbook" data-event-id="${event.id}">共有用コピー</button>
          </div>
        </div>
        <div class="summary-row">
          <div class="mini-stat"><span>タイムテーブル</span><strong>${runbook.timetable.length}</strong></div>
          <div class="mini-stat"><span>役割</span><strong>${runbook.roles.length}</strong></div>
          <div class="mini-stat"><span>チェック済み</span><strong>${checkedCount}/${runbook.checklist.length}</strong></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head compact">
          <h3>タイムテーブル整合チェック</h3>
          <span class="count-pill">${timelineChecks.issues.length + timelineChecks.warnings.length}件</span>
        </div>
        <div class="review-grid">
          <div class="review-card danger">
            <h4>要修正</h4>
            ${
              timelineChecks.issues.length
                ? `<ul>${timelineChecks.issues.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                : `<p class="subtle">致命的な抜けはありません。</p>`
            }
          </div>
          <div class="review-card warning">
            <h4>注意</h4>
            ${
              timelineChecks.warnings.length
                ? `<ul>${timelineChecks.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                : `<p class="subtle">大きな注意点はありません。</p>`
            }
          </div>
          <div class="review-card neutral">
            <h4>補足</h4>
            <ul>
              <li>タイムテーブル ${event.runbook.timetable.length}件</li>
              <li>役割 ${event.runbook.roles.length}件</li>
              <li>空欄担当 ${timelineChecks.missingOwners}件</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head compact">
          <h3>役割の未割当確認</h3>
          <span class="count-pill">${roleCoverage.unassigned.length}件</span>
        </div>
        <div class="summary-row">
          <div class="mini-stat"><span>登録役割</span><strong>${roleCoverage.total}</strong></div>
          <div class="mini-stat"><span>割当済み</span><strong>${roleCoverage.assigned}</strong></div>
          <div class="mini-stat"><span>未割当</span><strong>${roleCoverage.unassigned.length}</strong></div>
        </div>
        ${
          roleCoverage.unassigned.length
            ? `<div class="highlight-list"><ul>${roleCoverage.unassigned.map((role) => `<li>${escapeHtml(role.role || "役割未設定")} が未割当です。</li>`).join("")}</ul></div>`
            : `<p class="subtle">当日役割はすべて担当者が入っています。</p>`
        }
      </div>

      <div class="dual-grid">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>タイムテーブル</h3>
              <p class="subtle">当日にこの画面を見れば流れが追える状態を目指します。</p>
            </div>
            <button class="button button-primary" data-action="open-timeline-modal" data-event-id="${event.id}">追加</button>
          </div>
          <div class="list-stack">
            ${
              runbook.timetable.length
                ? runbook.timetable
                    .slice()
                    .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
                    .map((item) =>
                      renderCompactRow(
                        event.id,
                        item.id,
                        "timeline",
                        item.time || "時刻未設定",
                        `${item.title || "項目未設定"} / ${item.owner || "担当未設定"}`,
                        item.note
                      )
                    )
                    .join("")
                : `<div class="empty-panel small">タイムテーブルはまだありません。</div>`
            }
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>役割分担</h3>
              <p class="subtle">受付、司会、撮影、登壇対応など当日ロールを見える化します。</p>
            </div>
            <button class="button button-primary" data-action="open-role-modal" data-event-id="${event.id}">追加</button>
          </div>
          <div class="list-stack">
            ${
              runbook.roles.length
                ? runbook.roles
                    .map((item) =>
                      renderCompactRow(
                        event.id,
                        item.id,
                        "role",
                        item.role || "役割未設定",
                        item.owner || "担当未設定",
                        item.note
                      )
                    )
                    .join("")
                : `<div class="empty-panel small">役割分担はまだありません。</div>`
            }
          </div>
        </div>
      </div>

      <form class="stack-form" data-form="runbook-notes" data-event-id="${event.id}">
        <div class="section-grid two-column">
          ${renderField("注意事項", `<textarea name="attentionNotes" rows="4">${escapeHtml(runbook.attentionNotes)}</textarea>`)}
          ${renderField("受付メモ", `<textarea name="receptionMemo" rows="4">${escapeHtml(runbook.receptionMemo)}</textarea>`)}
          ${renderField("緊急時メモ", `<textarea name="emergencyMemo" rows="4">${escapeHtml(runbook.emergencyMemo)}</textarea>`)}
          ${renderField(
            "参加者メモ欄の受け皿",
            `<textarea name="participantMemoPlaceholder" rows="4">${escapeHtml(
              runbook.participantMemoPlaceholder
            )}</textarea>`
          )}
        </div>
        <div class="form-actions">
          <button class="button button-primary" type="submit">当日メモを保存</button>
        </div>
      </form>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>当日チェック項目</h3>
            <p class="subtle">簡易チェックリストとして使えます。チェック状態も保存されます。</p>
          </div>
          <div class="inline-actions">
            <button class="button button-ghost" data-action="check-all-items" data-event-id="${event.id}" ${
              runbook.checklist.length ? "" : "disabled"
            }>全て完了</button>
            <button class="button button-ghost" data-action="uncheck-all-items" data-event-id="${event.id}" ${
              runbook.checklist.length ? "" : "disabled"
            }>全解除</button>
            <button class="button button-primary" data-action="open-checklist-modal" data-event-id="${event.id}">追加</button>
          </div>
        </div>
        <div class="checklist">
          ${
            runbook.checklist.length
              ? runbook.checklist
                  .map(
                    (item) => `
                      <div class="check-item">
                        <label class="check-toggle">
                          <input type="checkbox" data-action="toggle-checklist" data-event-id="${event.id}" data-item-id="${item.id}" ${
                            item.checked ? "checked" : ""
                          } />
                          <span>${escapeHtml(item.label)}</span>
                        </label>
                        <div class="inline-actions">
                          <button class="icon-button" data-action="edit-checklist" data-event-id="${event.id}" data-item-id="${item.id}">編集</button>
                          <button class="icon-button danger" data-action="delete-checklist" data-event-id="${event.id}" data-item-id="${item.id}">削除</button>
                        </div>
                      </div>
                    `
                  )
                  .join("")
              : `<div class="empty-panel small">チェック項目はまだありません。</div>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderCompactRow(eventId, itemId, kind, title, subtitle, note) {
  const labels = {
    timeline: "タイムテーブル",
    role: "役割"
  };

  return `
    <article class="compact-row">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(subtitle)}</p>
        <small>${escapeHtml(note || `${labels[kind]}メモなし`)}</small>
      </div>
      <div class="inline-actions">
        <button class="icon-button" data-action="edit-${kind}" data-event-id="${eventId}" data-item-id="${itemId}">編集</button>
        <button class="icon-button danger" data-action="delete-${kind}" data-event-id="${eventId}" data-item-id="${itemId}">削除</button>
      </div>
    </article>
  `;
}

function renderResultTab(event) {
  const result = event.result;
  const participantHub = event.participantHub;
  const followUpParticipants = participantHub.touchedParticipants.filter((item) => item.followUp);
  const resultCompleteness = buildResultCompleteness(event);

  return `
    <form class="stack-form" data-form="result" data-event-id="${event.id}">
      <div class="panel">
        <div class="panel-head compact">
          <h3>振り返り充足度</h3>
          <span class="count-pill">${resultCompleteness.score}/${resultCompleteness.total}</span>
        </div>
        <div class="portfolio-grid">
          ${resultCompleteness.items
            .map(
              (item) => `
                <div class="review-card ${item.filled ? "success" : "warning"}">
                  <h4>${escapeHtml(item.label)}</h4>
                  <strong>${item.filled ? "入力済み" : "未入力"}</strong>
                  <p class="subtle">${escapeHtml(item.detail)}</p>
                </div>
              `
            )
            .join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>終了後記録</h3>
            <p class="subtle">実参加人数や振り返りを残し、必要に応じてイベントを締めます。</p>
          </div>
          <button class="button button-secondary" type="button" data-action="close-event" data-event-id="${event.id}">開催済みにする</button>
        </div>
        <div class="section-grid two-column">
          ${renderField("実参加人数", `<input type="number" min="0" name="attendeeCount" value="${escapeAttr(result.attendeeCount)}" />`)}
          ${renderField("締め日時", `<input value="${escapeAttr(formatDateTime(result.closedAt))}" disabled />`)}
          ${renderField("所感", `<textarea name="impression" rows="4">${escapeHtml(result.impression)}</textarea>`)}
          ${renderField("良かった点", `<textarea name="wentWell" rows="4">${escapeHtml(result.wentWell)}</textarea>`)}
          ${renderField("改善点", `<textarea name="improvements" rows="4">${escapeHtml(result.improvements)}</textarea>`)}
          ${renderField("次回へのメモ", `<textarea name="nextMemo" rows="4">${escapeHtml(result.nextMemo)}</textarea>`)}
          ${renderField(
            "気になった参加者 / 接点メモ",
            `<textarea name="contactNotes" rows="4">${escapeHtml(result.contactNotes)}</textarea>`
          )}
        </div>
        <div class="form-actions">
          <button class="button button-secondary" type="button" data-action="copy-result-summary" data-event-id="${event.id}">共有用コピー</button>
          <button class="button button-primary" type="submit">終了後記録を保存</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>参加者管理の受け皿</h3>
            <p class="subtle">本格CRMにはせず、将来の参加者一覧取り込みに備える薄い構造です。Luma由来の一覧を後で差し込みやすくしてあります。</p>
          </div>
          <button class="button button-primary" type="button" data-action="open-participant-modal" data-event-id="${event.id}">接点メモ追加</button>
        </div>
        <div class="section-grid two-column">
          ${renderField("取り込み状態", `<select name="participantImportStatus">${PARTICIPANT_IMPORT_STATUS_OPTIONS.map(
            (status) => `<option value="${status}" ${participantHub.importStatus === status ? "selected" : ""}>${status}</option>`
          ).join("")}</select>`)}
          ${renderField("チェックイン人数", `<input type="number" min="0" name="participantCheckedInCount" value="${escapeAttr(participantHub.checkedInCount)}" />`)}
          ${renderField(
            "最終取込日時",
            `<input type="datetime-local" name="participantLastImportedAt" step="300" value="${escapeAttr(toDatetimeLocalValue(participantHub.lastImportedAt))}" />`
          )}
          ${renderField("取り込み元", `<input name="participantSource" value="${escapeAttr(participantHub.source)}" />`)}
        </div>
        ${renderField("参加者管理メモ", `<textarea name="participantNotes" rows="4">${escapeHtml(participantHub.notes)}</textarea>`)}
        <div class="participant-list">
          ${
            participantHub.touchedParticipants.length
              ? participantHub.touchedParticipants
                  .map(
                    (item) => `
                      <article class="compact-row">
                        <div>
                          <strong>${escapeHtml(item.name || "名前未設定")}</strong>
                          <p>${escapeHtml(item.handle || "連絡先・属性未記入")}</p>
                          <small>${escapeHtml(item.note || "メモなし")}</small>
                        </div>
                        <div class="inline-actions">
                          ${item.followUp ? `<span class="tag due">次回フォロー</span>` : ""}
                          <button class="icon-button" type="button" data-action="edit-participant" data-event-id="${event.id}" data-item-id="${item.id}">編集</button>
                          <button class="icon-button danger" type="button" data-action="delete-participant" data-event-id="${event.id}" data-item-id="${item.id}">削除</button>
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : `<div class="empty-panel small">接点メモはまだありません。</div>`
          }
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>フォロー候補一覧</h3>
            <p class="subtle">終了後に次回の案内や接点継続をしたい相手だけを抜き出して見られます。本格CRMにはせず、イベントの文脈のまま残します。</p>
          </div>
          <span class="count-pill">${followUpParticipants.length}名</span>
        </div>
        <div class="summary-row">
          <div class="mini-stat"><span>フォロー候補</span><strong>${followUpParticipants.length}</strong></div>
          <div class="mini-stat"><span>取込状態</span><strong>${escapeHtml(participantHub.importStatus || "未準備")}</strong></div>
          <div class="mini-stat"><span>チェックイン</span><strong>${participantHub.checkedInCount || 0}</strong></div>
        </div>
        <div class="participant-list">
          ${
            followUpParticipants.length
              ? followUpParticipants
                  .map(
                    (item) => `
                      <article class="compact-row followup-row">
                        <div>
                          <strong>${escapeHtml(item.name || "名前未設定")}</strong>
                          <p>${escapeHtml(item.handle || "連絡先・属性未記入")}</p>
                          <small>${escapeHtml(item.note || "メモなし")}</small>
                        </div>
                        <div class="inline-actions">
                          <span class="tag due">次回フォロー</span>
                          <button class="icon-button" type="button" data-action="edit-participant" data-event-id="${event.id}" data-item-id="${item.id}">編集</button>
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : `<div class="empty-panel small">フォロー候補はまだありません。接点メモ作成時に「次回フォロー候補」を付けるとここに出ます。</div>`
          }
        </div>
      </div>
    </form>
  `;
}

function renderFinanceTab(event) {
  const finance = calculateFinance(event);
  const unsettledLines = getUnsettledLines(event.finance.lines);
  const settlementSummary = buildSettlementSummary(unsettledLines);
  const variance = buildFinanceVariance(event.finance.lines);
  const categoryBreakdown = buildFinanceCategoryBreakdown(event.finance.lines);
  const financeGaps = buildFinanceGaps(event);
  const filteredLines = getFilteredFinanceLines(event.finance.lines, state.financeFilter);
  const visibleSummary = buildVisibleFinanceSummary(filteredLines);

  return `
    <section class="section-stack">
      <div class="stats-grid">
        <div class="stat-card wide">
          <span>売上予定</span>
          <strong>${formatCurrency(finance.revenuePlan)}</strong>
        </div>
        <div class="stat-card wide">
          <span>売上実績</span>
          <strong>${formatCurrency(finance.revenueActual)}</strong>
        </div>
        <div class="stat-card wide">
          <span>費用予定</span>
          <strong>${formatCurrency(finance.expensePlan)}</strong>
        </div>
        <div class="stat-card wide">
          <span>費用実績</span>
          <strong>${formatCurrency(finance.expenseActual)}</strong>
        </div>
        <div class="stat-card wide emphasis">
          <span>利益</span>
          <strong>${formatCurrency(finance.profitActual)}</strong>
          <small>予定: ${formatCurrency(finance.profitPlan)}</small>
        </div>
        <div class="stat-card wide">
          <span>未精算</span>
          <strong>${unsettledLines.length}件</strong>
          <small>立替の可視化</small>
        </div>
        <div class="stat-card wide ${variance.revenueVariance >= 0 ? "" : "warning-card"}">
          <span>売上差額</span>
          <strong>${formatSignedCurrency(variance.revenueVariance)}</strong>
          <small>実績 - 予定</small>
        </div>
        <div class="stat-card wide ${variance.expenseVariance <= 0 ? "" : "warning-card"}">
          <span>費用差額</span>
          <strong>${formatSignedCurrency(variance.expenseVariance)}</strong>
          <small>実績 - 予定</small>
        </div>
      </div>

      ${
        unsettledLines.length
          ? `
            <div class="panel">
              <div class="panel-head compact">
                <h3>未精算メモ</h3>
                <span class="count-pill">${unsettledLines.length}件</span>
              </div>
              <div class="list-stack">
                ${unsettledLines
                  .map(
                    (line) => `
                      <div class="compact-row compact-warning">
                        <div>
                          <strong>${escapeHtml(line.name)}</strong>
                          <p>${escapeHtml(line.advanceBy || "立替者未設定")} / ${escapeHtml(line.counterparty || "相手先未設定")}</p>
                        </div>
                        <div><strong>${formatCurrency(line.actualAmount || line.plannedAmount)}</strong></div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }

      ${
        settlementSummary.length
          ? `
            <div class="panel">
              <div class="panel-head compact">
                <h3>立替サマリー</h3>
                <span class="count-pill">${settlementSummary.length}名</span>
              </div>
              <div class="settlement-grid">
                ${settlementSummary
                  .map(
                    (item) => `
                      <div class="alert-card">
                        <span>${escapeHtml(item.label)}</span>
                        <strong>${formatCurrency(item.total)}</strong>
                        <small>${item.count}件の未精算</small>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }

      ${
        categoryBreakdown.length
          ? `
            <div class="panel">
              <div class="panel-head compact">
                <h3>カテゴリ内訳</h3>
                <span class="count-pill">${categoryBreakdown.length}分類</span>
              </div>
              <div class="finance-table-wrap">
                <table class="finance-table breakdown-table">
                  <thead>
                    <tr>
                      <th>種別</th>
                      <th>カテゴリ</th>
                      <th>予定</th>
                      <th>実績</th>
                      <th>差額</th>
                      <th>件数</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${categoryBreakdown
                      .map(
                        (item) => `
                          <tr>
                            <td>${escapeHtml(item.type)}</td>
                            <td>${escapeHtml(item.category)}</td>
                            <td>${formatCurrency(item.plannedAmount)}</td>
                            <td>${formatCurrency(item.actualAmount)}</td>
                            <td><span class="variance-pill ${item.variance === 0 ? "" : item.variance > 0 ? "negative" : "positive"}">${formatSignedCurrency(item.variance)}</span></td>
                            <td>${item.count}件</td>
                          </tr>
                        `
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>
          `
          : ""
      }

      <div class="panel">
        <div class="panel-head compact">
          <h3>収支の抜け漏れ確認</h3>
          <span class="count-pill">${financeGaps.issues.length + financeGaps.warnings.length}件</span>
        </div>
        <div class="review-grid">
          <div class="review-card danger">
            <h4>要対応</h4>
            ${
              financeGaps.issues.length
                ? `<ul>${financeGaps.issues.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                : `<p class="subtle">大きな未入力はありません。</p>`
            }
          </div>
          <div class="review-card warning">
            <h4>注意</h4>
            ${
              financeGaps.warnings.length
                ? `<ul>${financeGaps.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                : `<p class="subtle">気になる点はありません。</p>`
            }
          </div>
          <div class="review-card neutral">
            <h4>補足</h4>
            <ul>
              <li>実績未入力 ${financeGaps.missingActualCount}件</li>
              <li>未精算 ${unsettledLines.length}件</li>
              <li>明細 ${event.finance.lines.length}件</li>
            </ul>
          </div>
        </div>
      </div>

      <form class="stack-form" data-form="finance-memo" data-event-id="${event.id}">
        ${renderField("収支メモ", `<textarea name="memo" rows="4">${escapeHtml(event.finance.memo)}</textarea>`)}
        <div class="form-actions">
          <button class="button button-primary" type="submit">収支メモを保存</button>
        </div>
      </form>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>収支明細</h3>
            <p class="subtle">収入 / 支出の明細と、立替・精算状態をイベント内で見通せるようにしています。</p>
          </div>
          <div class="inline-actions">
            <button class="button button-secondary" data-action="export-finance-csv" data-event-id="${event.id}">CSV書き出し</button>
            <button class="button button-primary" data-action="open-finance-modal" data-event-id="${event.id}">明細追加</button>
          </div>
        </div>
        <div class="filter-row">
          ${renderFinanceFilterButton("all", "全件")}
          ${renderFinanceFilterButton("収入", "収入")}
          ${renderFinanceFilterButton("支出", "支出")}
          ${renderFinanceFilterButton("unsettled", "未精算")}
          ${renderFinanceFilterButton("advanced", "立替あり")}
          ${renderFinanceFilterButton("actualMissing", "実績未入力")}
        </div>
        <div class="summary-row">
          <div class="mini-stat"><span>表示件数</span><strong>${visibleSummary.count}</strong></div>
          <div class="mini-stat"><span>予定合計</span><strong>${formatCurrency(visibleSummary.plannedAmount)}</strong></div>
          <div class="mini-stat"><span>実績合計</span><strong>${formatCurrency(visibleSummary.actualAmount)}</strong></div>
        </div>
        <div class="finance-table-wrap">
          ${
            filteredLines.length
              ? `
                <table class="finance-table">
                  <thead>
                    <tr>
                      <th>種別</th>
                      <th>カテゴリ</th>
                      <th>項目名</th>
                      <th>予定</th>
                      <th>実績</th>
                      <th>差額</th>
                      <th>受取先 / 支払先</th>
                      <th>立替</th>
                      <th>精算</th>
                      <th>メモ</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredLines.map((line) => renderFinanceRow(event.id, line)).join("")}
                  </tbody>
                </table>
              `
              : `<div class="empty-panel">この条件に合う収支明細はありません。</div>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderFinanceRow(eventId, line) {
  const variance = Number(line.actualAmount || 0) - Number(line.plannedAmount || 0);

  return `
    <tr class="${line.settlementStatus === "未精算" ? "finance-row-warning" : ""}">
      <td>${escapeHtml(line.type)}</td>
      <td>${escapeHtml(line.category)}</td>
      <td>${escapeHtml(line.name)}</td>
      <td>${formatCurrency(line.plannedAmount)}</td>
      <td>${formatCurrency(line.actualAmount)}</td>
      <td><span class="variance-pill ${variance === 0 ? "" : variance > 0 ? "negative" : "positive"}">${formatSignedCurrency(variance)}</span></td>
      <td>${escapeHtml(line.counterparty || "未設定")}</td>
      <td>${escapeHtml(line.advanceBy || "-")}</td>
      <td><span class="tag ${line.settlementStatus === "未精算" ? "warning" : ""}">${escapeHtml(line.settlementStatus || "未精算")}</span></td>
      <td>${escapeHtml(line.memo || "-")}</td>
      <td>
        <div class="inline-actions">
          <button class="icon-button" data-action="toggle-settlement" data-event-id="${eventId}" data-line-id="${line.id}">${
            line.settlementStatus === "未精算" ? "精算済みにする" : "未精算へ戻す"
          }</button>
          <button class="icon-button" data-action="edit-finance" data-event-id="${eventId}" data-line-id="${line.id}">編集</button>
          <button class="icon-button danger" data-action="delete-finance" data-event-id="${eventId}" data-line-id="${line.id}">削除</button>
        </div>
      </td>
    </tr>
  `;
}

function buildSettlementSummary(unsettledLines) {
  const grouped = unsettledLines.reduce((acc, line) => {
    const label = line.advanceBy || "立替者未設定";
    const amount = Number(line.actualAmount || line.plannedAmount || 0);

    if (!acc[label]) {
      acc[label] = { label, total: 0, count: 0 };
    }

    acc[label].total += amount;
    acc[label].count += 1;
    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => b.total - a.total);
}

function buildFinanceVariance(lines) {
  return lines.reduce(
    (acc, line) => {
      const variance = Number(line.actualAmount || 0) - Number(line.plannedAmount || 0);

      if (line.type === "収入") {
        acc.revenueVariance += variance;
      } else {
        acc.expenseVariance += variance;
      }

      return acc;
    },
    { revenueVariance: 0, expenseVariance: 0 }
  );
}

function buildFinanceCategoryBreakdown(lines) {
  const grouped = lines.reduce((acc, line) => {
    const key = `${line.type}:${line.category}`;

    if (!acc[key]) {
      acc[key] = {
        type: line.type,
        category: line.category || "未分類",
        plannedAmount: 0,
        actualAmount: 0,
        variance: 0,
        count: 0
      };
    }

    acc[key].plannedAmount += Number(line.plannedAmount || 0);
    acc[key].actualAmount += Number(line.actualAmount || 0);
    acc[key].count += 1;
    acc[key].variance = acc[key].actualAmount - acc[key].plannedAmount;
    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => {
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type, "ja");
    }

    return Math.abs(b.actualAmount) - Math.abs(a.actualAmount);
  });
}

function renderFinanceFilterButton(value, label) {
  return `
    <button class="filter-chip ${state.financeFilter === value ? "active" : ""}" data-action="set-finance-filter" data-finance-filter="${escapeAttr(value)}">
      ${escapeHtml(label)}
    </button>
  `;
}

function buildVisibleFinanceSummary(lines) {
  return lines.reduce(
    (acc, line) => {
      acc.count += 1;
      acc.plannedAmount += Number(line.plannedAmount || 0);
      acc.actualAmount += Number(line.actualAmount || 0);
      return acc;
    },
    {
      count: 0,
      plannedAmount: 0,
      actualAmount: 0
    }
  );
}

function buildTimelineChecks(event) {
  const timetable = event.runbook.timetable || [];
  const roles = event.runbook.roles || [];
  const issues = [];
  const warnings = [];
  const timeMap = new Map();
  let missingOwners = 0;

  if (!timetable.length) {
    issues.push("タイムテーブルが未入力です。");
  }

  timetable.forEach((item) => {
    const time = item.time || "";
    const label = item.title || "項目未設定";

    if (!time) {
      issues.push(`${label} の時刻が未入力です。`);
    } else {
      timeMap.set(time, [...(timeMap.get(time) || []), label]);
    }

    if (!item.owner) {
      missingOwners += 1;
      warnings.push(`${label} の担当が未設定です。`);
    }
  });

  timeMap.forEach((labels, time) => {
    if (labels.length > 1) {
      warnings.push(`${time} に ${labels.length} 件の項目があります。重複確認をおすすめします。`);
    }
  });

  const unownedRoles = roles.filter((item) => !item.owner);
  if (roles.length === 0) {
    issues.push("当日役割が未入力です。");
  } else if (unownedRoles.length) {
    warnings.push(`役割 ${unownedRoles.length} 件で担当が未設定です。`);
  }

  if (!event.runbook.checklist.length) {
    warnings.push("当日チェック項目が未入力です。");
  }

  return {
    issues: [...new Set(issues)],
    warnings: [...new Set(warnings)].slice(0, 6),
    missingOwners
  };
}

function buildRunbookShareText(event) {
  const runbook = event.runbook;
  const timetableLines = runbook.timetable
    .slice()
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
    .map((item) => `- ${item.time || "--:--"} ${item.title || "項目未設定"} / ${item.owner || "担当未設定"} ${item.note ? `(${item.note})` : ""}`);
  const roleLines = runbook.roles.map((item) => `- ${item.role || "役割未設定"}: ${item.owner || "担当未設定"} ${item.note ? `(${item.note})` : ""}`);
  const checklistLines = runbook.checklist.map((item) => `- [${item.checked ? "x" : " "}] ${item.label}`);

  return [
    `${event.name || "イベント"} 当日共有`,
    `開催: ${formatDateTime(event.startsAt)}`,
    `会場: ${event.venue || "未設定"}`,
    "",
    "タイムテーブル",
    ...(timetableLines.length ? timetableLines : ["- 未設定"]),
    "",
    "役割分担",
    ...(roleLines.length ? roleLines : ["- 未設定"]),
    "",
    "注意事項",
    runbook.attentionNotes || "未設定",
    "",
    "受付メモ",
    runbook.receptionMemo || "未設定",
    "",
    "緊急時メモ",
    runbook.emergencyMemo || "未設定",
    "",
    "チェック項目",
    ...(checklistLines.length ? checklistLines : ["- 未設定"])
  ].join("\n");
}

function exportFinanceCsv(event) {
  const header = [
    "種別",
    "カテゴリ",
    "項目名",
    "予定金額",
    "実績金額",
    "差額",
    "受取先/支払先",
    "立替者",
    "精算状態",
    "メモ"
  ];
  const rows = event.finance.lines.map((line) => [
    line.type,
    line.category,
    line.name,
    line.plannedAmount,
    line.actualAmount,
    Number(line.actualAmount || 0) - Number(line.plannedAmount || 0),
    line.counterparty || "",
    line.advanceBy || "",
    line.settlementStatus || "",
    line.memo || ""
  ]);
  const csv = [header, ...rows].map((row) => row.map(toCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const slug = (event.name || "event-finance").replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, "_");

  link.href = url;
  link.download = `${slug}-finance.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsvCell(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function buildResultShareText(event) {
  const followUpParticipants = event.participantHub.touchedParticipants.filter((item) => item.followUp);

  return [
    `${event.name || "イベント"} 終了後サマリー`,
    `開催: ${formatDateTime(event.startsAt)}`,
    `会場: ${event.venue || "未設定"}`,
    `実参加人数: ${event.result.attendeeCount || "未入力"}`,
    "",
    "所感",
    event.result.impression || "未入力",
    "",
    "良かった点",
    event.result.wentWell || "未入力",
    "",
    "改善点",
    event.result.improvements || "未入力",
    "",
    "次回へのメモ",
    event.result.nextMemo || "未入力",
    "",
    "フォロー候補",
    ...(followUpParticipants.length
      ? followUpParticipants.map((item) => `- ${item.name || "名前未設定"} ${item.handle ? `(${item.handle})` : ""} ${item.note ? `: ${item.note}` : ""}`)
      : ["- なし"])
  ].join("\n");
}

function renderEmptyState() {
  return `
    <div class="empty-view">
      <h2>イベントがまだありません</h2>
      <p class="subtle">左の「新規イベント」から1件作ると、準備・当日・終了後・収支まで一通り触れます。</p>
    </div>
  `;
}

function renderField(label, inputHtml) {
  return `
    <label class="field">
      <span>${label}</span>
      ${inputHtml}
    </label>
  `;
}

function formatShortUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const pathLabel = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.host}${pathLabel}`.slice(0, 64);
  } catch {
    return String(value);
  }
}

function renderModal() {
  const modal = state.modal;
  const event = modal.eventId ? state.events.find((item) => item.id === modal.eventId) : null;

  return `
    <div class="modal-backdrop">
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="panel-head">
          <div>
            <h3>${escapeHtml(getModalTitle(modal))}</h3>
            <p class="subtle">${escapeHtml(getModalSubtitle(modal))}</p>
          </div>
          <button class="icon-button" data-action="close-modal">閉じる</button>
        </div>
        ${renderModalBody(modal, event)}
      </div>
    </div>
  `;
}

function getModalTitle(modal) {
  const titles = {
    "create-event": "新規イベント",
    task: modal.mode === "edit" ? "タスク編集" : "タスク追加",
    timeline: modal.mode === "edit" ? "タイムテーブル編集" : "タイムテーブル追加",
    role: modal.mode === "edit" ? "役割編集" : "役割追加",
    checklist: modal.mode === "edit" ? "チェック項目編集" : "チェック項目追加",
    finance: modal.mode === "edit" ? "収支明細編集" : "収支明細追加",
    participant: modal.mode === "edit" ? "接点メモ編集" : "接点メモ追加",
    asset: modal.mode === "edit" ? "画像リンク編集" : "画像リンク追加"
  };

  return titles[modal.kind] || "編集";
}

function getModalSubtitle(modal) {
  const subtitles = {
    "create-event": "イベント作成時にテンプレタスクも自動生成できます。",
    task: "準備や終了後対応のタスクを管理します。",
    timeline: "当日のタイムラインを残します。",
    role: "当日の役割分担を明文化します。",
    checklist: "当日チェック用の簡易項目です。",
    finance: "立替と精算状態まで見える明細を残します。",
    participant: "将来の参加者一覧取り込みに備えた軽い接点メモです。",
    asset: "画像自体は Google Drive に置き、このイベントには参照リンクだけを残します。"
  };

  return subtitles[modal.kind] || "";
}

function renderModalBody(modal, event) {
  if (modal.kind === "create-event") {
    return `
      <form class="stack-form" data-form="create-event">
        <div class="section-grid two-column">
          ${renderField(
            "イベントテンプレ",
            `<select name="templateId">${EVENT_TEMPLATES.map(
              (template) => `<option value="${template.id}">${template.label}</option>`
            ).join("")}</select>`
          )}
          ${renderField("イベント名", `<input name="name" required />`)}
          ${renderField("開催日時", `<input type="datetime-local" name="startsAt" step="300" />`)}
          ${renderField("会場", `<input name="venue" />`)}
          ${renderField(
            "ステータス",
            `<select name="status">${EVENT_STATUS_OPTIONS.map((status) => `<option value="${status}">${status}</option>`).join("")}</select>`
          )}
          ${renderField("主催 / 担当", `<input name="owners" />`)}
          ${renderField("Luma URL", `<input type="url" name="lumaUrl" placeholder="https://lu.ma/..." />`)}
          ${renderField(
            "Luma状態",
            `<select name="lumaStatus">${LUMA_STATUS_OPTIONS.map((status) => `<option value="${status}">${status}</option>`).join("")}</select>`
          )}
          ${renderField("申込数メモ", `<input type="number" min="0" name="lumaRegistrationCount" />`)}
          ${renderField("テーマ", `<input name="theme" />`)}
          ${renderField("登壇者", `<input name="speakers" />`)}
        </div>
        <div class="template-help">
          ${EVENT_TEMPLATES.map(
            (template) => `
              <div class="template-help-card">
                <strong>${escapeHtml(template.label)}</strong>
                <p>${escapeHtml(template.description)}</p>
              </div>
            `
          ).join("")}
        </div>
        ${renderField("概要", `<textarea name="summary" rows="4"></textarea>`)}
        ${renderField("備考", `<textarea name="notes" rows="4"></textarea>`)}
        <label class="check-toggle simple">
          <input type="checkbox" name="withTemplateTasks" checked />
          <span>初期テンプレタスクを入れる</span>
        </label>
        <div class="form-actions">
          <button class="button button-primary" type="submit">イベントを作成</button>
        </div>
      </form>
    `;
  }

  const item = findModalItem(modal, event);

  if (modal.kind === "task") {
    return `
      <form class="stack-form" data-form="task" data-event-id="${modal.eventId}" data-mode="${modal.mode}" data-item-id="${item?.id || ""}">
        ${renderField("タスク名", `<input name="title" value="${escapeAttr(item?.title || "")}" required />`)}
        <div class="section-grid two-column">
          ${renderField("担当者", `<input name="assignee" value="${escapeAttr(item?.assignee || "")}" />`)}
          ${renderField("期限", `<input type="date" name="dueDate" value="${escapeAttr(item?.dueDate || "")}" />`)}
          ${renderField(
            "ステータス",
            `<select name="status">${TASK_STATUS_OPTIONS.map(
              (status) =>
                `<option value="${status}" ${(item?.status || "未着手") === status ? "selected" : ""}>${status}</option>`
            ).join("")}</select>`
          )}
          ${renderField(
            "カテゴリ",
            `<select name="category">${TASK_CATEGORY_OPTIONS.map(
              (category) =>
                `<option value="${category}" ${(item?.category || "会場") === category ? "selected" : ""}>${category}</option>`
            ).join("")}</select>`
          )}
        </div>
        ${renderField("メモ", `<textarea name="memo" rows="4">${escapeHtml(item?.memo || "")}</textarea>`)}
        <div class="form-actions">
          <button class="button button-primary" type="submit">${modal.mode === "edit" ? "更新" : "追加"}</button>
        </div>
      </form>
    `;
  }

  if (modal.kind === "timeline") {
    return `
      <form class="stack-form" data-form="timeline" data-event-id="${modal.eventId}" data-mode="${modal.mode}" data-item-id="${item?.id || ""}">
        <div class="section-grid two-column">
          ${renderField("時刻", `<input type="time" name="time" step="300" value="${escapeAttr(item?.time || "")}" />`)}
          ${renderField("項目名", `<input name="title" value="${escapeAttr(item?.title || "")}" required />`)}
          ${renderField("担当", `<input name="owner" value="${escapeAttr(item?.owner || "")}" />`)}
          ${renderField("メモ", `<input name="note" value="${escapeAttr(item?.note || "")}" />`)}
        </div>
        <div class="form-actions">
          <button class="button button-primary" type="submit">${modal.mode === "edit" ? "更新" : "追加"}</button>
        </div>
      </form>
    `;
  }

  if (modal.kind === "role") {
    return `
      <form class="stack-form" data-form="role" data-event-id="${modal.eventId}" data-mode="${modal.mode}" data-item-id="${item?.id || ""}">
        <div class="section-grid two-column">
          ${renderField("役割", `<input name="role" value="${escapeAttr(item?.role || "")}" required />`)}
          ${renderField("担当", `<input name="owner" value="${escapeAttr(item?.owner || "")}" />`)}
        </div>
        ${renderField("メモ", `<textarea name="note" rows="4">${escapeHtml(item?.note || "")}</textarea>`)}
        <div class="form-actions">
          <button class="button button-primary" type="submit">${modal.mode === "edit" ? "更新" : "追加"}</button>
        </div>
      </form>
    `;
  }

  if (modal.kind === "checklist") {
    return `
      <form class="stack-form" data-form="checklist" data-event-id="${modal.eventId}" data-mode="${modal.mode}" data-item-id="${item?.id || ""}">
        ${renderField("チェック項目", `<input name="label" value="${escapeAttr(item?.label || "")}" required />`)}
        ${renderField("メモ", `<textarea name="note" rows="4">${escapeHtml(item?.note || "")}</textarea>`)}
        <label class="check-toggle simple">
          <input type="checkbox" name="checked" ${item?.checked ? "checked" : ""} />
          <span>完了済みとして保存</span>
        </label>
        <div class="form-actions">
          <button class="button button-primary" type="submit">${modal.mode === "edit" ? "更新" : "追加"}</button>
        </div>
      </form>
    `;
  }

  if (modal.kind === "finance") {
    const currentType = item?.type || "支出";
    const categories = FINANCE_CATEGORIES[currentType];
    return `
      <form class="stack-form" data-form="finance" data-event-id="${modal.eventId}" data-mode="${modal.mode}" data-item-id="${item?.id || ""}">
        <div class="section-grid two-column">
          ${renderField(
            "種別",
            `<select name="type" data-role="finance-type">${FINANCE_TYPE_OPTIONS.map(
              (type) => `<option value="${type}" ${currentType === type ? "selected" : ""}>${type}</option>`
            ).join("")}</select>`
          )}
          ${renderField(
            "カテゴリ",
            `<select name="category">${categories
              .map(
                (category) =>
                  `<option value="${category}" ${(item?.category || categories[0]) === category ? "selected" : ""}>${category}</option>`
              )
              .join("")}</select>`
          )}
          ${renderField("項目名", `<input name="name" value="${escapeAttr(item?.name || "")}" required />`)}
          ${renderField("受取先 / 支払先", `<input name="counterparty" value="${escapeAttr(item?.counterparty || "")}" />`)}
          ${renderField("予定金額", `<input type="number" name="plannedAmount" value="${escapeAttr(item?.plannedAmount || "")}" min="0" step="1" />`)}
          ${renderField("実績金額", `<input type="number" name="actualAmount" value="${escapeAttr(item?.actualAmount || "")}" min="0" step="1" />`)}
          ${renderField("立替者", `<input name="advanceBy" value="${escapeAttr(item?.advanceBy || "")}" />`)}
          ${renderField(
            "精算状態",
            `<select name="settlementStatus">${SETTLEMENT_STATUS_OPTIONS.map(
              (status) =>
                `<option value="${status}" ${(item?.settlementStatus || "未精算") === status ? "selected" : ""}>${status}</option>`
            ).join("")}</select>`
          )}
        </div>
        ${renderField("メモ", `<textarea name="memo" rows="4">${escapeHtml(item?.memo || "")}</textarea>`)}
        <div class="form-actions">
          <button class="button button-primary" type="submit">${modal.mode === "edit" ? "更新" : "追加"}</button>
        </div>
      </form>
    `;
  }

  if (modal.kind === "participant") {
    return `
      <form class="stack-form" data-form="participant" data-event-id="${modal.eventId}" data-mode="${modal.mode}" data-item-id="${item?.id || ""}">
        <div class="section-grid two-column">
          ${renderField("名前", `<input name="name" value="${escapeAttr(item?.name || "")}" required />`)}
          ${renderField("連絡先 / 属性", `<input name="handle" value="${escapeAttr(item?.handle || "")}" placeholder="@handle / 登壇候補 など" />`)}
        </div>
        ${renderField("メモ", `<textarea name="note" rows="4">${escapeHtml(item?.note || "")}</textarea>`)}
        <label class="check-toggle simple">
          <input type="checkbox" name="followUp" ${item?.followUp ? "checked" : ""} />
          <span>次回フォロー候補として残す</span>
        </label>
        <div class="form-actions">
          <button class="button button-primary" type="submit">${modal.mode === "edit" ? "更新" : "追加"}</button>
        </div>
      </form>
    `;
  }

  if (modal.kind === "asset") {
    return `
      <form class="stack-form" data-form="asset" data-event-id="${modal.eventId}" data-mode="${modal.mode}" data-item-id="${item?.id || ""}">
        ${renderField("画像リンク名", `<input name="label" value="${escapeAttr(item?.label || "")}" required />`)}
        ${renderField("画像URL", `<input type="url" name="url" value="${escapeAttr(item?.url || "")}" placeholder="https://drive.google.com/..." required />`)}
        ${renderField("メモ", `<textarea name="note" rows="4">${escapeHtml(item?.note || "")}</textarea>`)}
        <div class="form-actions">
          <button class="button button-primary" type="submit">${modal.mode === "edit" ? "更新" : "追加"}</button>
        </div>
      </form>
    `;
  }

  return "";
}

function findModalItem(modal, event) {
  if (!event || !modal.itemId) {
    return null;
  }

  if (modal.kind === "task") {
    return event.tasks.find((task) => task.id === modal.itemId) || null;
  }

  if (modal.kind === "timeline") {
    return event.runbook.timetable.find((item) => item.id === modal.itemId) || null;
  }

  if (modal.kind === "role") {
    return event.runbook.roles.find((item) => item.id === modal.itemId) || null;
  }

  if (modal.kind === "checklist") {
    return event.runbook.checklist.find((item) => item.id === modal.itemId) || null;
  }

  if (modal.kind === "finance") {
    return event.finance.lines.find((item) => item.id === modal.itemId) || null;
  }

  if (modal.kind === "participant") {
    return event.participantHub.touchedParticipants.find((item) => item.id === modal.itemId) || null;
  }

  if (modal.kind === "asset") {
    return event.assetArchive.images.find((item) => item.id === modal.itemId) || null;
  }

  return null;
}

async function syncEvents() {
  queuedSnapshot = cloneEventsSnapshot(state.events);

  if (saveInFlight) {
    state.saveState = "saving";
    render();
    return;
  }

  saveInFlight = true;
  state.saveState = "saving";
  render();

  while (queuedSnapshot) {
    const snapshot = queuedSnapshot;
    queuedSnapshot = null;

    try {
      const saved = await saveEvents(snapshot);
      state.events = saved.sort(sortEvents);
      persistedEvents = cloneEventsSnapshot(saved);
      ensureSelectedEvent();
      writeLocalBackup(saved);
      state.saveState = "saved";
      state.lastSavedAt = new Date().toISOString();
      state.error = "";
    } catch (error) {
      console.error(error);
      state.events = cloneEventsSnapshot(persistedEvents);
      ensureSelectedEvent();
      queuedSnapshot = null;
      state.saveState = "error";
      state.error = error?.message?.includes("他の端末の更新")
        ? "別の端末の更新が先に保存されたため、最後に保存できた状態へ戻しました。画面を開き直してから、必要な変更を反映してください。"
        : `${error?.message || "保存に失敗しました。"} 最後に保存できた状態へ戻しました。`;
      break;
    }

    render();
  }

  saveInFlight = false;
  render();
}

function cloneEvent(sourceEvent) {
  const cloned = structuredClone(normalizeEvent(sourceEvent));
  const next = createEmptyEvent({
    withTemplateTasks: false,
    templateId: cloned.templateId || "custom"
  });

  next.name = `${cloned.name || "イベント"} コピー`;
  next.startsAt = cloned.startsAt;
  next.venue = cloned.venue;
  next.status = "企画中";
  next.summary = cloned.summary;
  next.theme = cloned.theme;
  next.speakers = cloned.speakers;
  next.owners = cloned.owners;
  next.lumaUrl = "";
  next.lumaStatus = "未着手";
  next.lumaRegistrationCount = "";
  next.lumaCheckedAt = "";
  next.lumaNotes = cloned.lumaNotes;
  next.notes = cloned.notes;
  next.assetArchive = {
    driveFolderUrl: "",
    notes: "",
    images: []
  };
  next.tasks = cloned.tasks.map((task) => ({
    ...task,
    id: createId("task"),
    status: task.status === "完了" ? "未着手" : task.status
  }));
  next.runbook = {
    ...cloned.runbook,
    timetable: cloned.runbook.timetable.map((item) => ({ ...item, id: createId("time") })),
    roles: cloned.runbook.roles.map((item) => ({ ...item, id: createId("role") })),
    checklist: cloned.runbook.checklist.map((item) => ({ ...item, id: createId("check"), checked: false }))
  };
  next.result = {
    attendeeCount: "",
    impression: "",
    wentWell: "",
    improvements: "",
    nextMemo: cloned.result.nextMemo,
    contactNotes: "",
    closedAt: ""
  };
  next.participantHub = {
    ...cloned.participantHub,
    importStatus: "未準備",
    checkedInCount: "",
    lastImportedAt: "",
    touchedParticipants: []
  };
  next.finance = {
    ...cloned.finance,
    lines: cloned.finance.lines.map((line) => ({
      ...line,
      id: createId("line"),
      actualAmount: 0,
      settlementStatus: "未精算"
    }))
  };

  return touchEvent(next);
}

async function updateEvent(eventId, updater) {
  state.events = state.events
    .map((event) => {
      if (event.id !== eventId) {
        return event;
      }

      return touchEvent(normalizeEvent(updater(normalizeEvent(event))));
    })
    .sort(sortEvents);

  ensureSelectedEvent();
  render();
  await syncEvents();
}

function openModal(kind, payload = {}) {
  state.modal = { kind, mode: "create", ...payload };
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

function showUiError(message) {
  state.error = message;
  render();
}

async function createEventFromForm(formData) {
  const templateId = String(formData.get("templateId") || "custom");
  const event = createEmptyEvent({
    withTemplateTasks: formData.get("withTemplateTasks") === "on",
    templateId
  });

  event.name = String(formData.get("name") || "");
  event.startsAt = String(formData.get("startsAt") || "");
  event.venue = String(formData.get("venue") || "");
  event.status = String(formData.get("status") || "企画中");
  event.owners = String(formData.get("owners") || "");
  event.lumaUrl = String(formData.get("lumaUrl") || "");
  event.lumaStatus = String(formData.get("lumaStatus") || "未着手");
  event.lumaRegistrationCount = String(formData.get("lumaRegistrationCount") || "");
  event.templateId = templateId;
  event.theme = String(formData.get("theme") || "");
  event.speakers = String(formData.get("speakers") || "");
  event.summary = String(formData.get("summary") || "");
  event.notes = String(formData.get("notes") || "");

  try {
    validateEventCore(event);
  } catch (error) {
    showUiError(error.message);
    return;
  }

  state.events = [touchEvent(event), ...state.events].sort(sortEvents);
  state.selectedEventId = event.id;
  state.activeView = "detail";
  state.activeTab = "基本情報";
  state.modal = null;
  render();
  await syncEvents();
}

async function handleBasicInfoSubmit(form) {
  const formData = new FormData(form);
  const eventId = form.dataset.eventId;
  const payload = {
    name: String(formData.get("name") || ""),
    startsAt: String(formData.get("startsAt") || ""),
    venue: String(formData.get("venue") || ""),
    status: String(formData.get("status") || "企画中"),
    theme: String(formData.get("theme") || ""),
    speakers: String(formData.get("speakers") || ""),
    owners: String(formData.get("owners") || ""),
    lumaUrl: String(formData.get("lumaUrl") || ""),
    lumaStatus: String(formData.get("lumaStatus") || "未着手"),
    lumaRegistrationCount: String(formData.get("lumaRegistrationCount") || ""),
    lumaCheckedAt: String(formData.get("lumaCheckedAt") || ""),
    lumaNotes: String(formData.get("lumaNotes") || ""),
    summary: String(formData.get("summary") || ""),
    notes: String(formData.get("notes") || "")
  };
  const assetArchivePatch = {
    driveFolderUrl: String(formData.get("imageDriveFolderUrl") || ""),
    notes: String(formData.get("imageArchiveNotes") || "")
  };

  try {
    validateEventCore(payload);
  } catch (error) {
    showUiError(error.message);
    return;
  }

  await updateEvent(eventId, (event) => ({
    ...event,
    ...payload,
    assetArchive: {
      ...event.assetArchive,
      ...assetArchivePatch
    }
  }));
}

async function handleRunbookNotesSubmit(form) {
  const formData = new FormData(form);
  await updateEvent(form.dataset.eventId, (event) => ({
    ...event,
    runbook: {
      ...event.runbook,
      attentionNotes: String(formData.get("attentionNotes") || ""),
      receptionMemo: String(formData.get("receptionMemo") || ""),
      emergencyMemo: String(formData.get("emergencyMemo") || ""),
      participantMemoPlaceholder: String(formData.get("participantMemoPlaceholder") || "")
    }
  }));
}

async function handleResultSubmit(form) {
  const formData = new FormData(form);
  await updateEvent(form.dataset.eventId, (event) => ({
    ...event,
    result: {
      ...event.result,
      attendeeCount: String(formData.get("attendeeCount") || ""),
      impression: String(formData.get("impression") || ""),
      wentWell: String(formData.get("wentWell") || ""),
      improvements: String(formData.get("improvements") || ""),
      nextMemo: String(formData.get("nextMemo") || ""),
      contactNotes: String(formData.get("contactNotes") || "")
    },
    participantHub: {
      ...event.participantHub,
      importStatus: String(formData.get("participantImportStatus") || "未準備"),
      checkedInCount: String(formData.get("participantCheckedInCount") || ""),
      lastImportedAt: String(formData.get("participantLastImportedAt") || ""),
      source: String(formData.get("participantSource") || "Luma"),
      notes: String(formData.get("participantNotes") || "")
    }
  }));
}

async function handleFinanceMemoSubmit(form) {
  const formData = new FormData(form);
  await updateEvent(form.dataset.eventId, (event) => ({
    ...event,
    finance: {
      ...event.finance,
      memo: String(formData.get("memo") || "")
    }
  }));
}

async function handleEntitySubmit(form, kind) {
  const formData = new FormData(form);
  const eventId = form.dataset.eventId;
  const mode = form.dataset.mode;
  const itemId = form.dataset.itemId;
  let draft = null;

  try {
    if (kind === "task") {
      draft = {
        title: String(formData.get("title") || ""),
        assignee: String(formData.get("assignee") || ""),
        dueDate: String(formData.get("dueDate") || ""),
        status: String(formData.get("status") || "未着手"),
        memo: String(formData.get("memo") || ""),
        category: String(formData.get("category") || "会場")
      };
    }

    if (kind === "timeline") {
      draft = {
        time: String(formData.get("time") || ""),
        title: String(formData.get("title") || ""),
        owner: String(formData.get("owner") || ""),
        note: String(formData.get("note") || "")
      };
    }

    if (kind === "role") {
      draft = {
        role: String(formData.get("role") || ""),
        owner: String(formData.get("owner") || ""),
        note: String(formData.get("note") || "")
      };
    }

    if (kind === "checklist") {
      draft = {
        label: String(formData.get("label") || ""),
        note: String(formData.get("note") || ""),
        checked: formData.get("checked") === "on"
      };
    }

    if (kind === "finance") {
      draft = {
        type: String(formData.get("type") || "支出"),
        category: String(formData.get("category") || ""),
        name: String(formData.get("name") || ""),
        plannedAmount: parseFinanceAmount(formData.get("plannedAmount") || 0),
        actualAmount: parseFinanceAmount(formData.get("actualAmount") || 0),
        counterparty: String(formData.get("counterparty") || ""),
        advanceBy: String(formData.get("advanceBy") || ""),
        settlementStatus: String(formData.get("settlementStatus") || "未精算"),
        memo: String(formData.get("memo") || "")
      };
    }

    if (kind === "participant") {
      draft = {
        name: String(formData.get("name") || ""),
        handle: String(formData.get("handle") || ""),
        note: String(formData.get("note") || ""),
        followUp: formData.get("followUp") === "on"
      };
    }

    if (kind === "asset") {
      draft = {
        label: String(formData.get("label") || ""),
        url: String(formData.get("url") || ""),
        note: String(formData.get("note") || "")
      };
    }

    validateEntity(kind, draft || {});
  } catch (error) {
    showUiError(error.message);
    return;
  }

  await updateEvent(eventId, (event) => {
    const nextEvent = { ...event };

    if (kind === "task") {
      const nextTask = {
        id: itemId || createId("task"),
        ...draft
      };
      nextEvent.tasks =
        mode === "edit"
          ? event.tasks.map((task) => (task.id === itemId ? nextTask : task))
          : [...event.tasks, nextTask];
    }

    if (kind === "timeline") {
      const nextItem = {
        id: itemId || createId("time"),
        ...draft
      };
      nextEvent.runbook = {
        ...event.runbook,
        timetable:
          mode === "edit"
            ? event.runbook.timetable.map((item) => (item.id === itemId ? nextItem : item))
            : [...event.runbook.timetable, nextItem]
      };
    }

    if (kind === "role") {
      const nextItem = {
        id: itemId || createId("role"),
        ...draft
      };
      nextEvent.runbook = {
        ...event.runbook,
        roles:
          mode === "edit"
            ? event.runbook.roles.map((item) => (item.id === itemId ? nextItem : item))
            : [...event.runbook.roles, nextItem]
      };
    }

    if (kind === "checklist") {
      const nextItem = {
        id: itemId || createId("check"),
        ...draft
      };
      nextEvent.runbook = {
        ...event.runbook,
        checklist:
          mode === "edit"
            ? event.runbook.checklist.map((item) => (item.id === itemId ? nextItem : item))
            : [...event.runbook.checklist, nextItem]
      };
    }

    if (kind === "finance") {
      const nextItem = {
        id: itemId || createId("line"),
        ...draft
      };
      nextEvent.finance = {
        ...event.finance,
        lines:
          mode === "edit"
            ? event.finance.lines.map((item) => (item.id === itemId ? nextItem : item))
            : [...event.finance.lines, nextItem]
      };
    }

    if (kind === "participant") {
      const nextItem = {
        id: itemId || createId("participant"),
        ...draft
      };
      nextEvent.participantHub = {
        ...event.participantHub,
        touchedParticipants:
          mode === "edit"
            ? event.participantHub.touchedParticipants.map((item) => (item.id === itemId ? nextItem : item))
            : [...event.participantHub.touchedParticipants, nextItem]
      };
    }

    if (kind === "asset") {
      const nextItem = {
        id: itemId || createId("asset"),
        ...draft
      };
      nextEvent.assetArchive = {
        ...event.assetArchive,
        images:
          mode === "edit"
            ? event.assetArchive.images.map((item) => (item.id === itemId ? nextItem : item))
            : [...event.assetArchive.images, nextItem]
      };
    }

    return nextEvent;
  });

  state.modal = null;
  render();
}

async function handleDelete(kind, eventId, itemId) {
  await updateEvent(eventId, (event) => {
    if (kind === "task") {
      return { ...event, tasks: event.tasks.filter((task) => task.id !== itemId) };
    }

    if (kind === "timeline") {
      return {
        ...event,
        runbook: {
          ...event.runbook,
          timetable: event.runbook.timetable.filter((item) => item.id !== itemId)
        }
      };
    }

    if (kind === "role") {
      return {
        ...event,
        runbook: {
          ...event.runbook,
          roles: event.runbook.roles.filter((item) => item.id !== itemId)
        }
      };
    }

    if (kind === "checklist") {
      return {
        ...event,
        runbook: {
          ...event.runbook,
          checklist: event.runbook.checklist.filter((item) => item.id !== itemId)
        }
      };
    }

    if (kind === "finance") {
      return {
        ...event,
        finance: {
          ...event.finance,
          lines: event.finance.lines.filter((item) => item.id !== itemId)
        }
      };
    }

    if (kind === "participant") {
      return {
        ...event,
        participantHub: {
          ...event.participantHub,
          touchedParticipants: event.participantHub.touchedParticipants.filter((item) => item.id !== itemId)
        }
      };
    }

    if (kind === "asset") {
      return {
        ...event,
        assetArchive: {
          ...event.assetArchive,
          images: event.assetArchive.images.filter((item) => item.id !== itemId)
        }
      };
    }

    return event;
  });
}

document.addEventListener("click", async (event) => {
  if (event.target.classList?.contains("modal-backdrop")) {
    closeModal();
    return;
  }

  const button = event.target.closest("[data-action]");

  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const eventId = button.dataset.eventId;
  const itemId = button.dataset.itemId;

  if (action === "sign-in-google") {
    try {
      state.error = "";
      render();
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
      state.error = error.message || "Google ログインに失敗しました。";
      render();
    }
    return;
  }

  if (action === "sign-out") {
    try {
      await signOutStorage();
      state.error = "";
    } catch (error) {
      console.error(error);
      state.error = "ログアウトに失敗しました。";
      render();
    }
    return;
  }

  if (action === "open-create-event") {
    state.mobileSidebarOpen = false;
    openModal("create-event");
    return;
  }

  if (action === "set-view") {
    state.activeView = button.dataset.view || "dashboard";
    state.mobileSidebarOpen = false;
    render();
    return;
  }

  if (action === "open-mobile-sidebar") {
    state.mobileSidebarOpen = true;
    render();
    return;
  }

  if (action === "close-mobile-sidebar") {
    state.mobileSidebarOpen = false;
    render();
    return;
  }

  if (action === "close-modal") {
    closeModal();
    return;
  }

  if (action === "reset-sample") {
    if (!window.confirm("現在のデータファイルをサンプル状態に戻しますか？")) {
      return;
    }

    try {
      state.isLoading = true;
      render();
      applyLoadedEvents(await resetEvents());
      state.activeTab = "基本情報";
      state.modal = null;
      state.mobileSidebarOpen = false;
      state.error = "";
      state.saveState = "saved";
      state.lastSavedAt = new Date().toISOString();
    } catch (error) {
      console.error(error);
      state.error = "サンプルデータの復元に失敗しました。";
    } finally {
      state.isLoading = false;
      render();
    }
    return;
  }

  if (action === "set-filter") {
    state.filter = button.dataset.filter || "all";
    render();
    return;
  }

  if (action === "set-event-stage") {
    state.eventStageFilter = button.dataset.stage || "進行中";
    render();
    return;
  }

  if (action === "set-task-board-filter") {
    state.taskBoardFilter = button.dataset.taskFilter || "open";
    render();
    return;
  }

  if (action === "toggle-attention-only") {
    state.attentionOnly = !state.attentionOnly;
    render();
    return;
  }

  if (action === "set-prep-filter") {
    state.prepFilter = button.dataset.prepFilter || "all";
    render();
    return;
  }

  if (action === "set-finance-filter") {
    state.financeFilter = button.dataset.financeFilter || "all";
    render();
    return;
  }

  if (action === "select-event") {
    if (!eventId) {
      return;
    }
    state.selectedEventId = eventId;
    state.mobileSidebarOpen = false;
    render();
    return;
  }

  if (action === "open-event-detail") {
    if (!eventId) {
      return;
    }
    state.selectedEventId = eventId;
    state.activeView = "detail";
    state.mobileSidebarOpen = false;
    render();
    return;
  }

  if (action === "set-tab") {
    state.activeTab = button.dataset.tab || "基本情報";
    render();
    return;
  }

  if (action === "delete-event") {
    if (!window.confirm("このイベントを削除しますか？ サンプルイベントでも削除できます。")) {
      return;
    }

    state.events = state.events.filter((item) => item.id !== eventId).sort(sortEvents);
    ensureSelectedEvent();
    state.mobileSidebarOpen = false;
    render();
    await syncEvents();
    return;
  }

  if (action === "set-status") {
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      status: button.dataset.status || eventItem.status
    }));
    return;
  }

  if (action === "duplicate-event") {
    const source = state.events.find((item) => item.id === eventId);

    if (!source) {
      return;
    }

    const duplicated = cloneEvent(source);
    state.events = [duplicated, ...state.events].sort(sortEvents);
    state.selectedEventId = duplicated.id;
    state.activeTab = "基本情報";
    state.mobileSidebarOpen = false;
    render();
    await syncEvents();
    return;
  }

  if (action === "seed-tasks") {
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      tasks: [...eventItem.tasks, ...createDefaultTasks()]
    }));
    return;
  }

  if (action === "mark-task-done") {
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      tasks: eventItem.tasks.map((task) => (task.id === button.dataset.taskId ? { ...task, status: "完了" } : task))
    }));
    return;
  }

  if (action === "bulk-update-prep-status") {
    const nextStatus = button.dataset.status || "未着手";
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      tasks: eventItem.tasks.map((task) =>
        matchesCurrentPrepFilters(task)
          ? {
              ...task,
              status: nextStatus
            }
          : task
      )
    }));
    return;
  }

  if (action === "open-task-modal") {
    openModal("task", { eventId });
    return;
  }

  if (action === "edit-task") {
    openModal("task", { eventId, itemId: button.dataset.taskId || itemId, mode: "edit" });
    return;
  }

  if (action === "delete-task") {
    if (window.confirm("このタスクを削除しますか？")) {
      await handleDelete("task", eventId, button.dataset.taskId || itemId);
    }
    return;
  }

  if (action === "open-timeline-modal") {
    openModal("timeline", { eventId });
    return;
  }

  if (action === "edit-timeline") {
    openModal("timeline", { eventId, itemId, mode: "edit" });
    return;
  }

  if (action === "delete-timeline") {
    if (window.confirm("このタイムテーブル項目を削除しますか？")) {
      await handleDelete("timeline", eventId, itemId);
    }
    return;
  }

  if (action === "open-role-modal") {
    openModal("role", { eventId });
    return;
  }

  if (action === "edit-role") {
    openModal("role", { eventId, itemId, mode: "edit" });
    return;
  }

  if (action === "delete-role") {
    if (window.confirm("この役割を削除しますか？")) {
      await handleDelete("role", eventId, itemId);
    }
    return;
  }

  if (action === "open-checklist-modal") {
    openModal("checklist", { eventId });
    return;
  }

  if (action === "edit-checklist") {
    openModal("checklist", { eventId, itemId, mode: "edit" });
    return;
  }

  if (action === "delete-checklist") {
    if (window.confirm("このチェック項目を削除しますか？")) {
      await handleDelete("checklist", eventId, itemId);
    }
    return;
  }

  if (action === "open-finance-modal") {
    openModal("finance", { eventId });
    return;
  }

  if (action === "edit-finance") {
    openModal("finance", { eventId, itemId: button.dataset.lineId || itemId, mode: "edit" });
    return;
  }

  if (action === "delete-finance") {
    if (window.confirm("この収支明細を削除しますか？")) {
      await handleDelete("finance", eventId, button.dataset.lineId || itemId);
    }
    return;
  }

  if (action === "toggle-settlement") {
    const lineId = button.dataset.lineId || itemId;
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      finance: {
        ...eventItem.finance,
        lines: eventItem.finance.lines.map((line) =>
          line.id === lineId
            ? { ...line, settlementStatus: line.settlementStatus === "未精算" ? "精算済み" : "未精算" }
            : line
        )
      }
    }));
    return;
  }

  if (action === "close-event") {
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      status: "開催済み",
      result: {
        ...eventItem.result,
        closedAt: new Date().toISOString()
      },
      lumaStatus: eventItem.lumaStatus === "公開中" ? "終了" : eventItem.lumaStatus
    }));
    return;
  }

  if (action === "open-participant-modal") {
    openModal("participant", { eventId });
    return;
  }

  if (action === "edit-participant") {
    openModal("participant", { eventId, itemId, mode: "edit" });
    return;
  }

  if (action === "delete-participant") {
    if (window.confirm("この接点メモを削除しますか？")) {
      await handleDelete("participant", eventId, itemId);
    }
    return;
  }

  if (action === "open-asset-modal") {
    openModal("asset", { eventId });
    return;
  }

  if (action === "edit-asset") {
    openModal("asset", { eventId, itemId, mode: "edit" });
    return;
  }

  if (action === "delete-asset") {
    if (window.confirm("この画像リンクを削除しますか？")) {
      await handleDelete("asset", eventId, itemId);
    }
    return;
  }

  if (action === "stamp-luma-check") {
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      lumaCheckedAt: new Date().toISOString()
    }));
    return;
  }

  if (action === "check-all-items") {
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      runbook: {
        ...eventItem.runbook,
        checklist: eventItem.runbook.checklist.map((item) => ({ ...item, checked: true }))
      }
    }));
    return;
  }

  if (action === "uncheck-all-items") {
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      runbook: {
        ...eventItem.runbook,
        checklist: eventItem.runbook.checklist.map((item) => ({ ...item, checked: false }))
      }
    }));
    return;
  }

  if (action === "print-runbook") {
    window.print();
    return;
  }

  if (action === "copy-runbook") {
    const eventItem = state.events.find((item) => item.id === eventId);

    if (!eventItem) {
      return;
    }

    try {
      await copyText(buildRunbookShareText(eventItem));
      window.alert("当日ランブックをクリップボードにコピーしました。");
    } catch (error) {
      console.error(error);
      state.error = "ランブックのコピーに失敗しました。";
      render();
    }
    return;
  }

  if (action === "copy-result-summary") {
    const eventItem = state.events.find((item) => item.id === eventId);

    if (!eventItem) {
      return;
    }

    try {
      await copyText(buildResultShareText(eventItem));
      window.alert("終了後サマリーをクリップボードにコピーしました。");
    } catch (error) {
      console.error(error);
      state.error = "終了後サマリーのコピーに失敗しました。";
      render();
    }
    return;
  }

  if (action === "export-events") {
    exportEventsToFile();
    return;
  }

  if (action === "trigger-import") {
    const input = document.getElementById("events-import-input");
    input?.click();
    return;
  }

  if (action === "export-finance-csv") {
    const eventItem = state.events.find((item) => item.id === eventId);

    if (eventItem) {
      exportFinanceCsv(eventItem);
    }
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;

  if (target.matches('[data-action="toggle-task-status"]')) {
    const eventId = target.dataset.eventId;
    const taskId = target.dataset.taskId;
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      tasks: eventItem.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: target.checked ? "完了" : task.status === "完了" ? "進行中" : task.status
            }
          : task
      )
    }));
    return;
  }

  if (target.matches('[data-action="toggle-checklist"]')) {
    const eventId = target.dataset.eventId;
    const itemId = target.dataset.itemId;
    await updateEvent(eventId, (eventItem) => ({
      ...eventItem,
      runbook: {
        ...eventItem.runbook,
        checklist: eventItem.runbook.checklist.map((item) =>
          item.id === itemId ? { ...item, checked: target.checked } : item
        )
      }
    }));
    return;
  }

  if (target.matches('[data-role="finance-type"]')) {
    const form = target.closest("form");
    const categorySelect = form?.querySelector('select[name="category"]');
    const nextOptions = FINANCE_CATEGORIES[target.value] || [];

    if (categorySelect) {
      categorySelect.innerHTML = nextOptions
        .map((category) => `<option value="${category}">${category}</option>`)
        .join("");
    }
    return;
  }

  if (target.matches('[data-action="search-events"]')) {
    state.searchQuery = target.value || "";
    render();
    return;
  }

  if (target.matches('[data-action="set-prep-assignee-filter"]')) {
    state.prepAssigneeFilter = target.value || "all";
    render();
    return;
  }

  if (target.matches('[data-action="set-task-board-assignee-filter"]')) {
    state.taskBoardAssigneeFilter = target.value || "all";
    render();
    return;
  }

  if (target.id === "events-import-input") {
    await importEventsFromFile(target.files?.[0] || null);
    target.value = "";
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;

  if (target.matches('[data-action="search-events"]')) {
    state.searchQuery = target.value || "";
    render();
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;

  if (target.matches('[data-action="sort-events"]')) {
    state.sortMode = target.value || "smart";
    render();
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const formName = form.dataset.form;

  if (formName === "create-event") {
    await createEventFromForm(new FormData(form));
    return;
  }

  if (formName === "basic-info") {
    await handleBasicInfoSubmit(form);
    return;
  }

  if (formName === "runbook-notes") {
    await handleRunbookNotesSubmit(form);
    return;
  }

  if (formName === "result") {
    await handleResultSubmit(form);
    return;
  }

  if (formName === "finance-memo") {
    await handleFinanceMemoSubmit(form);
    return;
  }

  if (["task", "timeline", "role", "checklist", "finance", "participant", "asset"].includes(formName)) {
    await handleEntitySubmit(form, formName);
  }
});

function exportEventsToFile() {
  exportEventsCsv()
    .then((csvText) => {
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateLabel = new Date().toISOString().slice(0, 10);

      link.href = url;
      link.download = `event-ops-backup-${dateLabel}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    })
    .catch((error) => {
      console.error(error);
      state.error = "CSV書き出しに失敗しました。";
      render();
    });
}

async function importEventsFromFile(file) {
  if (!file) {
    return;
  }

  if (!window.confirm("現在のイベント一覧を、このCSVの内容で置き換えますか？")) {
    return;
  }

  try {
    const text = await file.text();
    applyLoadedEvents(await importEventsCsv(text));
    state.error = "";
    render();
  } catch (error) {
    console.error(error);
    state.error = "CSV読込に失敗しました。書き出したバックアップ形式を確認してください。";
    render();
  }
}

function applySession(session) {
  const previousUserId = state.authUser?.uid || null;
  const nextUserId = session.user?.uid || null;

  state.backendLabel = session.backendLabel;
  state.authRequired = Boolean(session.authRequired);
  state.authUser = session.user || null;

  return {
    previousUserId,
    nextUserId
  };
}

function clearLoadedEvents() {
  state.events = [];
  persistedEvents = [];
  state.selectedEventId = null;
}

async function init() {
  render();

  try {
    const session = await initializeStorage();
    applySession(session);
    state.error = "";

    await subscribeStorageSession(async (nextSession) => {
      const { previousUserId, nextUserId } = applySession(nextSession);

      if (state.authRequired && !nextUserId) {
        clearLoadedEvents();
        state.saveState = "idle";
        state.lastSavedAt = "";
        state.isLoading = false;
        render();
        return;
      }

      if (state.authRequired && previousUserId !== nextUserId) {
        state.isLoading = true;
        render();

        try {
          await loadEventData();
          state.error = "";
        } catch (error) {
          console.error(error);
          state.error = error.message || "Firestore の読込に失敗しました。";
        } finally {
          state.isLoading = false;
          render();
        }

        return;
      }

      render();
    });

    if (!state.authRequired || state.authUser) {
      await loadEventData();
    }
  } catch (error) {
    console.error(error);
    state.error = "Event Hub の初期化に失敗しました。Firebase 設定・Rules・API を確認してください。";
  } finally {
    state.isLoading = false;
    render();
  }
}

async function loadEventData() {
  const localBackupEvents = readLocalBackup();
  let remoteEvents = [];

  try {
    remoteEvents = cloneEventsSnapshot(await loadEvents());
  } catch (error) {
    if (localBackupEvents.length) {
      applyLoadedEvents(localBackupEvents);
      state.error = `${error.message || "保存先からの読込に失敗しました。"} この端末に残っていた最新バックアップを表示しています。内容を確認してから保存し直してください。`;
      state.saveState = "error";
      state.lastSavedAt = "";
      return;
    }

    throw error;
  }

  if (!remoteEvents.length && localBackupEvents.length) {
    applyLoadedEvents(localBackupEvents);
    state.error = "現在の保存先にイベントがなかったため、この端末に残っていた最新バックアップを表示しています。内容を確認してから保存し直してください。";
  } else {
    applyLoadedEvents(remoteEvents);
    state.error = "";
  }

  state.saveState = "saved";
  state.lastSavedAt = new Date().toISOString();
}
let lastResponsiveMode = isMobileLayout();

window.addEventListener("resize", () => {
  const nextResponsiveMode = isMobileLayout();

  if (nextResponsiveMode !== lastResponsiveMode) {
    lastResponsiveMode = nextResponsiveMode;

    if (!nextResponsiveMode) {
      state.mobileSidebarOpen = false;
    }

    render();
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatDateTime(value) {
  if (!value) {
    return "未設定";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDate(value) {
  if (!value) {
    return "未設定";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatMonthLabel(value) {
  if (!value) {
    return "未設定";
  }

  const date = new Date(`${value}-01T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long"
  }).format(date);
}

function toDatetimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60 * 1000);
  return adjusted.toISOString().slice(0, 16);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatSignedCurrency(value) {
  const amount = Number(value || 0);
  const formatted = formatCurrency(Math.abs(amount));

  if (amount > 0) {
    return `+${formatted}`;
  }

  if (amount < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

void init();
