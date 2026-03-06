# AI参照・操作アーキテクチャ設計書

## 概要

本書は、「おはなし」における AI の参照範囲、操作範囲、今後の拡張方針を定義する。

現状の実装は、一般的な意味での「アプリ全体を横断する RAG」ではない。実際には、

- 保存済み会話・ノートを検索する retrieval
- 一部のプロフィール設定や家族情報を prompt に注入する context injection
- 音声でアプリ操作を行う function calling

の 3 つが混在している。

この構成自体は MVP として妥当だが、高齢者向けサービスとして「AI に聞けばアプリを案内してくれる」体験を成立させるには、参照範囲と操作範囲を意図的に設計し直す必要がある。

本書の結論は次の通り。

- 今後は「何でも検索できる汎用 RAG」ではなく、「明示されたアプリ能力を AI に与える Capability Architecture」として設計する
- AI が読める情報と、AI が変更できる情報を明確に分離する
- 新機能追加時は、画面単位ではなく「ユーザーが音声で頼みたくなる仕事単位」で capability を追加する
- 高齢者向けである以上、AI にはアプリの案内役を担わせるべきだが、無制限な参照権を持たせるべきではない

---

## 1. 背景と課題

### 現状の AI 参照経路

通常会話中の AI は、主に以下の情報へアクセスできる。

1. 会話開始時に prompt へ注入される情報
- ユーザー名
- AI の呼び名
- 話し方設定
- 過去会話の要約・進捗
- 家族メンバー一覧
- 開封設定

2. 会話中に tool で取得できる情報
- 過去会話検索
- ノート項目取得

3. 会話中に tool で実行できる操作
- 画面移動
- 設定変更
- 家族招待
- 開封設定変更

### 現状の問題

現状でも一定の価値はあるが、以下の不整合が存在する。

1. ユーザー期待と実装範囲が一致しない
- ユーザーは「AI に聞けばアプリのことは何でも分かる」と期待しやすい
- 実際には保存済み会話と一部設定しか AI は知らない

2. 参照経路が統一されていない
- 一部は prompt 注入
- 一部は検索 tool
- 一部は UI 側の state にのみ存在
- そのため「AI が知っているはず」と思う情報でも回答できないことがある

3. 新機能追加時の判断基準がない
- 新しい画面や機能が増えるたびに、AI がそれを読めるべきか、操作できるべきかの判断が場当たり的になりやすい

4. 高齢者向けとしてはまだ案内能力が足りない
- 音声で「今どうなってる？」「どこを見ればいい？」に答えられる範囲が限定的
- 一方で、強すぎる権限を与えると危険操作や誤解釈のリスクが上がる

---

## 2. 設計原則

今後の設計判断は以下の原則に従う。

### 原則1: AI を「万能検索」ではなく「案内役」として設計する

高齢者向け UX に必要なのは、技術的な網羅性ではなく、

- いま何ができるか
- どこを見ればよいか
- 代わりに操作できるか

を分かりやすく支援することにある。

したがって、アプリ内部の全データを機械的に AI に読ませるのではなく、ユーザー支援に本当に必要な情報だけを、意味のある単位で渡す。

### 原則2: 読み取り capability と変更 capability を分ける

「見られること」と「変えられること」はリスクが異なる。

- 読み取り capability: 現在の状態説明、検索、要約
- 変更 capability: 設定更新、画面遷移、家族招待、保存、削除

この二者を分離し、個別にレビューできる構造にする。

### 原則3: 画面ベースではなく仕事ベースで capability を定義する

ユーザーは「設定画面を開いてほしい」と言うこともあるが、本質的には、

- 文字を大きくしたい
- 今の設定を確認したい
- 妻に見せる設定を変えたい
- 前に話した内容を思い出したい

といった「仕事」を依頼している。

したがって capability は「画面」「DB テーブル」単位ではなく、ユーザー意図単位で定義する。

### 原則4: AI に渡す情報は、説明可能であること

運営・サポート・仕様書の観点で、次の問いに答えられなければならない。

- AI は何を知っているのか
- AI は何を知らないのか
- AI は何を変えられるのか
- AI はどこまで自動実行するのか

この説明可能性を壊すような「何でも prompt に突っ込む」設計は避ける。

### 原則5: 追加機能は capability registry に登録してから公開する

新機能を追加しただけでは、AI にその機能を開放しない。
まず capability として定義し、

- 読み取り対象
- 変更対象
- 実行条件
- ガードレール
- ユーザー向け説明文

