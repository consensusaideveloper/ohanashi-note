# データ保存アーキテクチャ（確定版）

> **ステータス: 確定** — 2025-02-25
> このドキュメントは実装の根拠となる正式な技術方針書である。

---

## 1. 技術スタック

| 層 | 技術 | 選定理由 |
|---|---|---|
| 認証 | **Firebase Auth** | Googleログインの信頼性、完全無料、Auth単体のロックインは軽微（返すのはUID+JWTのみ） |
| アプリサーバー | **Hono on Railway** | 既存実装の延長、WebSocket対応、DB同一ネットワーク |
| データベース | **PostgreSQL on Railway** | 業界標準SQL、JSONB対応、`pg_dump`でどこにでも移行可能 |
| メディアストレージ | **Cloudflare R2** | エグレス完全無料、S3互換API、署名付きURLで直接配信 |
| ORM | **Drizzle ORM** | 型安全、軽量、マイグレーション内蔵、標準SQLに近い記法 |

### 選定の原則

> **「変えにくい部分は信頼性で選び、変えたくなる部分はポータビリティで選ぶ」**

- 認証は最も変えにくい → 最も信頼できるFirebase Auth
- DBは最も変えたくなりうる → 最もポータブルなPostgreSQL
- メディアは量に比例してコストが増す → エグレス無料のR2
- AuthとDBを別サービスにすることで、片方に問題が生じても独立して差し替え可能

---

## 1.1. 各技術の選定根拠と不採用理由

### 認証：Firebase Auth を選んだ理由

**なぜFirebase Authか：**
- Googleログインの実装で **10年以上の実績** がある最も成熟したサービス
- **完全無料**（MAU無制限、他サービスは上限あり）
- SDK品質が高く、IDトークンの自動リフレッシュ等が組み込み済み
- Auth **単体** で使う限りロックインは軽微（返すのはUID文字列とJWTだけ）

**なぜ他を選ばなかったか：**

| 代替 | 不採用理由 |
|------|-----------|
| **Supabase Auth** | Googleログインは動作するが、Firebase Authほどの実績・安定性がない。MAU 5万人上限（Freeプラン）。このプロジェクトではSupabase DBを使わないため、Authだけのために導入するメリットが薄い |
| **Clerk** | 優秀なサービスだが、MAU 1万人上限（Freeプラン）。独自SDKへの依存度が高い。日本での利用実績が少ない |
| **Auth0** | エンタープライズ向けで高機能だが、個人開発のMVPにはオーバースペック。無料枠が7,500MAUと小さい。料金が読みにくい |
| **自前実装** | セキュリティリスクが高すぎる。パスワード管理、トークン管理、OAuth実装を自分でやるべきではない |

### データベース：Railway PostgreSQL を選んだ理由

**なぜPostgreSQLか：**
- **30年の歴史を持つ業界標準** — どのクラウドでも動く、どのORMでも対応、エンジニアなら誰でも触れる
- **JSONB型** により、NoSQLの柔軟さ（ネストしたtranscript配列等）とSQLの堅さ（共有・家族のリレーション）を両立
- **`pg_dump` 一発でどこにでも移行可能** — Neon、AWS RDS、Supabase、自前サーバーのどれにも持っていける
- 将来の共有・家族機能で必要なリレーショナルクエリ（JOIN、サブクエリ）が自然に書ける

**なぜRailway上に置くか：**
- **Honoサーバーと同一ネットワーク** — サーバー↔DB間のレイテンシが最小
- **1つのプラットフォームで管理が完結** — DB+サーバーをまとめて管理できる
- Hobby $5/月（$5クレジット付きで実質無料）。PostgreSQLはプランに含まれる

**なぜ他を選ばなかったか：**

