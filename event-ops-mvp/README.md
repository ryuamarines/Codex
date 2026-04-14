# Event Hub

Lumaを公開・申込の母艦として使いながら、内部向けにイベント全体を管理するためのローカルMVPです。  
主役はあくまで `Event` で、1イベントごとに「準備 → 当日 → 終了後 → 収支」を一続きで見られるようにしています。

## アプリ概要

少人数のイベント運営チームが、現実的に軽く使えることを優先した管理ツールです。

- 外向きの集客・申込は Luma を利用
- 内向きの運営情報をこのアプリで管理
- CRMや参加者分析は今回は主役にしない
- 将来的な拡張余地は残しつつ、まずは実務で触れる土台に絞る

## できること

- イベント一覧の確認
  - ステータス別表示
  - キーワード検索
  - 並び替え
  - 全体サマリー
  - 開催日までの緊急度表示
  - 要対応のみの絞り込み
  - 開催日時、会場、Luma URL、ざっくり収支状況の確認
  - 期限超過タスクや未精算の有無をざっと確認
  - スマホでは詳細を主役にしつつ、イベント一覧を引き出しで開閉
- イベント詳細の一元管理
  - 基本情報
  - 準備タスク
  - 当日運営ランブック
  - 終了後の振り返り
  - 収支と明細
- 実運用レビュー
  - 要対応
  - 注意
  - あると良い
  をイベントごとに表示
- イベント健全性の見える化
  - 基本情報
  - Luma導線
  - 準備進行
  - 当日運営
  - 収支可視化
  を5観点で確認
- 運営サマリー
  - 期限超過
  - 3日以内のタスク
  - 未精算
  - Luma申込数 / 確認状況
  - 当日準備の埋まり具合
- 次の一手ガイド
  - 今の状態から次にやると効く作業を自動表示
- イベント作成時の初期テンプレタスク自動投入
- イベント複製
  - 定例イベントや類似フォーマットの再利用
- イベント詳細の前後移動
  - 今見ている並び順のまま次のイベントへ移れる
- イベント進行のクイック操作
  - 企画中 → 公開準備中 → 募集中 → 開催済み
- 準備タスクの一括操作
  - 絞り込み中のタスクを進行中 / 完了 / 未着手にまとめて更新
- 準備タスクの担当者フィルタ
  - 担当者別 / 未割当で絞り込み
- 準備タスクの担当者サマリー
  - 担当ごとの未完了、期限超過、直近タスクを一覧化
- イベントテンプレ
  - 登壇イベント
  - 交流会
  - 読書会 / 小規模会
  - カスタム
- Luma連携の入口
  - URL
  - 公開状態
  - 申込数メモ
  - 最終確認日時
  - 運用メモ
- 当日画面の印刷
- 時間入力の5分刻み対応
- 当日チェック項目の一括完了 / 一括解除
- タイムテーブル整合チェック
  - 時刻未入力
  - 担当未設定
  - 重複時刻
  - 役割の空欄
- 当日役割の未割当確認
  - 役割だけ作って担当が空のものを一覧化
- バックアップ
  - CSV書き出し
  - CSV読込
- 参加者管理の受け皿
  - 取り込み状態
  - チェックイン人数
  - 取り込み元
  - 接点メモ
  - 次回フォロー候補
- フォロー候補一覧
  - 次回フォローしたい参加者だけを終了後画面で一覧化
- 終了後サマリーの共有用コピー
  - 振り返り内容とフォロー候補をテキスト化
- 振り返り充足度
  - 終了後記録の埋まり具合を5観点で確認
- ローカル保存
  - サーバー側の JSON ファイルに保存
  - ページ再読込後も状態を保持
  - CSV はバックアップの書き出し / 読込専用
- 入力バリデーション
  - イベント基本情報、タイムテーブル、収支明細などの不正入力を保存前に検知
- 共有コピーのフォールバック
  - Clipboard API が使えない環境でもテキストコピーを試行
- スモークテスト
  - 純粋ロジックの最低限の回帰確認
- 収支カテゴリ内訳
  - 収入 / 支出カテゴリごとの予定・実績・差額を集計
- 収支明細フィルタ
  - 全件 / 収入 / 支出 / 未精算 / 立替あり
- 収支の抜け漏れ確認
  - 実績未入力、未精算、明細未登録を確認

## 技術構成

- フロントエンド: Vanilla JavaScript (ES Modules)
- UI: HTML + CSS
- ローカルサーバー: Node.js 組み込み `http`
- 保存方式: ローカル JSON データストア
- API: シンプルな REST エンドポイント (`/api/events`, `/api/reset`, `/api/export-csv`, `/api/import-csv`)
- 補助モジュール: `event-insights.js`, `event-selectors.js`, `validation.js`, `clipboard.js`, `event-repository.js`
- Firebase 接続: `firebase-config.js`, `firebase-client.js`

依存パッケージを増やさず、`npm install` なしでも起動できる構成にしています。  
データは以下の JSON ファイルに保存されます。

- `/Users/Ryu/Documents/Codex/event-ops-mvp/data/events.json`
- 初期化用シード: `/Users/Ryu/Documents/Codex/event-ops-mvp/data/default-events.json`

## 起動方法

Node.js 20 以降を想定しています。

```bash
cd /Users/Ryu/Documents/Codex/event-ops-mvp
npm start
npm run test:smoke
```

起動後、ブラウザで以下を開いてください。

```text
http://127.0.0.1:3000
```

## オンラインで試す方法

