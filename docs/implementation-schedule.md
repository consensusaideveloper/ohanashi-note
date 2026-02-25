# 2日間実装スケジュール

## 前提

- 現状：IndexedDB（ブラウザローカル）にすべてのデータを保存
- 目標：Firebase Auth + Railway PostgreSQL + Cloudflare R2 に移行し、共有機能を追加
- 技術方針は [DATA_STORAGE_ARCHITECTURE.md](DATA_STORAGE_ARCHITECTURE.md) に準拠
- `lib/storage.ts` の関数シグネチャを維持 → hooks/componentsの変更なし

### 確定技術スタック

| 層 | 技術 |
|---|---|
| 認証 | Firebase Auth（Googleログイン） |
| サーバー | Hono on Railway |
| DB | PostgreSQL on Railway |
| メディア | Cloudflare R2 |
| ORM | Drizzle ORM |

---

## Day 1：認証 + サーバーサイド永続化

### 1-1. 外部サービスセットアップ（1h）

- [ ] Firebase プロジェクト作成（コンソール）
- [ ] Authentication 有効化（Google プロバイダ）
- [ ] Cloudflare R2 バケット作成（`ohanashi-media`）
- [ ] R2 APIトークン発行（S3互換アクセス用）
- [ ] Railway プロジェクト作成 + PostgreSQL 追加
- [ ] 環境変数設定（`.env`）
  ```
  # Firebase（クライアント用）
  VITE_FIREBASE_API_KEY=...
  VITE_FIREBASE_AUTH_DOMAIN=...
  VITE_FIREBASE_PROJECT_ID=...

  # Firebase Admin（サーバー用）
  FIREBASE_PROJECT_ID=...
  FIREBASE_CLIENT_EMAIL=...
  FIREBASE_PRIVATE_KEY=...

  # PostgreSQL
  DATABASE_URL=postgresql://...

  # Cloudflare R2
  R2_ACCOUNT_ID=...
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET_NAME=ohanashi-media
  ```

### 1-2. DB + ORM セットアップ（1.5h）

- [ ] `npm install drizzle-orm pg` + `npm install -D drizzle-kit @types/pg`
- [ ] `app/server/src/db/schema.ts` — Drizzle スキーマ定義
  - `users` テーブル（id, firebase_uid, name, character_id, font_size, timestamps）
  - `conversations` テーブル（全フィールド、JSONB活用）
  - `shares` テーブル（id, user_id, category_ids, expires_at）
- [ ] `app/server/src/lib/db.ts` — Drizzle クライアント初期化
- [ ] `drizzle.config.ts` — マイグレーション設定
- [ ] `npx drizzle-kit generate` → `npx drizzle-kit push` でテーブル作成
- [ ] `app/server/src/lib/config.ts` 更新 — DATABASE_URL, Firebase, R2の環境変数追加

### 1-3. 認証フロー実装（2h）

**クライアント側：**
- [ ] `npm install firebase`（クライアント）
- [ ] `app/client/src/lib/firebase.ts` — Firebase SDK初期化
- [ ] `app/client/src/lib/auth.ts` — Firebase Auth ラッパー
  - `signInWithGoogle(): Promise<User>`
  - `signOut(): Promise<void>`
  - `onAuthStateChanged(callback): Unsubscribe`
  - `getIdToken(): Promise<string>`
- [ ] `app/client/src/hooks/useAuth.ts` — 認証状態管理フック
- [ ] `app/client/src/components/AuthProvider.tsx` — Context Provider
- [ ] `app/client/src/components/LoginScreen.tsx` — ログイン画面
  - Googleログインボタン（大きく、わかりやすく）
  - 高齢者向けUI（大きいボタン、説明文付き）
- [ ] `App.tsx` に認証ガード追加（未ログインならLoginScreen表示）

**サーバー側：**
- [ ] `npm install firebase-admin`（サーバー）
- [ ] `app/server/src/lib/firebase-admin.ts` — Admin SDK初期化
- [ ] `app/server/src/middleware/auth.ts` — IDトークン検証ミドルウェア
  - `Authorization: Bearer <token>` → `verifyIdToken` → `userId` 注入
  - usersテーブルで自動作成（初回ログイン時）

### 1-4. サーバーAPI実装（2-3h）

- [ ] `app/client/src/lib/api.ts` — `fetchWithAuth` ヘルパー
- [ ] `app/server/src/routes/conversations.ts` — 会話CRUD
  - `GET /api/conversations` — 一覧取得（user_idフィルタ、started_at DESC）
  - `GET /api/conversations/:id` — 単一取得
  - `POST /api/conversations` — 新規作成
  - `PATCH /api/conversations/:id` — 部分更新（要約結果、音声メタデータ等）
  - `DELETE /api/conversations/:id` — 削除
