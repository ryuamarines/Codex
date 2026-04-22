# Live Log

ライブ体験を後から辿るための、個人用アーカイブアプリです。
`Next.js + TypeScript` ベースで、開発の正本は GitHub、公開先は Vercel を前提にしています。まずは Web アプリとしてスマホで使いやすくしつつ、将来的な Android 公開につながる土台を入れています。

## 今回の到達点

- PWA の最低限対応
  - ホーム画面追加
  - standalone 起動
  - manifest
  - icon
  - service worker 登録
- Firebase の土台追加
  - Google ログイン導線
  - Cloud Firestore 保存 / 読込の基盤
  - Google Drive 画像保存の基盤
- 保存層の整理
  - `localStorage` 直書き依存を repository 層へ寄せた
  - 画像も service 層を通す形へ整理した
- CSV バックアップ導線は維持

## いま実装済みのこと

### 基本機能

- 一覧表示
- 検索
- 手動登録
- CSV 取込み
- 写真登録
- 画像ロット取り込み
  - OCR 実行で候補補強
  - 候補確定 → 本登録 の 2 段階
- 一覧編集
- 一括更新 / 一括削除
- 集計
- 年別まとめ
- 集計タイルの画像共有
  - 1タイルだけ PNG 化
  - スマホは共有シート
  - PC は PNG 保存

### PWA

- `app/manifest.ts`
- `public/sw.js`
- `components/pwa-register.tsx`
- `public/icon.svg`
- `public/apple-icon.svg`
- `public/maskable-icon.svg`

本番ビルドで開いたとき、スマホのブラウザからホーム画面に追加して、アプリっぽく起動できます。

### Firebase

- `lib/firebase/client.ts`
- `lib/firebase/auth.ts`
- `lib/firebase/firestore-repository.ts`
- `lib/archive-image-service.ts`
- `lib/google-drive-image-service.ts`

いまの段階では、次が使えます。

- Google ログイン
- Cloud Firestore へ保存
- Cloud Firestore から読込
- 画像本体を Google Drive へ保存
- 同期状態表示
  - `ローカル保存 / 未同期の変更あり / クラウド同期済み`
  - `最終同期` の時刻表示

## 保存責務の整理

現在の Live Log は、保存先を次のように分けています。

- Firestore
  - `liveLogArchives/{uid}`
    - owner
    - updatedAt
    - `settings.driveFolderId`
  - `liveLogArchives/{uid}/entries/{entryId}`
    - 公演テキストの正本
    - 画像メタ情報
      - `storageStatus`
      - `uploadError`
      - `driveFileId`
      - `driveWebUrl`
      - `driveThumbnailUrl`
- Google Drive
  - 画像本体
- ローカルブラウザ
  - 追加直後の一時プレビュー
  - 未同期の作業状態
- CSV
  - 手動バックアップ

### 画像同期の現時点の方針

- 画像はまずローカルに追加されます
- その後、Google Drive にアップロードします
- Firestore には画像本体ではなく、Drive 参照と同期状態だけを保存します
- 別ブラウザでは Drive サムネイルが表示できないことがあるため、最低保証は `Driveで開く` です
- Drive 保存先フォルダは Firestore にも保存し、新しいURLや別ブラウザでは復元を優先します

### 画像整理の現時点の方針

- 電子チケット
  - `新規候補` の主ソース
- 立て看板
  - `既存照合` の補助を優先
  - 一致候補が弱いときは安易に新規候補へ寄せず、まず `添付のみ` 側で扱います
- その他画像
  - 添付寄り

OCR の候補は、そのまま本登録せず

1. 候補確定
2. 本登録

の順で確認する前提です。

### Google Drive 連携の位置づけ

現在は Next.js のサーバー API (`/api/drive/*`) を経由して Google Drive API を呼んでいます。  
Drive のアクセストークンは `httpOnly cookie` に保存し、ブラウザの `localStorage` には置きません。

- いまの利点
  - フロントから Drive API を直叩きしないので、トークン管理を UI から切り離せる
  - 各ユーザーの個人 Drive に画像を保存できる
  - 保存先フォルダは Firestore にも持つので、新しいURLや別ブラウザで復元しやすい
