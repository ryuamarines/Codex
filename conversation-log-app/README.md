# 対話ログ整理アプリ

ChatGPT との会話ログや自分用メモを、ローカル環境で蓄積・検索・整理するための最小構成アプリです。`Next.js + TypeScript + Tailwind CSS` で構成し、保存先は最初は `localStorage`、将来的には SQLite や Supabase に移行しやすいようにストレージ層を分けています。

## 実装済み機能

- ログの一覧表示
- 新規登録
- 詳細表示
- 編集
- キーワード検索
- カテゴリ絞り込み
- タグ絞り込み
- `localStorage` への永続化
- サンプルデータの初期投入

## データモデル

```ts
type ConversationLog = {
  id: string;
  title: string;
  date: string;
  category: string;
  content: string;
  tags: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
};
```

`tags` を配列で持たせ、保存処理を `lib/log-repository.ts` に隔離しているため、将来的に DB 化するときは UI を大きく崩さずに差し替えできます。

## 起動手順

1. Node.js 20 以降を用意する
2. プロジェクトディレクトリへ移動する

```bash
cd /Users/Ryu/Documents/Codex
```

3. 依存関係をインストールする

```bash
npm install
```

4. 開発サーバーを起動する

```bash
npm run dev
```

5. ブラウザで開く

[http://localhost:3000](http://localhost:3000)

## 画面構成

- `/`
  一覧画面。検索、カテゴリ絞り込み、タグ絞り込みができます。
- `/new`
  新規登録画面です。
- `/logs/[id]`
  詳細画面です。本文全体とメモを確認できます。
- `/logs/[id]/edit`
  編集画面です。

## 主要ファイル

- `app/page.tsx`
  一覧画面のエントリです。
- `app/new/page.tsx`
  新規登録画面です。
- `app/logs/[id]/page.tsx`
  詳細画面です。
- `app/logs/[id]/edit/page.tsx`
  編集画面です。
- `components/log-list-page.tsx`
  一覧 UI と絞り込みロジックです。
- `components/log-form.tsx`
  新規登録・編集で共通利用するフォームです。
- `lib/log-types.ts`
  データモデル定義です。
- `lib/log-utils.ts`
  タグ解析、フィルタ、整形などの共通処理です。
- `lib/log-repository.ts`
  `localStorage` を扱う保存層です。
- `data/sample-logs.ts`
  初期表示用のサンプルデータです。

## 保存仕様

初回アクセス時にサンプルデータを `localStorage` へ投入し、その後の作成・更新内容をブラウザ内に保存します。対象キーは `conversation-log-app.entries` です。

## 今後の拡張案

- 削除機能の追加
- カテゴリ定義のマスタ化
- 添付ファイルや出典 URL の追加
- 構造化メタデータの追加
  例: `source`, `people`, `project`, `mood`, `relatedIds`
- 保存層の差し替え
  `lib/log-repository.ts` を SQLite / Supabase / API 経由実装へ置換
- 全文検索の強化
  SQLite FTS や Supabase の全文検索へ移行