- [ ] `app/server/src/routes/profile.ts` — プロフィール
  - `GET /api/profile` — 取得
  - `PUT /api/profile` — 更新
- [ ] `app/server/src/lib/r2.ts` — R2クライアント + 署名付きURL生成
  - `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
  - `POST /api/conversations/:id/audio/upload-url` — アップロード用署名付きURL
  - `GET /api/conversations/:id/audio/url` — ダウンロード用署名付きURL
- [ ] `app/server/src/index.ts` — 新ルートのマウント、認証ミドルウェア適用
- [ ] 既存 `/api/summarize` に認証ミドルウェア追加
- [ ] 既存 `/ws` にトークン検証追加

### 1-5. storage.ts 書き換え（1h）

- [ ] `app/client/src/lib/storage.ts` — 全関数の内部実装をAPI呼び出しに差し替え
  - 関数シグネチャは **完全に維持**
  - 内部: IndexedDB操作 → `fetchWithAuth('/api/...')` に置換
  - 音声関連: R2署名付きURL経由のアップロード/ダウンロード
  - `exportAllData` → `GET /api/export`
  - `clearAllData` → 全conversations削除 + R2オブジェクト削除
- [ ] IndexedDB関連コード（openDb, cachedDb等）を削除

### 1-6. 既存データ移行ユーティリティ（30min）

- [ ] `app/client/src/lib/migration.ts`
  - IndexedDB にデータが残っている場合、ログイン後にサーバーに一括移行
  - 音声ファイルはR2に直接アップロード
  - 移行完了後にIndexedDBをクリア
  - `localStorage.setItem('migration-completed', 'true')` で2回実行を防止

### 1-7. 動作確認 + バグ修正（1-1.5h）

- [ ] Googleログイン → ログアウト → 再ログイン
- [ ] 会話開始 → 会話終了 → 保存確認（PostgreSQLに保存されていること）
- [ ] 音声録音 → R2アップロード → 再生
- [ ] プロフィール保存・読み込み
- [ ] 会話履歴一覧表示
- [ ] エンディングノートビューでのデータ表示
- [ ] ログアウト → 再ログインでデータ維持確認

**Day 1 合計：約9-11h**

---

## Day 2：共有機能 + 閲覧ビュー + 印刷

### 2-1. 共有リンク生成API（1.5h）

- [ ] `app/server/src/routes/sharing.ts` — 共有API
  - `POST /api/shares` — 共有リンク生成（認証必須）
    - Input: `{ categoryIds?: string[], expiresInDays: number }`
    - sharesテーブルにINSERT
    - Output: `{ shareId, shareUrl, expiresAt }`
  - `GET /api/shares/:shareId` — 共有データ取得（**認証不要**）
    - shareId で shares テーブル検索
    - 有効期限チェック（期限切れなら403）
    - 該当ユーザーの conversations + noteEntries を結合して返却
    - Output: `{ ownerName, categories[], noteEntries[], createdAt }`
  - `DELETE /api/shares/:shareId` — 共有リンク無効化（認証必須）

### 2-2. 共有用読み取り専用ビュー（2-3h）

- [ ] `app/client/src/components/SharedNoteView.tsx` — 共有ノート閲覧画面
  - URL: `/#/share/{shareId}` （ハッシュルーティング）
  - 認証不要（誰でもリンクで閲覧可能）
  - ノート内容をカテゴリごとに表示
  - 作成者名、最終更新日表示
  - 「○○さんのエンディングノート」ヘッダー
  - 印刷ボタン
  - 高齢者の家族が見ることを想定した読みやすいレイアウト
  - 有効期限切れ時のメッセージ表示
- [ ] `App.tsx` にルーティング追加
  - URL hash に `/share/` が含まれる場合は SharedNoteView を表示
  - 認証ガードをバイパス

### 2-3. ノート共有UI（1.5h）

- [ ] `app/client/src/components/ShareDialog.tsx` — 共有ダイアログ
  - 共有するカテゴリの選択（全体 or カテゴリ個別）
  - 有効期限選択（7日 / 30日 / 90日）
  - 「共有リンクを作成」ボタン
  - リンク生成後：
    - URLコピーボタン
    - LINEで送るボタン（`https://line.me/R/share?text=...` URLスキーム）
    - QRコード表示（家族がスマホで読み取り）
- [ ] `EndingNoteView.tsx` に「家族に見せる」ボタン追加
- [ ] `SettingsScreen.tsx` に共有管理セクション追加
  - 作成済み共有リンク一覧
  - 無効化ボタン