| 代替 | 不採用理由 |
|------|-----------|
| **Firestore（Firebase）** | **ロックインが深い。** Firestoreの独自クエリ言語にコード全体が依存し、他DBへの移行にはクエリ全書き換え+データ変換が必要（数日〜1週間の作業）。JOINやサブクエリがなく、共有・家族機能のリレーションが複雑化する。Security Rulesが肥大化しやすい。reads/writes課金でコスト予測が困難 |
| **Supabase（PostgreSQL）** | PostgreSQL自体は良いが、**このプロジェクトにはHonoサーバーがすでにある**。Supabaseの強み（自動REST API生成、クライアント直接接続、RLS）をほぼ使わず、「ホスティングされたPostgreSQL」としてしか使わないのでオーバースペック。さらにサーバーとDBが別ネットワークになるためレイテンシが増す |
| **Neon（サーバーレスPostgreSQL）** | 技術的には良い選択肢。ただしサーバーがRailwayにあるなら、同じRailway上にDBを置いたほうがネットワーク効率が良い。Neonはサーバーレス（コールドスタートあり）なので常時接続のサーバーとの相性がやや劣る |
| **Cloudflare D1** | SQLite系で安価だが、成熟度がまだ低い。Cloudflare Workers環境への移行が必要で、現在のNode.js + WebSocketアーキテクチャとの互換性に課題がある |

### メディアストレージ：Cloudflare R2 を選んだ理由

**なぜメディアファイルをDBに入れないか：**
- 音声ファイルは **1件あたり1-10MB** ある
- DBに入れるとストレージ容量を圧迫し、一覧取得やバックアップが肥大化する
- メディアファイルはオブジェクトストレージに保存するのが業界標準

**なぜR2か：**
- **エグレス（ダウンロード）が完全無料** — これが最大の理由
- 音声ファイルは再生のたびにダウンロードが発生する。ユーザーが増え、過去の会話を聞き返す頻度が増えると、エグレス課金のあるサービスではコストが予測困難になる
- **S3互換API** — AWS SDKがそのまま使える。他のS3互換ストレージにいつでも移行可能
- 署名付きURLでサーバーを経由せず直接配信できる → サーバーの帯域を消費しない
- 無料枠が十分（10GBストレージ、100万PUT/月、1000万GET/月）

**なぜ他を選ばなかったか：**

| 代替 | 不採用理由 |
|------|-----------|
| **Firebase Cloud Storage** | **エグレスに$0.12/GBの課金がある。** 月100ユーザーが各5回音声を再生するだけで数GBのエグレスが発生し、R2なら無料のところ月数ドルかかる。スケールするほどコスト差が広がる。さらにFirebase独自SDKに依存するため、他のストレージへの移行時にコード書き換えが必要 |
| **AWS S3** | 最も実績があるが、**エグレスが$0.09/GB**。R2と同じS3互換APIなので、R2で始めてS3に移行する（またはその逆）はコード変更なしで可能。コストメリットがないのに最初からS3を選ぶ理由がない |
| **Supabase Storage** | S3互換で悪くないが、Supabase DB自体を使わないため単体利用する意味が薄い。エグレスも従量課金 |
| **Railway Volume** | ファイルストレージ専用ではなく、大容量メディアには不向き。CDN配信やS3互換APIもない。スケーラビリティに制約がある |

### ORM：Drizzle ORM を選んだ理由

**なぜORMを使うか：**
- 生SQLだとTypeScript型とクエリ結果の型の手動管理が必要で、型安全性が低下する
- ORMを使えばスキーマ定義から型が自動生成され、クエリも型安全になる
- マイグレーション管理が必要（テーブル追加・変更時）

**なぜDrizzleか：**
- **軽量** — Prismaの約1/10のバンドルサイズ。サーバーの起動が速い
- **型安全** — スキーマ定義からTypeScript型が自動推論される
- **SQLに近い記法** — 学習コストが低く、生SQLに近い直感的な書き方
- **マイグレーション内蔵** — `drizzle-kit` でスキーマ変更からSQLマイグレーションを自動生成
- **JSONB型のサポートが充実** — transcript、noteEntries等のJSONBカラムを型安全に扱える
- ロックインなし — 生成されるSQLは標準PostgreSQLそのもの

**なぜ他を選ばなかったか：**

| 代替 | 不採用理由 |
|------|-----------|
| **Prisma** | 高機能だが**重い**（バンドルサイズ大、独自のクエリエンジン）。サーバー起動が遅くなる。生成されるSQLが複雑で最適化しにくい |
| **Kysely** | 型安全なクエリビルダーとして優秀だが、**マイグレーション機能が組み込まれていない**。別途マイグレーションツールが必要で、2日間の実装では管理コストが増える |
| **生pg（node-postgres）** | 最も軽量だが、型安全性の手動管理とマイグレーション管理を自分でやる必要がある。小規模でも将来のテーブル追加を考えるとORM導入のほうが効率的 |

