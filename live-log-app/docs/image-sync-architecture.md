# 画像同期の方針

## いまの正本

- Firestore
  - 公演テキスト
  - 画像メタ情報
- Google Drive
  - 画像本体
- ローカルブラウザ
  - 一時プレビュー
  - 未同期の作業状態

## 画像状態

- `local_pending`
  - この端末にだけ画像原本がある
  - Firestore には「未同期画像あり」としてメタ情報だけ残す
  - 他端末では raw 画像は見えず、状態表示だけ見える
- `syncing`
  - Drive へアップロード中
  - Firestore にも同期中として保存する
- `cloud`
  - Drive へ保存済み
  - Firestore に Drive 参照を保存済み
- `error`
  - Drive 保存に失敗
  - Firestore にも失敗状態を残す
  - 元画像がこの端末に残っていれば再試行できる

## Firestore に保存する画像メタ情報

- `id`
- `type`
- `caption`
- `storageStatus`
- `uploadError`
- `driveFileId`
- `driveWebUrl`
- `driveThumbnailUrl`
- `src`
  - `cloud` のときだけ保存
  - 非 `cloud` 状態では端末ローカル原本を保存しない

## 現時点の実装判断

- フロントは `Drive 保存したい / 削除したい` という要求だけを出す
- 実際の Google Drive API 呼び出しはサーバー API 経由で行う
- Drive セッションは `httpOnly cookie` に保存し、localStorage へは置かない
- Firestore には `local_pending / syncing / cloud / error` を全部保存する

## いまの制約

- この方式は `static export -> Firebase Hosting` とは両立しない
- Drive API をサーバー側で呼ぶため、公開にはサーバー runtime が必要
- つまり今後は `next build && next start` のような serverful 配備前提になる

## 別ブラウザの扱い

- プレビューが出ることは保証しない
- 最低保証は `Driveで開く`
- 画像メタ情報が Firestore に保存されていれば、別ブラウザでも Drive リンクは追える
