# データ保存の技術選定（検討過程の記録）

> **注意: このドキュメントは検討過程の記録です。**
> **確定した方針は [DATA_STORAGE_ARCHITECTURE.md](DATA_STORAGE_ARCHITECTURE.md) を参照してください。**

## 1. 現状のデータ特性

### 保存するデータの性質

| データ | 形式 | サイズ目安 | アクセスパターン |
|--------|------|-----------|----------------|
| ConversationRecord | ネストしたJSON（transcript[], noteEntries[], keyPoints） | 1件あたり10-50KB | 一覧取得、単一取得、部分更新 |
| 音声ファイル | Blob（webm/opus） | 1件あたり1-5MB（15-20分の会話） | 書き込み1回、読み取りは稀 |
| UserProfile | フラットなJSON | 数百バイト | 頻繁に読み取り |
| **将来：共有リンク** | リレーション（ユーザー↔共有先） | 小さい | URLからの取得 |
| **将来：家族関係** | リレーション（ユーザー↔家族） | 小さい | 権限チェック |

### 重要な観察

- **ConversationRecordはドキュメント指向**：ネストした配列を含む、JOIN不要で1ドキュメントで完結
- **しかし将来の共有・家族機能はリレーショナル**：ユーザー間の関係、アクセス権限の管理が必要
- **音声ファイルは他のデータと分離すべき**：サイズが大きく、アクセス頻度が低い
- **ユーザー数は当面少数**：β版で数十人規模、本運用でも数百〜数千人

---

## 2. 選択肢の比較

### 認証（Auth）の選択肢

| | Firebase Auth | Supabase Auth | Clerk |
|---|---|---|---|
| Googleログイン | ◎ 最も成熟 | ○ 動作するが実績少 | ◎ 優秀 |
| 無料枠 | 無制限 | 月5万MAU | 月1万MAU |
| SDK品質 | ◎ 非常に安定 | ○ 良好 | ◎ 優秀 |
| ロックイン | △ Firebase SDKに依存するが、Authだけなら影響小 | ○ 標準的JWT | △ 独自SDK |
| 日本語対応 | ○ UIのカスタマイズ可 | ○ 同様 | ○ 同様 |
| 実装工数 | 2h | 2h | 2-3h |

**結論：認証はFirebase Auth一択に近い。** 無料・成熟・Google loginの実績が圧倒的。Auth単体での利用ならロックインリスクも低い（返すのはUID文字列とJWTだけ）。

---

### データベースの選択肢

ここが最も重要な判断ポイント。

#### A. Firestore（Firebase）— NoSQL ドキュメントDB

```
users/{uid}/conversations/{id} → ConversationRecord（JSON）
users/{uid}/profile → UserProfile
shares/{shareId} → 共有設定
```

**メリット：**
- Firebase Authとの統合が最もシームレス（Security Rulesで直接uid参照）
- ドキュメント指向のデータモデルに自然にフィット
- リアルタイムリスナーが標準装備（`onSnapshot`）
- 無料枠：1GiB保存、5万reads/日、2万writes/日
- 実装が最速（1-2h）
- 日本リージョン（asia-northeast1）あり

**デメリット：**
- **ロックイン度：高**。Firestoreの独自クエリ言語・データモデルに依存。他DBへの移行にはデータ変換+クエリ書き換えが必要
- **クエリ制限**：JOINなし、サブクエリなし、1クエリ内のOR条件に制限あり
- **共有機能が複雑化**：Security Rulesで「共有リンク経由のアクセス」を表現するとルールが肥大化
- **コスト予測が難しい**：reads/writes課金は使い方次第で急増しうる（一覧表示で全件readなど）
- **部分更新の制約**：ネストしたフィールドの更新にはドット記法が必要

**コスト（Blaze従量課金）：**
| 項目 | 単価 |
|------|------|
| ドキュメント読み取り | $0.06/10万件 |
| ドキュメント書き込み | $0.18/10万件 |
| ストレージ | $0.18/GiB/月 |