を確定させてから AI に接続する。

---

## 3. 現状整理

### 3.1 AI が現在参照できる情報

| 区分 | 内容 | 経路 |
|---|---|---|
| 過去会話 | transcript, summary, oneLinerSummary, keyPoints, discussedCategories, noteEntries | `search_past_conversations` |
| ノート内容 | カテゴリ別の記録済み noteEntries | `get_note_entries` |
| ユーザー名 | `profile.name` | prompt 注入 |
| AI の呼び名 | `profile.assistantName` | prompt 注入 |
| 話し方設定 | `speakingSpeed`, `silenceDuration`, `confirmationLevel` | prompt 注入 |
| 家族一覧 | member name, relationshipLabel | prompt 注入 |
| 開封設定 | memberName と categoryId の対応 | prompt 注入 |
| 過去会話の進捗 | coveredQuestionIds, summaries | prompt 注入 |

### 3.2 AI が現在変更できる情報

| 区分 | 内容 | 実行方式 |
|---|---|---|
| 画面移動 | conversation, note, history, settings, family | 即時 |
| 表示設定 | fontSize | 即時 |
| 会話設定 | character, assistantName, speaking preferences | 即時 |
| ユーザー名 | name | 即時 |
| 家族招待 | invitation 作成 | 画面確認あり |
| 開封設定 | access preset grant/revoke | 即時 |
| テーマ会話開始 | focused conversation start | 画面確認あり |

### 3.3 AI が現在十分には扱えない情報

| 領域 | 現状 |
|---|---|
| 現在の設定一覧 | 一部しか prompt に入っていない |
| 現在の fontSize | AI が読み上げ確認する仕組みがない |
| 家族画面の状態全体 | 一覧・開封設定以外は読めない |
| 招待状況 | AI が説明できない |
| 現在どの画面にいるかの意味づけ | 遷移はできるが、画面内容の説明能力は弱い |
| 設定画面で可能な操作一覧 | 明示的に読めない |
| 同意・退会・印刷などの支援 | 主に画面誘導のみで、状態把握は弱い |

---

## 4. 目標アーキテクチャ

### 4.1 全体像

今後の AI 連携は、以下の 4 層で構成する。

1. Conversation Core
- 通常会話
- オンボーディング
- セッション制御

2. Capability Registry
- AI に公開する読み取り・変更能力の一覧
- tool schema
- 実行ポリシー

3. Context Providers
- AI に渡すためのアプリ状態を整形する層
- prompt 注入用の compact context
- tool レスポンス用の structured context

4. Guardrails
- 自動実行可否
- 確認 UI 必須
- 禁止操作
- 対象データの秘匿

### 4.2 基本方針

今後は、「RAG」を 1 つの仕組みとして扱わない。
代わりに、AI が扱う能力を次の 3 種に分ける。

1. Reference Capability
- 例: 過去の会話を探す
- 例: ノートの記録内容を確認する
- 例: 現在の設定を説明する

2. Navigation Capability
- 例: ノート画面へ移動する
- 例: 家族画面を開く
- 例: 設定画面へ案内する

3. Mutation Capability
- 例: 文字サイズを変更する
- 例: 話し方を変える
- 例: 開封設定を変える
- 例: 家族招待を作る

この分離により、新機能追加時に「読むだけなのか」「操作できるのか」「確認が必要か」を判断しやすくする。

---

## 5. Capability モデル

### 5.1 capability の必須メタデータ

今後追加するすべての capability は、最低限次の情報を持つ。

| 項目 | 説明 |
|---|---|
| `id` | 一意な識別子 |
| `type` | `reference` / `navigation` / `mutation` |
| `userIntent` | どの依頼を解決する能力か |
| `scope` | 参照・操作対象のデータ範囲 |
| `riskTier` | 自動実行可否を決める安全レベル |
| `requiresConfirmation` | UI 確認の要否 |
| `availability` | onboarding 中可否、通常会話可否、家族モード可否 |
| `responseStyle` | AI がどう結果を読み上げるべきか |
| `auditability` | 実行履歴を残すべきか |

### 5.2 推奨 risk tier

| Tier | 内容 | 例 |
|---|---|---|
| Tier 0 | 読み取りのみ、自動実行可 | 設定確認、会話検索、ノート確認 |
| Tier 1 | 可逆設定変更、自動実行可 | 文字サイズ、話し方、呼び名変更 |
| Tier 2 | 重要操作、UI 確認必須 | 家族招待、新規フロー開始 |
| Tier 3 | 音声実行禁止 | 削除、法的同意、退会確定 |

