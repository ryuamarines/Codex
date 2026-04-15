# Codex Projects

このリポジトリは、1つのアプリだけではなく複数の独立したプロジェクトをまとめて管理するための作業リポジトリです。

## ディレクトリ構成

- `live-log-app`
- `conversation-log-app`
- `event-ops-mvp`
- `room-redesign-planner`
- `weight-audit-form-automation`

各フォルダはそれぞれ独立したアプリです。  
`package.json` もフォルダごとに分かれているため、**Vercel ではアプリごとに別 Project を作る**前提になります。

## Vercel での考え方

このリポジトリ全体を 1 個の Vercel Project として扱うのではなく、

- 1 アプリ = 1 Vercel Project

で設定してください。

### 例

`live-log-app` を公開したい場合:

1. GitHub リポジトリ: `ryuamarines/Codex`
2. Vercel で新しい Project を作る
3. **Root Directory** に `live-log-app` を指定する
4. Framework Preset は `Next.js`
5. 必要な環境変数を入れて deploy する

同じリポジトリから、別のアプリを公開したい場合も同じです。

- `conversation-log-app` を公開したい
  - Root Directory: `conversation-log-app`
- `event-ops-mvp` を公開したい
  - Root Directory: `event-ops-mvp`

## 重要なポイント

- GitHub リポジトリは **1つのままで問題ありません**
- ただし Vercel Project は **アプリごとに分ける必要があります**
- つまり「Codex 全体を 1 回 deploy」ではなく、
  **「Codex リポジトリの中のどのフォルダを公開するかを Project ごとに決める」**
  という運用です

## live-log-app の補足

`live-log-app` は現在、Google Drive 連携のために Next.js のサーバー API を使っています。  
そのため、単純な静的 Hosting ではなく **server runtime 前提** です。

Vercel で公開する場合は:

- GitHub リポジトリ: `ryuamarines/Codex`
- Root Directory: `live-log-app`

にしてください。
