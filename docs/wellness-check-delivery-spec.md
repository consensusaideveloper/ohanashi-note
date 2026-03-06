# 見守り機能 実装実行仕様書（Phase 1.5）

> 作成日: 2026-03-06
> 対象: 見守り機能の実装担当（サーバー・クライアント・PM・QA）
> 参照資料:
> - `docs/wellness-check-research.md`
> - `docs/voice-automation-spec.md`
> - `docs/family-lifecycle-spec.md`
> - `app/server/src/db/schema.ts`
> - `app/client/src/lib/prompt-builder.ts`

---

## 0. この資料の目的

この資料は、見守り機能を「監視」ではなく「関係性維持 + 意思更新」機能として実装するための実行設計を定義する。
UIの最終デザインは別AI/デザイナーに委任する前提で、実装が止まらないレベルまで機能仕様・データ仕様・API仕様・通知設計・KPIを固定する。

---

## 1. 最終方針（最適解）

採用方針は **ハイブリッド見守り（Phase 1.5）** とする。

1. 平時は家族へ週次サマリーを提供する（通知疲れを防ぐ）。
2. 異常時のみ即時通知を送る（連続未接触ベース）。
3. 本人には1〜3分想定の短会話を促す（時間制限はソフト）。
4. 会話からエンディングノート更新候補を提案する（提案→確認→反映）。
5. 共有範囲は本人主権で3段階プリセット管理にする。

この構成により、受容性・継続率・差別化・法務リスク・実装現実性のバランスを取る。

---

## 2. リリーススコープ

### 2.1 In Scope（Phase 1.5）

- 見守り機能のオン/オフと共有プリセット設定
- 日次の「会話実績」計測（新規会話の有無）
- 週次家族サマリー生成
- 連続未接触のエスカレーション通知
- 会話中のノート更新候補提案（提案→確認→反映）
- 家族向け見守りサマリー表示

### 2.2 Out of Scope（後続）

- 医療機関・自治体への自動通報
- 音声バイオマーカー診断
- 24/7保証をうたう緊急監視サービス
- 家族側の自由テキスト返信チャット

---

## 3. 成果指標（KPI）

### 3.1 North Star

- `Weekly Active Linked Families`（週に1回以上、本人または家族のどちらかが見守り画面を利用した家族数）

### 3.2 成否判定KPI（リリース後8週間）

- 見守り有効化率: `>= 35%`
- 見守り有効ユーザーの週次継続率: `>= 70%`
- 週次サマリー開封率（家族）: `>= 60%`
- 異常通知の誤通知率: `<= 8%`
- ノート更新提案の承認率: `>= 25%`
- 見守り有効ユーザーのノート更新頻度: 非有効ユーザー比 `>= 1.5x`

### 3.3 ガードレールKPI

- 「監視されていると感じる」関連フィードバック率: `<= 10%`
- 共有設定変更/停止操作の成功率: `>= 98%`

---

## 4. ペルソナとジョブ

### 4.1 本人（高齢者）

- ジョブ: 「監視されずに、安心して日常会話を続けたい」
- 不安: 何が家族に共有されるかわからない
- 成功体験: 1分程度の会話で体調や近況を自然に伝えられる

### 4.2 家族（遠方）

- ジョブ: 「毎日張り付かず、変化がある時だけ気づきたい」
- 不安: 通知が多すぎる/少なすぎる
- 成功体験: 週次サマリーで状況を把握し、必要時だけ連絡できる

---

## 5. 要件定義（機能要件）

### FR-01 見守り有効化

- 本人のみが見守り機能を有効化できる。
- 家族は有効化できない。
- 初回有効化時に同意文面と共有範囲を提示する。

### FR-02 共有範囲プリセット

- 共有範囲は以下3段階から選択する。
- `基本だけ`: 応答有無・会話回数・簡易ステータスのみ共有。
- `要約も共有`: 上記 + 週次の短い要約を共有。
- `詳細共有`: 上記 + 変化点（更新候補カテゴリ）を共有。
- 本人はいつでも変更/停止できる。