---

## 2. システムアーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│                    クライアント                        │
│  React 19 + Vite + Firebase Auth SDK                 │
│                                                      │
│  storage.ts ──→ fetchWithAuth() ──→ サーバーAPI       │
│  音声アップロード ──→ R2署名付きURL ──→ R2直接PUT      │
│  音声再生 ──→ R2署名付きURL ──→ R2直接GET             │
└─────────────┬───────────────────────────┬────────────┘
              │ Authorization: Bearer     │ 直接通信
              │ <Firebase IDトークン>      │（サーバー不経由）
              ▼                           ▼
┌──────────────────────────┐    ┌──────────────────┐
│   Hono サーバー (Railway)  │    │  Cloudflare R2   │
│                          │    │  (メディア保存)    │
│  middleware/auth.ts       │    │                  │
│   └→ firebase-admin      │    │  audio/{userId}/ │
│       .verifyIdToken()   │    │   {convId}.webm  │
│                          │    └──────────────────┘
│  routes/                 │
│   ├ conversations.ts     │
│   ├ profile.ts           │
│   ├ sharing.ts           │
│   ├ summarize.ts（既存）  │
│   └ ws.ts（既存）         │
│                          │
│  lib/db.ts (Drizzle)     │
│      │                   │
└──────┼───────────────────┘
       │ DATABASE_URL
       ▼
┌──────────────────────────┐
│  PostgreSQL (Railway)     │
│                          │
│  users                   │
│  conversations           │
│  shares                  │
└──────────────────────────┘
```

### データフロー

```
[会話の保存フロー]
1. Client: 会話終了 → POST /api/conversations（transcript保存）
2. Client: POST /api/summarize（要約リクエスト）
3. Server: OpenAI API呼び出し → 要約結果返却
4. Client: PATCH /api/conversations/:id（要約結果で更新）
5. Client: POST /api/conversations/:id/audio/upload-url → 署名付きURL取得
6. Client: PUT <署名付きURL>（R2に音声を直接アップロード）
7. Client: PATCH /api/conversations/:id（audioAvailable=true, audioHash更新）

[音声再生フロー]
1. Client: GET /api/conversations/:id/audio/url
2. Server: R2署名付き読み取りURL生成（有効期限1h）
3. Client: 署名付きURLから直接ダウンロード・再生

[共有フロー]
1. 作成者: POST /api/shares（カテゴリ選択、有効期限設定）
2. 作成者: 生成されたURLをLINE等で家族に送信
3. 家族: GET /api/shares/:id（認証不要、期限チェックのみ）
4. 家族: ノート内容を閲覧・印刷
```

---

## 3. PostgreSQL スキーマ

### users テーブル

Firebase Auth UIDと内部IDを紐づける。プロフィール情報もここに保持。

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  character_id TEXT,
  font_size TEXT NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### conversations テーブル

会話記録の本体。transcript・noteEntries・keyPointsはJSONBで柔軟に保持。

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT,                                -- null = ガイドモード
  character_id TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,

  -- 会話内容
  transcript JSONB NOT NULL DEFAULT '[]',       -- [{role, text, timestamp}]
  summary TEXT,
  summary_status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed

  -- AI抽出結果
  covered_question_ids TEXT[] DEFAULT '{}',
  note_entries JSONB DEFAULT '[]',              -- [{questionId, questionTitle, answer}]
  one_liner_summary TEXT,
  emotion_analysis TEXT,
  discussed_categories TEXT[] DEFAULT '{}',
  key_points JSONB,                             -- {importantStatements[], decisions[], undecidedItems[]}
  topic_adherence TEXT,                         -- high | medium | low
  off_topic_summary TEXT,

  -- 音声メタデータ（実体はR2）
  audio_available BOOLEAN NOT NULL DEFAULT false,
  audio_storage_key TEXT,                       -- R2上のオブジェクトキー
  audio_mime_type TEXT,

  -- 整合性検証
  integrity_hash TEXT,                          -- SHA-256（内容のハッシュ）
  audio_hash TEXT,                              -- SHA-256（音声のハッシュ）
  integrity_hashed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_user_started ON conversations(user_id, started_at DESC);
CREATE INDEX idx_conversations_user_category ON conversations(user_id, category);
```

### shares テーブル