- いまの制約
  - Drive アクセストークンの更新はまだ必要
  - ブラウザや端末によってサムネイル表示が不安定なことがある
  - そのため画像の最低保証は `Driveで開く` に置いています
  - ドメイン変更後は Drive セッション cookie が引き継がれないため、`Drive連携更新` が必要になることがあります
  - ログアウトや別ユーザー利用時は、ローカルに残った Drive 保存先を引き継がない前提です

### 公開URLの土台

- `next.config.ts`
  - `next build` / `next start` の server runtime 前提です
- `app/api/drive/*`
  - Drive 保存 / 削除 / セッション更新のサーバー API

現在の画像同期構成は、静的 export 前提の Hosting とは両立しません。  
Google Drive API をサーバー側で呼ぶため、公開にはサーバー runtime が必要です。

現時点では、公開先は **Vercel のような Next.js server runtime が使える環境** を前提にしてください。

## GitHub / Vercel メモ

- GitHub リポジトリ: `ryuamarines/Codex`
- アプリのディレクトリ: `live-log-app`
- Vercel の Root Directory: `live-log-app`
- 現在の公開URL: `https://live-log-web.vercel.app`
- 公開は Vercel 前提、Firebase はアプリ内部の認証 / 保存基盤として使っています

## まだ今後必要なこと

今回の実装は「土台」です。次はこのへんが残っています。

- entry 単位更新のさらなる徹底
  いまは Firestore の保存先を `liveLogArchives/{uid}/entries/{entryId}` に分け、追加・画像追加・単体削除は entry 単位保存へ寄せています。CSV / 一括編集 / 複数削除はまだ全体 autosave 寄りです。
- Google Drive 画像同期の本格安定化
  Drive トークン更新や別ブラウザでのプレビュー保証は今後の改善項目です。
- オフライン同期設計
  PWA と Firebase をどう整合させるかは次の段階です。
- Android 公開向けの最終調整
  アイコン、スプラッシュ、利用規約、PWA の最終調整など。

## 環境変数

`.env.example` をもとに `.env.local` を作ってください。

```bash
cp .env.example .env.local
```

必要な環境変数は次です。

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Firebase をまだ設定していない場合でも、アプリ自体はローカル保存で動きます。  
その場合、Google ログインやクラウド同期ボタンは実質無効です。

## セットアップ手順

### 1. フォルダへ移動

```bash
cd /Users/Ryu/Documents/Codex/live-log-app
```

### 2. 依存関係を入れる

```bash
npm install
```

### 3. Firebase を使うなら `.env.local` を作る

```bash
cp .env.example .env.local
```

そのうえで Firebase の Web アプリ設定値を入れます。

Vercel に設定済みの開発用環境変数をローカルへ反映したい場合は、次でも構いません。

```bash
npm run env:pull
```

### 4. 開発サーバー起動

```bash
npm run dev
```

### 5. ブラウザで開く