月100ユーザー × 1日5会話 × 30日 = 15,000 writes + 読み取り数万 → **ほぼ無料枠内**

---

#### B. Supabase（PostgreSQL）— リレーショナルDB

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  category TEXT,
  character_id TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  transcript JSONB,        -- ネストしたデータはJSONBで保持
  summary TEXT,
  note_entries JSONB,
  key_points JSONB,
  ...
);

CREATE TABLE shares (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  category_ids TEXT[],
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

**メリット：**
- **ロックイン度：最低**。PostgreSQLは業界標準。Supabase→Neon→AWS RDS→自前サーバー、どこにでも持っていける
- **JSONB型でドキュメント指向にも対応**：transcript、noteEntriesなどはJSONBカラムに格納。NoSQLの柔軟さとSQLの堅さを両立
- **共有機能が自然に書ける**：Row Level Security（RLS）で「このshare_idが有効なら読める」を1行で表現
- **将来の家族機能が容易**：リレーション（family_members テーブル）を追加するだけ
- **SQLが使える**：複雑な集計、分析、レポートが標準SQL
- **Storage付き**：S3互換のファイルストレージが統合済み
- 無料枠：500MB DB、1GB Storage、月5万MAU

**デメリット：**
- Firebase Authとの統合に一手間必要（JWTカスタム設定 or Supabase Auth併用）
- リアルタイムリスナーはあるが、Firestoreほどシームレスではない
- Supabaseのホスティング障害リスク（ただしDBは標準Postgresなので移行可能）
- 若干のSQLスキーマ設計が必要（とはいえJSONBで柔軟に対応可）

**コスト：**
| プラン | 月額 | DB容量 | Storage | 備考 |
|--------|------|--------|---------|------|
| Free | $0 | 500MB | 1GB | プロジェクト2つまで |
| Pro | $25 | 8GB | 100GB | 本番運用向け |

月100ユーザー規模なら → **Free枠で十分**

---

#### C. Cloudflare D1 + R2 — エッジSQLite + オブジェクトストレージ

```
D1: SQLiteベースのサーバーレスDB（エッジで動作）
R2: S3互換ストレージ（エグレス料金ゼロ）
```

**メリット：**
- **コスト最安**：D1は月500万reads無料、R2はエグレス完全無料
- **Honoがネイティブ対応**：Cloudflare Workers上でHonoをそのまま動かせる
- **音声ファイルのコスト**：R2のエグレス無料は音声配信に理想的
- **エッジで低レイテンシー**

**デメリット：**
- **D1はまだ成熟度が低い**：本番利用の実績が限られる
- **Workers環境への移行が必要**：現在のNode.jsサーバーとは互換性に注意が必要
- **WebSocketのWorkers対応**：OpenAI Realtime APIリレーの実装を書き直す可能性
- **Firebase Authとの統合が手動**：JWTを自分でパースする必要あり

**コスト：**
| 項目 | 無料枠 | 有料 |
|------|--------|------|
| D1 reads | 500万/月 | $0.001/100万 |
| D1 writes | 10万/月 | $1.00/100万 |
| D1 storage | 5GB | $0.75/GB/月 |
| R2 storage | 10GB | $0.015/GB/月 |
| R2 egress | **無料** | **無料** |

---

#### D. Turso（libSQL/分散SQLite）

**メリット：**
- 非常に安価、エッジ対応
- SQLite互換で軽量

**デメリット：**
- エコシステムが小さい、日本での利用実績少
- Firebase Authとの統合は手動
- 2日間の実装にはリスクが高い

→ **現時点では選択肢から外す**

---

## 3. 組み合わせパターン

### パターン1：Firebase全部入り

```
Auth: Firebase Auth
DB:   Firestore
File: Cloud Storage for Firebase
```

| 項目 | 評価 |
|------|------|
| 実装速度 | ◎ 最速（SDK統合済み） |
| ロックイン | ✗ 高い（Firestore脱出が大変） |
| 共有機能 | △ Security Rulesが複雑化 |
| 家族機能拡張 | △ NoSQLでリレーション管理は辛い |
| コスト（初期） | ◎ 無料枠で十分 |
| コスト（スケール後） | △ reads/writes課金が予測困難 |
| 方針転換時 | ✗ DB移行コストが大きい |

**向いている場合：** とにかく速く出したい。将来のDB移行を受け入れる覚悟がある。

---

### パターン2：Firebase Auth + Supabase（DB + Storage）

```
Auth: Firebase Auth（Googleログイン）
DB:   Supabase（PostgreSQL）
File: Supabase Storage
```

| 項目 | 評価 |
|------|------|
| 実装速度 | ○ AuthとDBの連携に+1-2h |
| ロックイン | ◎ 最低（Postgres + S3互換、どこにでも移行可能） |
| 共有機能 | ◎ RLSで自然に実装 |
| 家族機能拡張 | ◎ リレーションを追加するだけ |
| コスト（初期） | ◎ 両方無料枠で収まる |
| コスト（スケール後） | ○ Supabase Pro $25/月〜、予測可能 |
| 方針転換時 | ◎ pg_dumpでどこにでも持ち出せる |

**Firebase AuthとSupabase DBの連携方法：**
```
1. Firebase Auth でログイン → IDトークン取得
2. サーバーで firebase-admin.verifyIdToken() → uid確認
3. Supabase にはサーバーサイド（service_role key）で接続
4. uid をWHERE条件で使用
```

サーバーサイドでDB操作する設計なら、AuthとDBの連携は単純。クライアントから直接Supabaseを叩く場合はJWTのカスタム設定が必要になるが、**現在の設計（Honoサーバー経由）ならこの問題は発生しない**。

**向いている場合：** 方針転換の可能性を残したい。共有・家族機能を見据えている。

---

### パターン3：Supabase全部入り

```
Auth: Supabase Auth
DB:   Supabase（PostgreSQL）
File: Supabase Storage
```

| 項目 | 評価 |
|------|------|
| 実装速度 | ○ 統合済みで速い |
| ロックイン | ○ Postgres部分は移行可、Auth部分はSupabase依存 |
| 共有機能 | ◎ RLS + Auth統合が最もシンプル |
| 家族機能拡張 | ◎ 同上 |
| コスト（初期） | ◎ 無料枠で十分 |
| コスト（スケール後） | ○ Pro $25/月〜 |
| 方針転換時 | ○ DB移行は容易、Auth移行にはコスト |

**パターン2との違い：** Supabase AuthのGoogleログインは動作するが、Firebase Authほどの実績・安定性はない。一方、RLSとの統合はシームレス。

**向いている場合：** 1つのサービスに集約したい。Firebase依存を完全に排除したい。

---

### パターン4：Firebase Auth + Cloudflare（D1 + R2）

```
Auth: Firebase Auth
DB:   Cloudflare D1（SQLite）
File: Cloudflare R2（エグレス無料）
```

| 項目 | 評価 |
|------|------|
| 実装速度 | △ Workers移行が必要 |
| ロックイン | ○ SQLiteは標準的だがD1固有のAPIあり |
| 共有機能 | ○ SQLで実装可能 |
| 家族機能拡張 | ○ SQLで実装可能 |
| コスト（初期） | ◎ ほぼ無料 |
| コスト（スケール後） | ◎ 最安（特にR2のエグレス無料が強い） |
| 方針転換時 | ○ SQLiteダンプは容易 |

**向いている場合：** コスト最優先。Cloudflare Workersへの移行を受け入れる。長期的に音声配信コストを抑えたい。

---

## 4. 判断の軸

### 今回の意思決定で最も重要なのは何か

```
速さ優先      → パターン1（Firebase全部）or パターン3（Supabase全部）
移行性優先    → パターン2（Firebase Auth + Supabase）
コスト優先    → パターン4（Firebase Auth + Cloudflare）
バランス      → パターン2（Firebase Auth + Supabase）
```

### 「方針転換」とは具体的に何が起きうるか

1. **DBの変更**: Firestoreが高い/制約がきつい → 別DBに移行したい
   - Firestore → Postgres移行：データ変換+クエリ全書き換え（工数大）
   - Postgres → 別Postgres：pg_dump/restore（工数小）
   - Supabase → Neon/AWS RDS：ほぼそのまま（工数小）

2. **ホスティングの変更**: Supabase障害 → 自前 or 別サービスに移行したい
   - Supabase Postgres → AWS RDS：pg_dump（工数小）
   - Firestore → どこか：全部書き直し（工数大）

3. **認証の変更**: Firebase Auth → 別認証に変更したい
   - Firebase Auth → Supabase Auth：ユーザー移行が必要（工数中）
   - Firebase Auth → Clerk：同上（工数中）
   - **ただしAuth変更の可能性は低い**（Googleログインは枯れた技術）

4. **サービス統合**: 既存のKinoteシステムと統合したい
   - Kinoteが何のDBを使っているかによる
   - Postgresなら統合が自然、Firestoreだと別のDB変換が必要

---

## 5. 推奨

### 第一推奨：パターン2（Firebase Auth + Supabase）

**理由：**

1. **認証は最も変えにくい部分だからこそ、最も信頼できるものを使う**
   - Firebase Authは10年以上の実績、Googleログインの標準
   - Auth単体なら完全無料、ロックインもUID文字列だけ

2. **DBは最も変えたくなる部分だからこそ、最もポータブルなものを使う**
   - PostgreSQLは30年の歴史がある業界標準
   - JSONB型で「今はドキュメント指向、将来はリレーショナル」の両方に対応
   - `pg_dump` 一発でどこにでも持っていける

3. **現在のサーバー設計との相性が良い**
   - Honoサーバー経由でDBアクセスする設計なので、クライアント直接接続の問題がない
   - サーバーサイドで `firebase-admin.verifyIdToken()` → Supabase操作、の流れが自然

4. **共有機能がSQL+RLSで自然に書ける**
   - `SELECT * FROM conversations WHERE user_id = $1 AND id IN (SELECT ... FROM shares WHERE ...)`
   - Firestoreだとこの種のクロスコレクションクエリが困難

5. **2日間の実装に収まる**
   - Firebase Auth: 2h（変わらず）
   - Supabase DB: 3-4h（Firestoreとほぼ同じ工数）
   - 連携部分: +1h

### 実装上のポイント

```
クライアント → Firebase Auth（ログイン/IDトークン取得）
         ↓ IDトークン
サーバー（Hono） → firebase-admin（トークン検証 → uid取得）
         ↓ uid
Supabase（PostgreSQL） → CRUD操作（service_role key使用）
Supabase Storage → 音声ファイル保存/取得
```

- **クライアントはFirebase SDKだけを持つ**（Supabase SDKはサーバーのみ）
- **クライアントからSupabaseへの直接アクセスは行わない**
- **サーバーがDB操作の唯一のゲートウェイ**（セキュリティ上も良い設計）
- 共有ビューだけは、サーバーのpublicエンドポイント経由で認証なしアクセス

### 音声ファイルについて

Supabase Storageで十分だが、将来コストが気になる場合はCloudflare R2への切り替えも容易（S3互換API）。

---

## 6. 結論

| 決定事項 | 選択 | 理由 |
|---------|------|------|
| 認証 | Firebase Auth | 信頼性、無料、Googleログインの標準 |
| データベース | Supabase（PostgreSQL） | ポータビリティ、JSONB、RLS、SQL |
| ファイルストレージ | Supabase Storage | DB統合、S3互換で将来移行可能 |
| アクセスパターン | サーバー経由のみ | セキュリティ、Auth/DB統合の単純化 |

> **AuthとDBを別サービスにすることで、どちらか一方に問題が生じても、もう一方を維持したまま差し替えが可能になる。**
> **これがFirebase全部入りやSupabase全部入りとの最大の違い。**