---

## 6. 今後追加すべき主要 capability

高齢者向け UX を考えると、次の capability は優先度が高い。

### 6.1 設定読み取り capability

#### `get_current_settings`

目的:
- 「今の設定どうなってる？」
- 「文字の大きさは今どうなってる？」
- 「あなたの名前は何になってる？」

返すべき内容:
- ユーザー名
- AI の呼び名
- character
- fontSize
- speakingSpeed
- silenceDuration
- confirmationLevel
- onboardingCompletedAt は内部用であり読み上げ不要

判断:
- 高齢者向けでは必須
- 現状は変更はできても確認が弱いので、非対称が解消される

### 6.2 家族状態読み取り capability

#### `get_family_status`

目的:
- 「今、誰が登録されてる？」
- 「妻には何を見せる設定になってる？」
- 「家族招待はどうなってる？」

返すべき内容:
- 家族メンバー一覧
- relationshipLabel
- active / pending 招待状態
- 開封設定のカテゴリ一覧

判断:
- 家族画面支援には重要
- ただし、家族側のセンシティブ情報は含めない

### 6.3 現在画面の案内 capability

#### `get_current_screen_context`

目的:
- 「この画面で何ができるの？」
- 「今どこを見てるの？」

返すべき内容:
- 現在画面 ID
- その画面で可能な主要操作 3〜5 件
- 重要ボタンや注意点

判断:
- 高齢者向けでは非常に有効
- 単なる画面名だけでなく、次に何をすればよいかまで案内できる

### 6.4 履歴・ノート横断サマリー capability

#### `search_my_information`

目的:
- 「保険の話ってどこかに残ってる？」
- 「子どもの頃の話はもう記録されてる？」

方針:
- 内部的には既存の会話検索と note 参照を統合した read capability として提供
- ユーザーは検索対象の違いを意識しなくてよい

判断:
- UX としては非常に自然
- 実装では `search_past_conversations` と `get_note_entries` を AI 内部で使い分けるか、上位 capability を新設する

---

## 7. 今後も AI に開放しない方がよい領域

以下は音声だけで自由に扱わせるべきではない。

### 7.1 削除系

- 会話削除
- ノート削除
- 家族削除
- アカウント退会

理由:
- 誤操作のリスクが高い
- 高齢者向けとして保護を優先すべき

### 7.2 法的・同意確定系

- 利用規約再同意
- 死亡報告の確定
- データ削除同意
- 権限付与の最終確定

理由:
- 本人性・意思確認が重要
- AI の読み間違いで確定させてはいけない

### 7.3 機微情報の生データ読み上げ

- 口座番号
- カード番号
- パスワード
- 暗証番号

理由:
- 現状も guardrail はあるが、構造的にも音声読上げ禁止にすべき

---

## 8. 新機能追加時の設計フレーム

今後、機能を追加したときは、必ず以下の順番で判断する。

### Step 1: この機能は AI で扱うべきか

問い:
- 高齢者が声で頼みたくなる機能か
- 画面操作だけでも十分か
- AI 案内があると明確に迷いが減るか

AI に向かない例:
- 一度も使わない管理者機能
- 複雑な表形式編集
- 長文精査が必要な法的文書確定

### Step 2: 読み取りか、変更か、案内かを分ける

1つの機能を丸ごと AI に載せない。
最低でも以下を分離する。

- 状態を説明する capability
- 画面へ連れて行く capability
- 実際に変更する capability

### Step 3: 自動実行してよいかを決める

判断軸:
- 可逆か
- 第三者に影響するか
- 後戻りしやすいか
- 誤認識の被害が大きいか

### Step 4: AI に見せるデータの最小単位を決める

悪い例:
- 画面用 API の生レスポンスを丸ごと prompt に渡す

良い例:
- AI が案内に必要な項目だけを整形して渡す

### Step 5: ユーザー向け説明文を定義する

AI が実行後にどう読み上げるかを事前に決める。

例:
- 「文字を大きめにしました」
- 「現在登録されているご家族は 2 人です」
- 「この操作は画面で確認してください」

### Step 6: docs と registry を更新する

最低限更新が必要なもの:
- capability registry
- prompt/tool 定義
- docs index
- 対応仕様書

---

## 9. 推奨実装構成

### 9.1 capability registry の導入