[http://localhost:3000](http://localhost:3000)

## 本番ビルド確認

PWA を確認したいときは本番ビルドで見るのが確実です。

```bash
npm run build
npm run start
```

そのあとスマホで同じ URL にアクセスして、ホーム画面追加を試してください。

## Firebase 側で必要な設定

### Auth

- Google ログインを有効化

### Firestore

- Firestore Database を作成
- [firebase/firestore.rules](/Users/Ryu/Documents/Codex/live-log-app/firebase/firestore.rules) をベースに Rules を設定
- `liveLogArchives/{userId}` と `liveLogArchives/{userId}/entries/{entryId}` は、`request.auth.uid == userId` で read / write できるようにする
- ルール反映後、Google ログインしたユーザーが自分の `uid` 配下だけ読める / 書ける状態を前提にする

### Firestore トラブルシュート

- `Missing or insufficient permissions.` が出るとき
  - Firestore Rules が初期テンプレのままか、`request.auth.uid == userId` の条件と path がずれていることが多いです
  - `liveLogArchives/{uid}` と `liveLogArchives/{uid}/entries/{entryId}` の両方に、自分の `uid` で read / write できる rule が必要です
- `Unsupported field value: undefined` が出るとき
  - 古い保存データや途中状態をそのまま Firestore に投げている可能性があります
  - 現在の実装では serializer 側で `undefined` を落とし、entry document id も Firestore 向けに安全化しています

### Google Drive API

- Google Drive API を有効化
- 画像を各ユーザーの個人 Drive フォルダへ保存できるようにする

## 公開と実行の前提

外出先やスマホ本運用で使うなら、`npm run dev` のローカルサーバーではなく公開URLが必要です。  
ただし現在は Google Drive 連携をサーバー API 経由にしたため、**静的書き出しだけの Hosting では動きません**。

### いま必要な実行形態

- `npm run build`
- `npm run start`

のような serverful な実行環境が必要です。

### 補足

公開デプロイは Vercel 前提で、`npm run deploy` を使います。

## 保存の考え方

このアプリは、クラウドだけに依存しない前提です。

- 普段の軽い利用: ローカル保存
- 同期 / 引き継ぎ / 将来の本番利用: Firebase
- 手元バックアップ: CSV 書き出し

この 3 本立てを崩さない方針です。

## 同期の使い方

- 普段は Google ログインしておけば、変更は自動でクラウドへ同期されます
- ヘッダーには `同期状態` と `最終同期` が出ます
- `クラウド同期`
  - 未同期ローカル変更がなければ、クラウド側の内容を取り込みます
- `この端末をクラウドで置き換え`
  - この端末のローカル状態を無視して、クラウド同期内容で上書きします

迷ったときは、まず `クラウド同期` を使い、端末の状態が崩れているときだけ `この端末をクラウドで置き換え` を使うのが安全です。

## 共有

集計タイル右上の `共有` ボタンで、そのタイルだけを画像にできます。

- スマホ
  - 共有シートへそのまま渡す
- PC
  - PNG ファイルとして保存する

全画面共有ではなく、`1つのタイルだけを切り出して共有する` 方針です。

## CSV バックアップ

CSV 書き出しは引き続き使えます。  
出力ヘッダーは次です。

```csv
date,event_title,venue,venues_raw,area,artists,event_type,notes
```

## 画像ロット取り込み

`画像整理` タブで、複数画像をまとめて投入できます。

- チケット / 立て看板 / その他を仮分類
- 日付候補 / 会場候補 / 開場候補 / 開演候補 / アーティスト候補 / タイトル断片を保持
- OCR で取れたテキストを確認しながら候補を補強
- 既存公演との照合候補を一覧表示
- `既存公演に紐づける / 新規公演として作る / 添付のみ / 除外` をまとめて確定

OCR は `tesseract.js` ベースです。チケットでは `日付 / 会場 / 開場 / 開演 / タイトル断片` を優先して補強し、立て看板では照合キーを補強する方向です。まずは `大量画像を一覧で整理して、人間が短時間で確定できる流れ` を優先しています。

## 関連ファイル

### PWA

- `app/layout.tsx`
- `app/manifest.ts`
- `components/pwa-register.tsx`
- `public/sw.js`
- `public/icon.svg`
- `public/apple-icon.svg`
- `public/maskable-icon.svg`

### Firebase

- `lib/firebase/client.ts`
- `lib/firebase/auth.ts`
- `lib/firebase/firestore-repository.ts`
- `lib/live-cloud-service.ts`
- `lib/archive-image-service.ts`
- `lib/google-drive-image-service.ts`
- `firebase/firestore.rules`
- `.env.example`
- `docs/image-sync-architecture.md`

### 保存層

- `lib/live-entry-repository.ts`
- `lib/live-entry-utils.ts`
- `components/live-log-page.tsx`

## 補足

このアプリは SNS ではなく、非公開前提の個人アーカイブです。  
共有機能は **公開投稿** ではなく、集計タイルや年別まとめを画像として切り出す用途に限定しています。  
まずは「自分の記録を安全に持ち、スマホで振り返れること」を優先しています。
