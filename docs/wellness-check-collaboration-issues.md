# 見守り機能 共同作業用 Issue 一覧

> 作成日: 2026-03-06
> 目的: Codex と Claude が並行作業するための共通タスク台帳
> 関連資料:
> - `docs/wellness-check-delivery-spec.md`
> - `docs/wellness-check-uiux-handoff.md`
> - `docs/wellness-check-research.md`

---

## 0. 使い方

- この資料は issue のたたき台であり、そのまま GitHub Issue に転記できる粒度で書いている。
- `担当` は初期案。状況に応じて変更してよい。
- `依存` があるものは、前提 issue 完了後に着手する。
- `完了条件` を満たしたらクローズする。

---

## 1. 現在地

### 実装済み

- 見守り設定 UI の初期導線
- 見守り設定 API
- 見守りサマリー API
- `wellness_settings` / `wellness_checkins` / `wellness_notification_log` の DB 作成
- 日次評価 / 週次通知ジョブの土台

### 未完了

- 見守り会話からのノート更新提案フロー
- ジョブの実運用検証
- 通知閾値・文面の最終確定
- 同意文面・規約反映
- SMS など外部通知チャネル
- `drizzle-kit push` を安全に回せる運用整理

---

## 2. 共同作業ルール

### Codex が主に担当するもの

- サーバー
- DB / migration
- バッチ / 通知 / API
- 状態整合性

### Claude が主に担当するもの

- UI/UX
- 文言
- 状態別表示
- 高齢者向け可読性

### 共同で確認するもの

- 状態遷移
- 共有範囲の意味
- 通知の心理的負荷
- 実運用での誤通知リスク

---

## 3. Issue 一覧

### WC-01 見守り設定と家族サマリー UI の最終調整

- 担当: Claude
- 優先度: P0
- 状態: 完了
- 依存: なし
- 対象:
  - `app/client/src/components/WellnessActivationDialog.tsx`
  - `app/client/src/components/WellnessSettingsSection.tsx`
  - `app/client/src/components/FamilyWellnessSummaryCard.tsx`
  - `app/client/src/components/NotificationList.tsx`
  - `app/client/src/lib/constants.ts`
- 完了条件:
  - `empty / loading / paused / disabled / error` の表示が揃っている
  - 色だけで重要度を伝えない
  - 高齢者向けの文言とレイアウトになっている
  - `npm run typecheck` が通る

### WC-02 見守り会話からのノート更新提案フロー実装

- 担当: Codex
- 優先度: P0
- 状態: 進行中
- 依存: なし
- 対象:
  - `app/client/src/hooks/useConversation.ts`
  - `app/server/src/services/summarizer.ts`
  - `app/client/src/lib/api.ts`
  - 必要なら確認 UI / 保存処理
- 現在地:
  - 過去ノートを要約へ渡す粒度を改善済み
  - 要約レスポンスに `noteUpdateProposals` を追加済み
  - guided/null カテゴリ会話では候補を `pending` 保存するように変更済み
  - 承認反映 API（`/api/conversations/:id/apply-note-updates`）を追加済み
  - 見送り API（`/api/conversations/:id/dismiss-note-updates`）を追加済み
  - 未完了なのは `確認 -> 反映` の UI 接続
- 完了条件:
  - 会話中の変化を更新候補として抽出できる
  - `提案 -> 確認 -> 反映` の3段階を守る
  - 自動更新しない
  - キャンセル時に何も保存されない

### WC-03 日次評価ジョブの実運用検証

- 担当: Codex
- 優先度: P0
- 状態: 一部実装済み
- 依存: なし
- 対象:
  - `app/server/src/lib/wellness-jobs.ts`
  - 実 DB 上の `wellness_checkins`
- 完了条件:
  - 前日分の check-in が重複なく記録される
  - `2日未接触` / `3日以上未接触` 通知が意図通りに発火する
  - 一時停止中に通知されない
  - 同じ window で二重通知しない

### WC-04 週次サマリー通知の実運用検証

- 担当: Codex
- 優先度: P0
- 状態: 一部実装済み
- 依存: WC-03
- 対象:
  - `app/server/src/lib/wellness-jobs.ts`
  - `notifications`
  - `wellness_notification_log`
- 完了条件:
  - 指定曜日にのみ送られる
  - 同週の重複送信がない
  - `shareLevel` に応じた出し分けがされる

### WC-05 通知文面・閾値の最終確定

- 担当: 共同
- 優先度: P1
- 状態: 未着手
- 依存: WC-01, WC-03, WC-04
- 論点:
  - `2日未接触` / `3日以上未接触` が適切か
  - 文言が不安を煽りすぎていないか
  - 家族が次に取る行動が明確か
- 完了条件:
  - 文面が constants に確定反映されている
  - PM 観点で許容できる通知頻度になっている

### WC-06 同意文面・利用規約・プライバシーポリシー反映

- 担当: Codex
- 優先度: P1
- 状態: 未着手
- 依存: WC-05
- 対象:
  - 同意バージョン管理
  - 表示フロー
  - 見守り特有の免責と共有説明
- 完了条件:
  - 見守り有効化時に同意が取れる
  - 同意文面バージョンが保存される
  - 「医療・警備サービスではない」説明が入る

### WC-07 `drizzle-kit push` を安全に使える状態に戻す

- 担当: Codex
- 優先度: P1
- 状態: 一部対応済み
- 依存: なし
- 背景:
  - 実 DB とローカル schema の drift により、無関係な削除候補が出ることがある
- 完了条件:
  - `emotion_analysis` の drift が再発しない
  - migration 運用方針が README or CLAUDE.md に明記される
  - 今後の schema push で目的外の data-loss 警告が出ない

### WC-08 外部通知チャネル調査と導入判断

- 担当: Codex
- 優先度: P2
- 状態: 未着手
- 依存: WC-03, WC-04
- 対象:
  - SMS ベンダー候補
  - 到達率
  - コスト
  - 実装難易度
- 完了条件:
  - 導入可否の結論が出ている
  - 進めるなら技術選定メモがある

### WC-09 見守り UI とサーバー状態の最終結合確認

- 担当: 共同
- 優先度: P1
- 状態: 未着手
- 依存: WC-01, WC-03, WC-04
- 確認項目:
  - UI の `paused` 表示とサーバーの `paused_until` が一致する
  - `summary null` 時の家族画面の表示が期待どおりか
  - 通知詳細から行動しやすいか
- 完了条件:
  - 手動確認シナリオが一通り通る
  - 仕様と実装に齟齬がない

---

## 4. 推奨着手順

1. WC-01 Claude が UI を確定
2. WC-02 Codex が更新提案フローを実装
3. WC-03 WC-04 Codex がジョブ挙動を詰める
4. WC-05 文面と閾値を共同で確定
5. WC-06 同意文面を反映
6. WC-09 結合確認
7. WC-08 外部通知を判断

---

## 5. GitHub Issue 化テンプレート

各 issue は以下フォーマットで起票する。

```md
## 背景

## 目的

## 対象ファイル

## やること
- [ ]
- [ ]

## 完了条件
- [ ]
- [ ]

## 依存

## 担当
```

---

## 6. 直近の実務メモ

- `drizzle-kit push` は DB drift を巻き込むことがあるため、目的外の削除候補が出た場合は中断して原因を先に解消する。
- Claude には UI/UX に限定して触ってもらい、server と migration は触らせない。
- Codex 側は API・DB・job・保存ロジックに集中する。