現状は `REALTIME_TOOLS` と prompt 文が主な定義箇所になっているが、今後は capability registry を別で持つことを推奨する。

例:

```ts
type CapabilityType = "reference" | "navigation" | "mutation";
type RiskTier = 0 | 1 | 2 | 3;

interface AiCapability {
  id: string;
  type: CapabilityType;
  riskTier: RiskTier;
  availableIn: Array<"onboarding" | "conversation" | "family">;
  toolName?: string;
  description: string;
  userExamples: string[];
}
```

これにより、

- tool schema
- prompt 中の利用可能能力説明
- docs
- テスト

の整合性を取りやすくなる。

### 9.2 context provider の導入

AI 用の参照データは、画面用 API や DB モデルから直接組み立てない。
代わりに context provider を置く。

例:

- `buildConversationMemoryContext()`
- `buildSettingsContext()`
- `buildFamilyContext()`
- `buildScreenContext()`

役割:
- AI に見せてよい情報だけを整形する
- UI 都合の不要フィールドを落とす
- 読み上げやすい粒度に圧縮する

### 9.3 screen metadata の導入

現在画面案内を強化するには、画面ごとにメタデータを持つのがよい。

例:

```ts
interface ScreenMetadata {
  id: string;
  title: string;
  summary: string;
  primaryActions: string[];
  caution?: string;
}
```

これを用意すると、

- `navigate_to_screen`
- `get_current_screen_context`
- ヘルプ表示

で同じ情報を再利用できる。

---

## 10. 具体的なロードマップ

### Phase 1: 現状整理の制度化

対応内容:
- capability registry 導入
- 現行 tool の分類
- docs の正本化

成果:
- 何を AI が読めて、何を変えられるかが一目で分かる

### Phase 2: 読み取り capability の拡充

優先追加:
- `get_current_settings`
- `get_family_status`
- `get_current_screen_context`

成果:
- 「AI に聞けば今の状態が分かる」が成立する

### Phase 3: 検索体験の統合

対応内容:
- 過去会話検索とノート参照を上位 capability に統合
- ユーザー向けには「前の情報を探す」で一本化

成果:
- RAG 的な複雑さをユーザーに見せずに済む

### Phase 4: 新機能追加時のガバナンス

対応内容:
- 新機能 PR に capability review checklist を必須化
- docs 更新をリリース条件にする

成果:
- 将来の機能追加でも AI 連携が場当たりにならない

---

## 11. この設計が高齢者向けとして適切な理由

### 適切な理由1: 「覚える UI」より「尋ねられる AI」を重視できる

高齢者にとっては、画面構造を覚えるより、

- 今どうなっているか
- 次に何をすればよいか
- 代わりにやってもらえるか

を聞ける方が負担が小さい。

### 適切な理由2: それでも危険操作は切り離せる

AI を案内役に強化しても、

- 削除
- 同意
- 退会
- 法的確定

は UI 確認や手動操作に残せる。

したがって「AI を強くする」と「安全性を保つ」は両立できる。

### 適切な理由3: 機能追加時にも破綻しにくい

新しい機能が増えても、毎回 capability 単位で開放可否を判断できる。
そのため、

- 何となく prompt に足す
- 気付いたら AI が一部だけ知っている

という不整合が減る。

---

## 12. 最終方針

本サービスにおける AI は、今後次の位置付けで設計する。

- ただの会話相手ではなく、アプリ内の案内役
- ただし万能権限を持つ管理者ではない
- 検索・案内・設定変更を中心に強化する
- 削除・同意・法的確定は人間の明示操作を残す

したがって、今後の正しい拡張方針は、

- 汎用 RAG を広げることではなく
- capability を増やし
- 参照と変更を分離し
- 高齢者にとって自然な依頼単位で AI を育てること

である。

---

## 付録A: 新機能追加チェックリスト

新しい画面・機能を追加する際は、以下を必ず確認する。

1. ユーザーはこの機能を音声で頼みたくなるか
2. AI はこの機能を読むだけでよいか、変更も必要か
3. 自動実行してよいか、UI 確認が必要か
4. AI に見せる最小データは何か
5. AI が知らなくてよいデータは何か
6. 実行後、AI は何と案内すべきか
7. docs と capability registry を更新したか
8. テストで未許可の capability が混ざらないことを確認したか

## 付録B: 近い将来の実装候補

- `get_current_settings`
- `get_family_status`
- `get_current_screen_context`
- `search_my_information`
- capability registry の型定義とテスト
- screen metadata の共通定義