共有リンクの管理。有効期限付き、カテゴリ絞り込み対応。

```sql
CREATE TABLE shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_ids TEXT[],                          -- null = 全カテゴリ
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### TypeScript → PostgreSQL 型マッピング

| TypeScript型 | PostgreSQLカラム型 | 備考 |
|---|---|---|
| `string` (UUID) | `UUID` | 主キー |
| `string` | `TEXT` | 制約なし文字列 |
| `number` (epoch ms) | `TIMESTAMPTZ` | サーバー側でDate変換 |
| `TranscriptEntry[]` | `JSONB` | ネストした配列 |
| `NoteEntry[]` | `JSONB` | ネストした配列 |
| `KeyPoints` | `JSONB` | ネストしたオブジェクト |
| `string[]` | `TEXT[]` | PostgreSQL配列 |
| `boolean` | `BOOLEAN` | |
| `QuestionCategory \| null` | `TEXT` (nullable) | null = ガイドモード |

---

## 4. サーバーAPI設計

### 認証ミドルウェア

```typescript
// middleware/auth.ts
// 1. Authorization: Bearer <token> ヘッダーからIDトークンを取得
// 2. firebase-admin.verifyIdToken(token) で検証
// 3. firebase_uid でusersテーブル検索、なければ自動作成
// 4. c.set('userId', user.id) でリクエストコンテキストに注入
```

### エンドポイント一覧

#### 認証必須

| メソッド | パス | 処理 | リクエスト | レスポンス |
|---------|------|------|-----------|-----------|
| GET | `/api/conversations` | 一覧取得 | query: `category?` | `ConversationRecord[]` |
| GET | `/api/conversations/:id` | 単一取得 | — | `ConversationRecord` |
| POST | `/api/conversations` | 新規作成 | body: `ConversationRecord` | `{ id }` |
| PATCH | `/api/conversations/:id` | 部分更新 | body: `Partial<ConversationRecord>` | `{ ok: true }` |
| DELETE | `/api/conversations/:id` | 削除 | — | `{ ok: true }` |
| POST | `/api/conversations/:id/audio/upload-url` | 音声アップロードURL発行 | body: `{ mimeType }` | `{ uploadUrl, storageKey }` |
| GET | `/api/conversations/:id/audio/url` | 音声ダウンロードURL発行 | — | `{ downloadUrl }` |
| GET | `/api/profile` | プロフィール取得 | — | `UserProfile` |
| PUT | `/api/profile` | プロフィール更新 | body: `UserProfile` | `{ ok: true }` |
| POST | `/api/shares` | 共有リンク生成 | body: `{ categoryIds?, expiresInDays }` | `{ shareId, shareUrl }` |
| DELETE | `/api/shares/:id` | 共有リンク無効化 | — | `{ ok: true }` |
| GET | `/api/export` | 全データエクスポート | — | `ExportData (JSON)` |
| POST | `/api/summarize` | 会話要約（既存） | body: `{ category, transcript, ... }` | `SummarizeResult` |
| GET | `/ws` | WebSocket（既存） | query: `token` | WebSocket接続 |

#### 認証不要（公開）

| メソッド | パス | 処理 | レスポンス |
|---------|------|------|-----------|
| GET | `/api/shares/:id` | 共有データ取得 | `{ ownerName, categories[], noteEntries[], createdAt }` |
| GET | `/health` | ヘルスチェック（既存） | `{ status, timestamp }` |

### レスポンスのデータ変換

サーバーはPostgreSQLのsnake_case列名をクライアントのcamelCaseに変換して返す。
Drizzle ORMのカラム定義でTypeScript名を指定できるため、自動的にマッピング。

```typescript
// Drizzle スキーマ例
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  summaryStatus: text('summary_status').notNull().default('pending'),
  noteEntries: jsonb('note_entries').default([]),
  // ...
});
```

---

## 5. メディアストレージ（Cloudflare R2）

### R2設定

```
バケット名: ohanashi-media
リージョン: APAC（自動）
```

### オブジェクトキー構造

```
audio/{userId}/{conversationId}.webm
video/{userId}/{messageId}.webm          ← 将来拡張
```

### 署名付きURL方式

**なぜサーバープロキシではなく署名付きURLか：**

1. サーバーの帯域を消費しない（音声ファイルは1-10MB/件）
2. R2のエグレス無料が活きる（サーバー経由だとRailwayの帯域を消費）
3. クライアントから直接アップロード/ダウンロードで高速

**アップロードフロー：**

```typescript
// 1. サーバーから署名付きURLを取得
const { uploadUrl, storageKey } = await fetchWithAuth(
  `/api/conversations/${id}/audio/upload-url`,
  { method: 'POST', body: JSON.stringify({ mimeType: 'audio/webm' }) }
);