### FR-03 日次会話実績の記録

- 会話実績は既存 `conversations` を基準に日次集計する。
- 「接触あり」は、当日中に本人の保存済み会話が1件以上あること。
- しきい値判定はタイムゾーン `Asia/Tokyo` を基準とする。

### FR-04 週次サマリー

- 家族向けに週1回サマリーを生成する。
- 内容は共有プリセットに応じて出し分ける。
- 生成失敗時は再試行し、失敗ログを残す。

### FR-05 異常時エスカレーション

- 連続未接触日数で通知段階を制御する。
- 推奨初期値:
- 1日未接触: 通知なし
- 2日連続未接触: 家族に注意通知
- 3日連続未接触: 強い注意通知
- 解除条件: 本人の会話が1件保存された時点で連続カウントを0に戻す

### FR-06 会話からの更新提案

- 既存要約処理から更新候補を抽出し、本人に提案する。
- 反映は必ず `提案 -> 本人確認 -> 反映` の3段階。
- 自動反映は禁止。

### FR-07 監査ログ

- 見守り設定変更、共有範囲変更、通知送信、エスカレーション判定、停止操作を `activity_log` に記録する。

---

## 6. 非機能要件

- 可用性: 見守り判定ジョブ成功率 `>= 99%`（日次）
- 性能: 週次集計ジョブは1ユーザーあたり500ms以内を目安
- セキュリティ: 家族への情報取得は既存 family 権限チェック必須
- 透明性: 本人画面に「共有中の情報」を常時表示
- 離脱容易性: ワンタップで一時停止、家族承認不要

---

## 7. データモデル設計

現状 `app/server/src/db/schema.ts` に見守り専用テーブルは存在しないため、以下を追加する。

### 7.1 `wellness_settings`

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | uuid PK | はい | 設定ID |
| `creator_id` | uuid FK(users.id), unique | はい | 本人ユーザー |
| `enabled` | boolean | はい | 有効/無効 |
| `share_level` | text | はい | `basic` `summary` `detailed` |
| `timezone` | text | はい | 既定 `Asia/Tokyo` |
| `weekly_summary_day` | smallint | はい | 0-6 (Mon-Sun基準など統一定義) |
| `escalation_rule` | jsonb | はい | 例: `{ "day2": "warn", "day3": "urgent" }` |
| `paused_until` | timestamptz nullable | いいえ | 一時停止期限 |
| `consent_version` | text | はい | 同意文面バージョン |
| `created_at` | timestamptz | はい | 作成日 |
| `updated_at` | timestamptz | はい | 更新日 |

Index:
- `idx_wellness_settings_creator`
- `idx_wellness_settings_enabled`

### 7.2 `wellness_checkins`

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | uuid PK | はい | レコードID |
| `creator_id` | uuid FK(users.id) | はい | 本人ユーザー |
| `checkin_date` | date | はい | JST日付 |
| `status` | text | はい | `engaged` `missed` `paused` |
| `conversation_id` | uuid FK(conversations.id) nullable | いいえ | 紐付く会話 |
| `signals` | jsonb | はい | 週次集計用シグナル |
| `summary_for_family` | text nullable | いいえ | 共有用短文 |
| `created_at` | timestamptz | はい | 作成日 |
| `updated_at` | timestamptz | はい | 更新日 |

Unique:
- `uq_wellness_checkins_creator_date` (`creator_id`, `checkin_date`)

Index:
- `idx_wellness_checkins_creator_date`
- `idx_wellness_checkins_status`

### 7.3 `wellness_notifications`（推奨）

