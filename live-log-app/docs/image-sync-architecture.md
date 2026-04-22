# 画像同期の方針

## いまの正本

- Firestore
  - `liveLogArchives/{uid}`
    - owner
    - updatedAt
    - settings.driveFolderId
    - revision
  - `liveLogArchives/{uid}/entries/{entryId}`
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

## Firestore 保存時の補足

- entry document id には Firestore path と衝突しないように安全化した値を使う
- 元の entry id は document 本文にも保持する
- optional 項目は `undefined` のまま Firestore に送らず、serializer 側で落とす

## 現時点の実装判断

- フロントは `Drive 保存したい / 削除したい` という要求だけを出す
- 実際の Google Drive API 呼び出しはサーバー API 経由で行う
- Drive セッションは `httpOnly cookie` に保存し、localStorage へは置かない
- Drive 保存先フォルダは localStorage に加えて Firestore にも保存し、新しい URL や別ブラウザでも復元できるようにする
- Firestore には `local_pending / syncing / cloud / error` を全部保存する

## いまの制約

- この方式は静的 export 前提の Hosting とは両立しない
- Drive API をサーバー側で呼ぶため、公開には server runtime が必要
- 現在の公開先は Vercel のような serverful 配備を前提にしている

## 別ブラウザの扱い

- プレビューが出ることは保証しない
- 最低保証は `Driveで開く`
- 画像メタ情報が Firestore に保存されていれば、別ブラウザでも Drive リンクは追える
- ドメイン変更や別ブラウザでは Drive セッション cookie は引き継がれないため、必要なら `Drive連携更新` は再実行する
- 保存先フォルダ ID は Firestore から復元するので、毎回入力し直さなくてよい設計に寄せる