// 2. R2に直接アップロード（認証不要、署名付きURLに権限が含まれる）
await fetch(uploadUrl, {
  method: 'PUT',
  body: audioBlob,
  headers: { 'Content-Type': 'audio/webm' },
});

// 3. メタデータを更新
await fetchWithAuth(`/api/conversations/${id}`, {
  method: 'PATCH',
  body: JSON.stringify({ audioAvailable: true, audioStorageKey: storageKey }),
});
```

**署名付きURL生成（サーバー側）：**

```typescript
// @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner を使用
// R2はS3互換APIなのでAWS SDKがそのまま使える
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
});

// アップロード用（有効期限10分）
const uploadUrl = await getSignedUrl(r2,
  new PutObjectCommand({ Bucket: 'ohanashi-media', Key: storageKey }),
  { expiresIn: 600 }
);

// ダウンロード用（有効期限1時間）
const downloadUrl = await getSignedUrl(r2,
  new GetObjectCommand({ Bucket: 'ohanashi-media', Key: storageKey }),
  { expiresIn: 3600 }
);
```

### コスト見積もり

| 項目 | 無料枠 | 月100ユーザー時 |
|------|--------|----------------|
| ストレージ | 10GB | ~5GB（50会話/人 × 5MB） → 無料枠内 |
| Class A操作（PUT） | 100万/月 | ~5,000回 → 無料枠内 |
| Class B操作（GET） | 1,000万/月 | ~10,000回 → 無料枠内 |
| エグレス | **無料** | **無料** |

---

## 6. storage.ts 書き換え戦略

### 方針

**関数シグネチャを完全に維持し、内部実装だけをAPI呼び出しに差し替える。**

これにより以下のファイルは **変更不要**：
- `useConversation.ts`（7つのstorage関数を使用）
- `useEndingNote.ts`（`listConversations`を使用）
- `FontSizeContext.tsx`（`getUserProfile`, `saveUserProfile`を使用）
- `ConversationHistory.tsx`（`listConversations`を使用）
- `ConversationDetail.tsx`（`getConversation`, `getAudioRecording`を使用）
- `SettingsScreen.tsx`（6つのstorage関数を使用）

### 新しいstorage.tsの構造

```typescript
import { fetchWithAuth } from './api';
import type { ConversationRecord, AudioRecording, UserProfile, ... } from '../types/conversation';

// --- 会話 ---
export function saveConversation(record: ConversationRecord): Promise<void> {
  return fetchWithAuth('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(record),
  }).then(() => undefined);
}

export function updateConversation(id: string, updates: Partial<ConversationRecord>): Promise<void> {
  return fetchWithAuth(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }).then(() => undefined);
}

export function getConversation(id: string): Promise<ConversationRecord | null> {
  return fetchWithAuth(`/api/conversations/${id}`)
    .then(res => res.status === 404 ? null : res.json());
}

export function listConversations(): Promise<ConversationRecord[]> {
  return fetchWithAuth('/api/conversations').then(res => res.json());
}

// ... 他の関数も同様のパターン

// --- 音声（R2署名付きURL経由） ---
export function saveAudioRecording(
  conversationId: string, blob: Blob, mimeType: string
): Promise<void> {
  // 1. 署名付きURL取得
  // 2. R2に直接アップロード
  // 3. メタデータ更新
}

export function getAudioRecording(conversationId: string): Promise<AudioRecording | null> {
  // 1. 署名付き読み取りURL取得
  // 2. R2から直接ダウンロード
  // 3. Blob化して返却
}
```

### fetchWithAuth ヘルパー

```typescript
// lib/api.ts
import { getIdToken } from './auth';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export async function fetchWithAuth(path: string, options?: RequestInit): Promise<Response> {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`API error: ${res.status}`);
  }
  return res;
}
```

---

## 7. 認証統合

### クライアント側

```
lib/firebase.ts     — Firebase SDK初期化（initializeApp）
lib/auth.ts         — signInWithGoogle, signOut, onAuthStateChanged, getIdToken
hooks/useAuth.ts    — user, loading, signIn, signOut を公開するReactフック
components/
  AuthProvider.tsx  — Contextで認証状態を全コンポーネントに提供
  LoginScreen.tsx   — Googleログインボタン（高齢者向け大きいUI）