既存 `notifications` のみでも実装可能だが、重複送信防止のため専用ログを持つ。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | uuid PK | はい | ログID |
| `creator_id` | uuid FK(users.id) | はい | 本人 |
| `recipient_user_id` | uuid FK(users.id) | はい | 通知先家族 |
| `type` | text | はい | `weekly_summary` `missed_day2` `missed_day3` |
| `window_start` | timestamptz | はい | 集計開始 |
| `window_end` | timestamptz | はい | 集計終了 |
| `delivery_channel` | text | はい | `in_app` `sms` `email` |
| `delivery_status` | text | はい | `sent` `failed` |
| `metadata` | jsonb | はい | 失敗理由等 |
| `created_at` | timestamptz | はい | 作成日 |

---

## 8. API仕様（新規）

### 8.1 本人向け

#### `GET /api/wellness/settings`

- 説明: 現在の見守り設定を取得
- 認証: 本人必須

レスポンス例:

```json
{
  "enabled": true,
  "shareLevel": "summary",
  "timezone": "Asia/Tokyo",
  "weeklySummaryDay": 0,
  "pausedUntil": null,
  "escalationRule": { "day2": "warn", "day3": "urgent" },
  "consentVersion": "2026-03-v1"
}
```

#### `PUT /api/wellness/settings`

- 説明: 見守り設定を更新
- 認証: 本人必須
- バリデーション: `shareLevel` enum, `weeklySummaryDay` range

#### `POST /api/wellness/pause`

- 説明: 一時停止
- Body: `{ "pausedUntil": "2026-03-10T00:00:00+09:00" }`

#### `POST /api/wellness/resume`

- 説明: 一時停止解除

#### `GET /api/wellness/checkins`

- 説明: 本人向けチェックイン履歴（直近30日）

### 8.2 家族向け

#### `GET /api/wellness/:creatorId/weekly-summary`

- 説明: 指定本人の週次見守りサマリー
- 認証: 家族メンバーかつ権限チェック必須

レスポンス例:

```json
{
  "creatorId": "...",
  "creatorName": "山田花子",
  "weekStart": "2026-03-02",
  "weekEnd": "2026-03-08",
  "engagedDays": 4,
  "missedStreak": 0,
  "status": "stable",
  "summary": "今週は4回会話があり、体調は安定傾向です。",
  "highlights": [
    "通院先変更の話題がありました",
    "医療カテゴリの更新候補が1件あります"
  ]
}
```

### 8.3 内部ジョブ向け（internal only）

#### `POST /internal/wellness/daily-evaluate`

- 説明: 日次の接触判定 + エスカレーション
- 実行元: cron/job runner

#### `POST /internal/wellness/weekly-summary`

- 説明: 週次サマリー生成と通知配信

---

## 9. 通知設計

### 9.1 通知タイプ（`notifications.type`）

- `wellness_weekly_summary`
- `wellness_missed_day2`
- `wellness_missed_day3`
- `wellness_resumed`

### 9.2 送達チャネル方針

Phase 1.5での優先順位:

1. `in-app`（必須）
2. `sms`（推奨。外部基盤確定後）

補足:
- Web Pushは高齢者PWA導線が弱いため主チャネルにしない。
- SMS未導入期間は、エスカレーションを「アプリ内通知のみ」と明記し、利用規約表示で期待値調整する。

### 9.3 通知重複抑制

- 同一 `creator_id + recipient_user_id + type + window` では再送しない。
- 失敗時は指数バックオフで最大3回リトライ。

---

## 10. 会話AI/要約ロジック変更

### 10.1 変更対象

- `app/client/src/lib/prompt-builder.ts`
- `app/client/src/hooks/useConversation.ts`
- `app/server/src/services/summarizer.ts`

### 10.2 仕様

- 日常会話のクロージング付近で、更新候補が検出された場合のみ提案する。
- 提案文は短く固定化し、確認質問を1つだけ返す。
- 本人が同意した場合のみ noteEntries 反映処理に進む。

### 10.3 実装ルール

- 自動更新禁止
- 最大提案回数: 1セッション2件まで
- 曖昧返答（例: 「うーん」「また今度」）は保留にする

---

## 11. ジョブ設計

### 11.1 Daily Evaluation Job