Firebase Hosting でそのまま試せるようにしています。

```bash
cd /Users/Ryu/Documents/Codex/event-ops-mvp
npm run firebase:deploy
```

- Hosting 設定は [firebase.json](/Users/Ryu/Documents/Codex/event-ops-mvp/firebase.json:1)
- Firebase project は [.firebaserc](/Users/Ryu/Documents/Codex/event-ops-mvp/.firebaserc:1) で `event-hub-feb37` を向いています
- Firebase モードでは `server.js` なしでも主要機能が動きます

## 画面構成

### 1. イベント一覧

- ステータスフィルタ
- キーワード検索
- 並び替え
- 全体サマリー
- 開催日緊急度
- 要対応のみフィルタ
- イベントカード一覧
- 新規イベント作成
- CSVバックアップの書き出し / 読込

### 2. イベント詳細

1イベントのハブ画面として、以下のタブを用意しています。

- 前後イベントへの移動
- 更新履歴
- ステータス進行のクイック操作
- 実運用レビュー
- 運営サマリー
- イベント健全性
- 次の一手ガイド
- 基本情報
- 準備
- 当日
- 終了後
- 収支

### 3. 準備

- タスク追加 / 編集 / 削除
- 担当者、期限、カテゴリ、ステータス、メモ管理
- 初期テンプレタスク再投入
- カテゴリ別サマリー
- 表示中タスクの一括ステータス更新
- 担当者別フィルタ
- 担当者サマリー
- 条件別の絞り込み
  - 未完了
  - 期限超過
  - 3日以内
  - 完了
  - 期限未設定

### 4. 当日

- タイムテーブル
- 役割分担
- 注意事項
- 受付メモ
- 緊急時メモ
- 当日チェック項目
- 当日チェック項目の一括操作
- タイムテーブル整合チェック
- 役割の未割当確認
- ランブックの共有用コピー
- 印刷用の簡易出力

### 5. 終了後

- 実参加人数
- 所感
- 良かった点
- 改善点
- 次回へのメモ
- 接点メモ
- 参加者管理の受け皿
- フォロー候補一覧
- 終了後サマリーの共有用コピー
- 振り返り充足度
- 開催済みとして締める操作

### 6. 収支

- 売上予定 / 実績
- 費用予定 / 実績
- 利益
- 売上差額 / 費用差額
- 明細管理
- 立替 / 精算ステータス管理
- 立替者ごとの未精算サマリー
- 収支カテゴリ内訳
- 収支明細フィルタ
- 収支の抜け漏れ確認
- 明細ごとの精算クイック切替
- 収支CSV書き出し

## データ構造の概要

MVPでは以下の概念を中心にしています。

- `Event`
  - イベントの主データ
- `EventTask`
  - 準備や終了後対応のタスク
- `EventRunbook`
  - 当日運営用のタイムテーブル、役割、注意事項、チェック項目
- `EventResult`
  - 終了後の振り返り記録
- `EventFinance`
  - 収支全体の集約
- `FinanceLine`
  - 収入 / 支出の明細

補助的に、以下のリスト要素を持ちます。

- `RunbookTimelineItem`
- `RunbookRole`
- `RunbookChecklistItem`

また、Luma連携の入口として以下のイベント属性を持たせています。

- `lumaUrl`
- `lumaStatus`
- `lumaRegistrationCount`
- `lumaCheckedAt`
- `lumaNotes`

将来の参加者一覧取り込みに備えて、以下の受け皿も持たせています。

- `participantHub.importStatus`
- `participantHub.checkedInCount`
- `participantHub.lastImportedAt`
- `participantHub.source`
- `participantHub.notes`
- `participantHub.touchedParticipants`

内部ではイベント全体を JSON / オブジェクトとして扱い、CSV はバックアップや受け渡し専用にしています。

## Firebase への拡張余地

- フロントの保存窓口は [event-repository.js](/Users/Ryu/Documents/Codex/event-ops-mvp/public/src/event-repository.js:1) にまとめています
- `local-api` と `firebase` の両方を置ける形にしており、切り替え先は `firebase-config.js` の runtime 設定です
- repository を差し替えることで、UI 側の呼び出しを大きく変えずに保存先を切り替えられます

## Firebase 利用メモ

- Firebase 設定は [firebase-config.js](/Users/Ryu/Documents/Codex/event-ops-mvp/public/src/firebase-config.js:1) にあります
- 現在は `dataBackend: "firebase"` なので、起動すると Firebase Auth + Firestore を使います
- 今はオンライン試験用に `requireLogin: false` にしてあり、ログインなしでも触れます
- Firestore ルールも [firestore.rules](/Users/Ryu/Documents/Codex/event-ops-mvp/firebase/firestore.rules:1) で一時的に全開放です
- 実運用に入る前に、`requireLogin` と `allowedEmails` と Firestore ルールを必ず締め直してください

## 今後の拡張余地

- Luma API連携
  - Luma URLだけでなく公開状態や申込数の自動同期
- 画像 / 素材保管まわり
  - イベント詳細から切り離して、別UIや別ストレージ設計で扱えるようにする
- 参加者一覧の取り込み
  - 当日受付と軽い参加者メモの接続
- CRM連携
  - 気になった参加者メモをPeople軸へ発展
- 権限 / 認証
  - 運営チーム向けの閲覧・編集制御
- 軽量DB化
  - 現在の JSON データストアから Firestore / SQLite / Supabase 等への移行
- レポート
  - イベント横断の収支や振り返りサマリー