```

### サーバー側

```
lib/firebase-admin.ts  — Admin SDK初期化（cert使用）
middleware/auth.ts      — IDトークン検証 → userId注入
```

### 認証フロー

```
1. Client: signInWithGoogle() → Firebase Auth → IDトークン取得
2. Client: fetchWithAuth() → Authorization: Bearer <token>
3. Server: middleware/auth.ts → verifyIdToken(token) → firebase_uid取得
4. Server: SELECT * FROM users WHERE firebase_uid = $1
   → なければ INSERT（自動作成）
5. Server: c.set('userId', user.id) → 以降のルートで使用可能
```

---

## 8. IndexedDB → PostgreSQL 移行戦略

### 方針

初回ログイン時にIndexedDBのデータをサーバーに一括移行し、移行後はIndexedDBを使わない。

### 移行フロー

```
1. ログイン完了
2. localStorage.getItem('migration-completed') をチェック
3. 未移行の場合:
   a. IndexedDB から全データ読み込み（conversations, audio, profile）
   b. POST /api/import で一括送信
   c. 成功したら localStorage.setItem('migration-completed', 'true')
   d. IndexedDB をクリア
4. 移行済みの場合: スキップ
```

### 移行しない場合（新規ユーザー）

IndexedDBにデータがなければ移行処理は何もしない。

---

## 9. コスト見積もり（月100ユーザー規模）

| サービス | 項目 | コスト |
|---------|------|-------|
| Firebase Auth | Googleログイン | **無料** |
| Railway | Hobbyプラン | **$5/月**（$5クレジットで実質無料） |
| Railway PostgreSQL | 含む | Hobbyプランに含まれる |
| Cloudflare R2 | ストレージ + 操作 | **無料枠内** |
| **合計** | | **$0〜5/月** |

### スケール後（月1,000ユーザー）

| サービス | コスト |
|---------|-------|
| Firebase Auth | 無料 |
| Railway Pro | $20/月 |
| R2 | $1-3/月（50GB程度） |
| **合計** | **$21〜23/月** |

---

## 10. ポータビリティ（移行容易性）

| コンポーネント | 移行先の例 | 作業量 | 手順 |
|--------------|-----------|--------|------|
| PostgreSQL | Neon, AWS RDS, Supabase, 自前 | 30分 | `pg_dump` → `pg_restore` + DATABASE_URL変更 |
| R2 | AWS S3, Supabase Storage | 1-2h | `rclone sync` + エンドポイント変更 |
| Firebase Auth | — | 不要 | Auth単体なので移行の必要性が低い |
| Honoサーバー | Fly.io, Render, Cloudflare Workers | 1-2h | デプロイ設定変更のみ |

---

## 11. セキュリティ

| 対象 | 対策 |
|------|------|
| APIアクセス | 全エンドポイントにFirebase IDトークン検証（共有ビューを除く） |
| DB | ユーザー分離（全クエリに `WHERE user_id = $1`） |
| R2 | 署名付きURL（有効期限付き）、直接アクセス不可 |
| 共有リンク | ランダムUUID + 有効期限、推測困難 |
| WebSocket | 接続時にIDトークン検証 + 既存のOrigin/レート制限 |
| 機密データ | 既存のサニタイゼーション（クレカ番号等のマスキング）を維持 |

---

## 12. 将来の拡張ポイント

| 機能 | 実装方針 |
|------|---------|
| 家族アカウント連携 | `family_members` テーブル追加、RLS的な権限チェック |
| 動画メッセージ | R2の `video/{userId}/` に保存、同じ署名付きURL方式 |
| 更新通知 | `notification_settings` テーブル + バッチ処理 or Webhook |
| PDF出力 | サーバーサイドでPDF生成（`@react-pdf/renderer` 等） |
| オフラインキャッシュ | Service Worker + IndexedDBをキャッシュ層として復活 |
| 全文検索 | PostgreSQLの `tsvector` + GINインデックス |
