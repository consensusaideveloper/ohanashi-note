# Docs Index

このディレクトリでは、README に書き切らない仕様・設計・運用ドキュメントを管理する。

## Product / Lifecycle

- [アカウント退会・削除仕様](/Users/y-masamura/develop/conversational-ai-research/docs/account-deletion-spec.md)
  - 退会、復元、ハードデリート、家族通知、監査証跡、関連エッジケース
- [家族ライフサイクル仕様](/Users/y-masamura/develop/conversational-ai-research/docs/family-lifecycle-spec.md)
  - 死亡報告、同意収集、ノート開封、家族側の状態遷移
- [音声会話・オンボーディング仕様](/Users/y-masamura/develop/conversational-ai-research/docs/voice-automation-spec.md)
  - 通常会話、音声操作、初回オンボーディング、セッション制限、保存ルール

## Operations

- [Migration Operations](/Users/y-masamura/develop/conversational-ai-research/docs/migration-operations.md)
  - migration 実行、baseline、既存環境の扱い

## Architecture / Research

- [データ保存アーキテクチャ](/Users/y-masamura/develop/conversational-ai-research/docs/data-storage-architecture.md)
- [データ保存方針の決定](/Users/y-masamura/develop/conversational-ai-research/docs/data-storage-decision.md)
- [MVP 技術判断](/Users/y-masamura/develop/conversational-ai-research/docs/mvp-tech-decisions.md)
- [Realtime API MVP Plan](/Users/y-masamura/develop/conversational-ai-research/docs/realtime-api-mvp-plan.md)
- [見守り機能の配信仕様](/Users/y-masamura/develop/conversational-ai-research/docs/wellness-check-delivery-spec.md)

## Guidance

- README
  - セットアップ、主要コマンド、機能の要約だけを置く
- docs 配下
  - 実装判断に使う詳細仕様、状態遷移、運用手順を置く
- 変更時の原則
  - 仕様の正本は各専用 doc
  - README には詳細を重複転記しない
  - 仕様を変えたら README のリンク先だけでなく対象 doc 本体を更新する