### 2-4. 印刷対応レイアウト（1h）

- [ ] `app/client/src/components/PrintableNote.tsx` — 印刷用レイアウト
  - `@media print` CSS で画面を最適化
  - ヘッダー：作成者名、作成日、アプリ名
  - カテゴリごとにページ区切り（`page-break-before`）
  - 質問 + 回答の一覧表示
  - 未回答は「未記入」と表示
  - フッター：「このノートは「おはなし」で作成されました」
- [ ] SharedNoteView + EndingNoteView の両方から印刷可能に
- [ ] `app/client/src/app.css` に `@media print` スタイル追加

### 2-5. OGP（共有リンクのプレビュー）（30min）

- [ ] 共有リンクがLINE/メッセージで送られた時のプレビュー表示
  - サーバーサイドで `/share/:shareId` にアクセスした場合にOGPメタタグを返す
  - タイトル：「○○さんのエンディングノート」
  - 説明：「大切な想いをまとめたエンディングノートです」

### 2-6. QRコード生成（30min）

- [ ] 軽量QRコード生成（Canvas API or SVGベース、外部ライブラリなし）
- [ ] ShareDialog 内に表示
- [ ] 高齢者がスマホ画面を家族に見せてスキャンしてもらう想定

### 2-7. 動作確認 + バグ修正（1.5h）

- [ ] 共有リンク生成 → 別ブラウザ（未ログイン）で閲覧
- [ ] カテゴリ絞り込み共有
- [ ] 有効期限切れテスト
- [ ] 印刷プレビュー確認
- [ ] LINEで共有テスト
- [ ] QRコード読み取りテスト
- [ ] スマホ表示確認（共有ビュー）

**Day 2 合計：約8-10h**

---

## 補足：実装しないもの（スコープ外）

以下は今回の2日間では実装しない。行政書士のフィードバック後に検討。

| 機能 | 理由 |
|------|------|
| 家族アカウント連携 | 共有リンクで十分。アカウント連携は複雑すぎる |
| 更新通知（メール/LINE） | サーバーサイドのバッチ処理が必要。Phase 2 |
| コメント機能 | 共有ビューは読み取り専用で十分。Phase 2 |
| PDF出力 | ブラウザ印刷（Ctrl+P）で代用可能。Phase 2 |
| パスコード保護 | 有効期限付きリンクで最低限のセキュリティ確保 |
| 管理画面 | ユーザー数が少ない初期段階では不要 |
| オフラインキャッシュ | IndexedDBをキャッシュ層として復活させるのはPhase 2 |

---

## 技術的なリスクと対策

| リスク | 対策 |
|--------|------|
| API応答の遅延（IndexedDB→ネットワーク） | ローディングUI表示、楽観的更新は段階的に導入 |
| R2の署名付きURLアップロード失敗 | リトライ機構、失敗時はaudioAvailable=falseのまま |
| 認証トークン期限切れ | `onIdTokenChanged` で自動リフレッシュ、fetchWithAuthで自動再取得 |
| IndexedDB→PostgreSQL移行中のデータ不整合 | 移行は全か無（成功したらクリア、失敗したら維持） |
| 共有リンクの不正アクセス | 有効期限 + UUID v4（推測困難）で対応 |
| Drizzleのセットアップに時間がかかる | スキーマは事前定義済み、pushで即座に反映 |

---

## 完成後の価値提供フロー

```
[Day 1 で実現]
高齢者がGoogleでログイン → 会話 → ノート自動作成 → サーバーに保存
  → デバイスを変えてもデータが残る

[Day 2 で実現]
ノートが完成 → 「家族に見せる」ボタン → カテゴリ選択 → 共有リンク生成
  → LINEで家族に送信（またはQRコードを見せる）
  → 家族がリンクを開いてノートを閲覧（ログイン不要）
  → 家族が印刷して紙で保管も可能
```

> **これにより「作る→伝わる」の最小限のループが完成する。**

---

## 新規パッケージ一覧

### サーバー（app/server）

| パッケージ | 用途 |
|-----------|------|
| `drizzle-orm` | ORM |
| `pg` | PostgreSQLドライバ |
| `firebase-admin` | IDトークン検証 |
| `@aws-sdk/client-s3` | R2操作（S3互換） |
| `@aws-sdk/s3-request-presigner` | 署名付きURL生成 |
| `drizzle-kit` (dev) | マイグレーション管理 |
| `@types/pg` (dev) | 型定義 |

### クライアント（app/client）

| パッケージ | 用途 |
|-----------|------|
| `firebase` | Auth SDK |
