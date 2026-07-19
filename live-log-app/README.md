# LiveLog

ライブの記録を、電子チケットや立て看板の画像から登録し、履歴・会場・アーティスト別に振り返る個人向けWebアプリです。

- アプリ: Next.js + TypeScript
- 認証・記録同期: Firebase Authentication + Cloud Firestore
- 画像保管: ユーザー自身のGoogle Drive
- OCR: Tesseract.jsをブラウザ内で実行
- 公開先: VercelのNext.js server runtime

## 現在の主要フロー

### 電子チケットから登録

1. `イベント追加` で `電子チケットを選ぶ` を押す
2. 端末内でOCRを自動実行する
3. 日付・公演名・会場・出演者の候補を確認、必要なら修正する
4. 登録後、Timelineの作成レコードをDETAILで開く

### 立て看板から登録・添付

1. `立て看板を撮る / 選ぶ` を押す
2. 端末内でOCRを自動実行する
3. 既存公演と一致した場合は、そのレコードへ画像だけを添付できる
4. 一致しない場合は、候補を確認して新規登録する

手入力、CSV取込み、複数画像の一括整理も利用できます。一括整理は補助機能として折りたたんであります。

## 実装済みの機能

- Timeline、検索、DETAIL、編集、削除
- 年別・アーティスト別・会場別の集計
- 電子チケット・立て看板のOCR登録
- 表記揺れを考慮したアーティスト・会場候補
- CSV入出力
- 集計タイル・年別まとめのPNG保存
- iOS / Androidの共有シートへの画像共有
- Googleログイン
- Firestoreの差分同期と競合検出
- Google Driveへの画像保存と失敗時の再試行
- UIDごとに分離したローカル保存
- PWAホーム画面追加

共有はPNG画像だけを対象とします。記録を開く共有URLや、Drive画像原本の公開リンクは作成しません。

## データの保存と保護

### ローカル

- IndexedDBを正本として利用します
- 小さいデータはlocalStorageにも予備保存します
- Firebase UIDごとに保存領域を分離します
- 旧localStorageデータは、同じUIDと確認できた場合だけ非破壊で移行します
- 更新前の内部復元点を自動作成します

### Firestore

- `liveLogArchives/{uid}`: 設定、revision、記録ID一覧
- `liveLogArchives/{uid}/entries/{entryId}`: 各ライブ記録
- 保存はentry単位の差分更新です
- 競合時は最新revisionへ付け替え、別レコードの更新は保持します
- 同じレコードを複数端末で同時変更した場合は自動上書きせず停止します
- 大量更新は300件ずつ処理し、中断後も再開可能です

### Google Drive

- 画像本体はユーザー自身のDriveへ保存します
- FirestoreにはDrive参照と同期状態だけを保存します
- サーバーは認証済みの再開可能アップロードURLだけを発行し、画像本体はブラウザからDriveへ直接送ります
- Vercel Functionの4.5MB body上限を画像が通過しない構成です
- Driveアクセストークンは1時間有効の`httpOnly`、`Secure`、`SameSite=Strict` cookieです
- Drive APIはFirebase IDトークンの署名、期限、発行元、project IDをサーバーで検証します
- DriveセッションはFirebase UIDに紐づくため、別アカウントへ引き継ぎません

GitHubが保存するのはアプリのコードです。入力したライブ記録はGitHubへ保存されません。日常運用ではFirestore同期に加えて、節目ごとのCSV書き出しを推奨します。

## OCR

OCRは`public/tesseract`のworker、WASM、`jpn / eng`言語データを同一オリジンから読み込み、画像も文字列も外部OCRサービスへ送信しません。

現在の処理:

- スマホの大画像をOCR向け上限へ縮小
- 電子チケットと立て看板で前処理・認識範囲を変更
- 有力な結果を得た時点で不要な再解析を終了
- 45秒でタイムアウトし、再試行・中止が可能
- 不正な日付・時刻を候補から除外
- `OPEN / START`、出演者、未知の会場名を抽出
- 汎用ファイル名でもOCR本文から画像種別を推定
- 既存記録と照合し、重複登録を避ける

OCR結果は必ず確認画面を経由します。実写データに対する数値精度は未測定のため、公開判定前に電子チケット20枚・立て看板20枚程度の非公開画像セットで計測してください。

## セットアップ

```bash
cd "/Users/Ryu/AI Workspace/Codex/live-log-app"
npm install
cp .env.example .env.local
npm run dev
```

ローカルURLは [http://localhost:3000](http://localhost:3000) です。Firebase未設定でもローカル保存部分は動作します。

### 環境変数

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=
NEXT_PUBLIC_CANONICAL_HOST=live-log-web.vercel.app
```

`NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`はreCAPTCHA Enterpriseのサイトキーです。未設定時はApp Checkを初期化しません。

## 検証コマンド

```bash
npm test
npm run typecheck
npm run build
npm audit
```

同じ検査は`.github/workflows/live-log-ci.yml`でpushとpull requestごとに実行します。

## 公開前チェック

1. Firebase AuthenticationでGoogleログインを有効化する
2. FirebaseのAuthorized domainsへ正規公開ドメインを登録する
3. VercelのRoot Directoryを`live-log-app`にする
4. Vercelへ上記環境変数を設定する
5. `firebase/firestore.rules`をFirebaseへデプロイする
6. reCAPTCHA EnterpriseのWebキーを作成し、App Checkへ登録する
7. App Check入りのアプリを先に公開し、Firestoreのverified request比率を確認する
8. 正常端末がverifiedになった後で、FirestoreのApp Check enforcementを有効化する
9. CSVを取得してから、別ブラウザでログイン・同期・追加・編集・画像再表示を確認する
10. 実写OCR評価セットで候補精度と登録完了率を記録する

Firestoreルールは`firebase.json`からデプロイできます。Firebase CLIで対象projectを明示して実行してください。

```bash
npx firebase-tools use <firebase-project-id>
npx firebase-tools deploy --only firestore:rules
```

App CheckはSDKを追加しただけでは通信を遮断しません。Firebase Consoleのメトリクス確認後にenforcementを有効化します。先にenforcementだけを有効にすると、未対応版や設定漏れの端末がFirestoreへ接続できなくなります。

## 公開構成

- GitHub: `ryuamarines/Codex`
- アプリディレクトリ: `live-log-app`
- Vercel Root Directory: `live-log-app`
- 正規URL: `https://live-log-web.vercel.app`
- Firestore Rules: `firebase/firestore.rules`

`app/api/drive/*`を使うため、静的exportでは動作しません。VercelなどのNext.js server runtimeが必要です。

## PWAの範囲

manifest、アイコン、service worker登録によりホーム画面へ追加できます。現在のservice workerは更新ループを防ぐためキャッシュを持たず、オフライン動作は保証しません。

## 緊急時

通常UIに危険な復元操作は置いていません。内部保存が壊れた場合は元データを退避します。開発者向けの最終手段として、ブラウザコンソールで`window.liveLogEmergencyExport()`を実行すると、現在記録と内部退避データをJSONで書き出せます。
