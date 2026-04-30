"use client";

import type { ReactNode } from "react";

type ActiveView = "home" | "timeline" | "add" | "artists" | "venues" | "sync";
type ThemeMode = "system" | "light" | "dark";

type LiveLogShellProps = {
  activeView: ActiveView;
  shareMessage: string;
  actionNotice: string;
  themeModeLabel: string;
  onSelectView(view: ActiveView): void;
  onExportCsv(): void;
  onCycleThemeMode(): void;
  children: ReactNode;
};

function getViewTitle(activeView: ActiveView) {
  switch (activeView) {
    case "home":
      return "ホーム";
    case "timeline":
      return "タイムライン";
    case "add":
      return "イベント追加";
    case "artists":
      return "アーティスト";
    case "venues":
      return "会場";
    case "sync":
      return "同期 / バックアップ";
  }
}

function getViewDescription(activeView: ActiveView) {
  switch (activeView) {
    case "home":
      return "積み重ねたライブ記録を静かに辿るホーム";
    case "timeline":
      return "記録の概要と詳細、年ごとの流れを見返す";
    case "add":
      return "新しいライブ記録を、必要な情報から落ち着いて追加します";
    case "artists":
      return "アーティストとの関係性と推移を見返す";
    case "venues":
      return "会場との関係性と地域傾向を見返す";
    case "sync":
      return "Google ログイン、Drive 連携、クラウド保存をまとめて扱います";
  }
}

export function LiveLogShell({
  activeView,
  shareMessage,
  actionNotice,
  themeModeLabel,
  onSelectView,
  onExportCsv,
  onCycleThemeMode,
  children
}: LiveLogShellProps) {
  return (
    <main className="archiveAppShell">
      <aside className="archiveSidebar">
        <div className="archiveSidebarBrand">
          <strong>LIVELOG</strong>
          <span>Your Live Archive</span>
        </div>
        <nav className="archiveSidebarNav" aria-label="メインナビゲーション">
          <button
            className={activeView === "home" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => onSelectView("home")}
          >
            ホーム
          </button>
          <button
            className={activeView === "add" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => onSelectView("add")}
          >
            イベント追加
          </button>
          <button
            className={activeView === "timeline" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => onSelectView("timeline")}
          >
            タイムライン
          </button>
          <button
            className={activeView === "artists" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => onSelectView("artists")}
          >
            アーティスト
          </button>
          <button
            className={activeView === "venues" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => onSelectView("venues")}
          >
            会場
          </button>
          <button
            className={activeView === "sync" ? "archiveSidebarLink archiveSidebarLinkActive" : "archiveSidebarLink"}
            type="button"
            onClick={() => onSelectView("sync")}
          >
            同期 / バックアップ
          </button>
        </nav>
        <div className="archiveSidebarFooter">
          <button className="archiveSidebarGhostButton" type="button" onClick={onExportCsv}>
            CSV書き出し
          </button>
          <button className="archiveSidebarGhostButton" type="button" onClick={onCycleThemeMode}>
            {themeModeLabel}
          </button>
        </div>
      </aside>

      <section className="archiveMainCanvas">
        <header className="archiveMainHeader">
          <div className="archiveMainHeading">
            <h1>{getViewTitle(activeView)}</h1>
            <p>{getViewDescription(activeView)}</p>
          </div>
          <div className="archiveMainMeta">
            {shareMessage ? <span className="statusBadge statusBadgeSoft">{shareMessage}</span> : null}
            {actionNotice ? <span className="statusBadge statusBadgeSuccess">{actionNotice}</span> : null}
          </div>
        </header>

        {children}
      </section>

      <nav className="mobileBottomNav" aria-label="モバイルナビゲーション">
        <button
          className={activeView === "home" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => onSelectView("home")}
        >
          ホーム
        </button>
        <button
          className={activeView === "add" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => onSelectView("add")}
        >
          追加
        </button>
        <button
          className={activeView === "timeline" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => onSelectView("timeline")}
        >
          履歴
        </button>
        <button
          className={activeView === "artists" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => onSelectView("artists")}
        >
          アーティスト
        </button>
        <button
          className={activeView === "venues" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => onSelectView("venues")}
        >
          会場
        </button>
        <button
          className={activeView === "sync" ? "mobileNavButton activeMobileNavButton" : "mobileNavButton"}
          type="button"
          onClick={() => onSelectView("sync")}
        >
          同期
        </button>
      </nav>
    </main>
  );
}
