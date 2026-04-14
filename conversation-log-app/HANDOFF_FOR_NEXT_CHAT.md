# 対話ログアプリ 引き継ぎメモ

## 現在の場所

`/Users/Ryu/Documents/Codex/conversation-log-app`

## アプリ概要

- アプリ名: `conversation-log-app`
- 技術構成: `Next.js + TypeScript + Tailwind CSS`
- 保存方式: `localStorage`
- 保存キー: `conversation-log-app.entries`

## 実装済み機能

- 一覧表示
- 新規登録
- 詳細表示
- 編集
- キーワード検索
- カテゴリ絞り込み
- タグ絞り込み
- `localStorage` 永続化
- サンプルデータ初期投入

## 主なルート

- `/`
- `/new`
- `/logs/[id]`
- `/logs/[id]/edit`

## 主なファイル

- `app/page.tsx`
- `app/new/page.tsx`
- `app/logs/[id]/page.tsx`
- `app/logs/[id]/edit/page.tsx`
- `components/log-list-page.tsx`
- `components/log-form.tsx`
- `lib/log-types.ts`
- `lib/log-utils.ts`
- `lib/log-repository.ts`
- `data/sample-logs.ts`

## 起動方法

```bash
cd /Users/Ryu/Documents/Codex/conversation-log-app
npm install
npm run dev
```

ブラウザ:

`http://localhost:3000`

## 補足

- 以前は `/Users/Ryu/Documents/Codex` 直下にあり、ライブ記録アプリと競合していた
- 現在は専用フォルダへ移動済み
- ライブ記録アプリは `/Users/Ryu/Documents/Codex/live-log-app`