- 実行時刻: JST 08:00
- 処理:
1. `wellness_settings.enabled = true` の本人を取得
2. 前日 `conversations` 有無を判定
3. `wellness_checkins` を upsert
4. 連続未接触カウント更新
5. しきい値到達時に通知生成

### 11.2 Weekly Summary Job

- 実行時刻: 毎週月曜 JST 09:00
- 処理:
1. 直近7日 `wellness_checkins` 集計
2. share level に応じて内容整形
3. 家族メンバーに通知作成
4. 送信ログ保存

### 11.3 障害時運用

- 失敗ジョブは `activity_log` にエラーコード保存
- 再実行エンドポイントを用意
- 手動再送フラグを `wellness_notifications` に保持

---

## 12. クライアント実装範囲

### 12.1 新規画面/セクション

- Settings内: 見守り設定セクション
- Family内: 見守りサマリーカード
- 本人向け: 見守りステータスカード（直近接触状況）

### 12.2 既存画面改修

- `SettingsScreen.tsx`
- `FamilyScreen.tsx`
- `NotificationList.tsx`
- `useConversation.ts`（更新提案の起点連携）

---

## 13. ファイル単位タスク分解（実装担当向け）

### 13.1 Server

- `app/server/src/db/schema.ts`
  - 見守り3テーブル追加
- `app/server/src/db/migrations/*`
  - マイグレーション生成
- `app/server/src/routes/wellness.ts`（新規）
  - settings, pause/resume, checkins, weekly-summary API
- `app/server/src/lib/wellness-jobs.ts`（新規）
  - daily/weeklyジョブ
- `app/server/src/index.ts`
  - route mount + job side-effect import
- `app/server/src/services/summarizer.ts`
  - 更新候補抽出/整形ルール追加

### 13.2 Client

- `app/client/src/lib/wellness-api.ts`（新規）
- `app/client/src/components/WellnessSettingsSection.tsx`（新規）
- `app/client/src/components/FamilyWellnessSummaryCard.tsx`（新規）
- `app/client/src/hooks/useConversation.ts`
  - 更新提案イベントハンドリング
- `app/client/src/lib/prompt-builder.ts`
  - 提案文・会話終盤ルール追加

---

## 14. QA受け入れ基準

### 14.1 基本シナリオ

1. 本人が見守りを有効化できる。
2. 家族は有効化操作できない。
3. 週次サマリーが家族に表示される。
4. 2日未接触で注意通知、3日で強注意通知。
5. 会話復帰で未接触カウントがリセットされる。
6. 更新提案は確認後のみ反映される。
7. 一時停止中はエスカレーションが発火しない。

### 14.2 異常系

1. 通知送信失敗時に再試行される。
2. 同一ウィンドウで重複通知されない。
3. 家族権限のないユーザーが週次サマリー取得できない。

---

## 15. リリース計画

### Milestone A（1週）

- データモデル + settings API + 設定UI

### Milestone B（1週）

- daily/weeklyジョブ + 通知生成 + 家族サマリーUI

### Milestone C（1週）

- 更新提案フロー + QA + 計測イベント

### Go/No-Go 条件

- エスカレーション誤発報がテスト環境で `<= 10%`
- 本人が共有範囲を3タップ以内で変更可能
- 家族サマリー画面の主要導線完了率 `>= 95%`（社内テスト）

---

## 16. 法務・倫理の必須文言（実装前に固定）

- 本機能は医療・警備サービスではない。
- 通知遅延/未達の可能性がある。
- 共有内容は本人が管理し、いつでも停止可能。
- 家族への共有範囲は設定画面で常時確認できる。

---

## 17. 未決事項（先に意思決定が必要）

1. SMSベンダー選定（Twilio等）と国内送達率評価
2. 週次サマリー配信曜日の初期値（全体固定か個別設定か）
3. 連続未接触の初期閾値（2日/3日の妥当性）
4. 利用規約・同意文面バージョン管理方法

