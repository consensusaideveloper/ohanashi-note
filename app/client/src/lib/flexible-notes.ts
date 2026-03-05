import type { NoteEntry } from "../types/conversation";
import {
  normalizeInsightStatement,
  getInsightText,
} from "../types/conversation";

import type {
  InsightCategory,
  InsightImportance,
  InsightStatement,
} from "../types/conversation";

export interface FlexibleNoteSource {
  conversationId: string;
  startedAt: number;
  importantStatements: Array<InsightStatement | string>;
  noteEntries: Array<Pick<NoteEntry, "answer" | "sourceEvidence">>;
}

export interface FlexibleNoteItem {
  id: string;
  text: string;
  category: InsightCategory;
  importance: InsightImportance;
  conversationId: string;
  recordedAt: number;
  mentionCount: number;
}

const NON_SUBSTANTIVE_IMPORTANT_STATEMENT_PATTERNS = [
  "こんにちは",
  "こんばんは",
  "おはよう",
  "よろしくお願いします",
  "よろしく",
  "ありがとうございます",
  "ありがとう",
  "わかりました",
  "そうですね",
  "大丈夫です",
  "今日はここまで",
  "また今度",
  "会話を終",
  "お話を終",
  "話を終",
  "設定を",
  "話す速さ",
  "待ち時間",
  "確認の頻度",
  "文字の大きさ",
  "話し相手",
  "キャラクター",
] as const;

const LEGACY_INSIGHT_MEDIUM_SIGNAL_PATTERNS = [
  /好き|好きな|好み|お気に入り|苦手|嫌い/u,
  /趣味|旅行|音楽|映画|本|写真/u,
  /思い出|忘れられない|昔|若い頃|子どもの頃/u,
  /大切|大事|こだわり|価値観|信条/u,
  /家族|友達|友人|人付き合い|人づきあい|ペット/u,
  /心配|気になる|気がかり|不安/u,
] as const;

function normalizeFlexibleNoteText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[「」『』"'`.,!?！？。、…・〜ー～()［］[\]{}]/g, "");
}

function isNonSubstantiveImportantStatement(text: string): boolean {
  const normalized = normalizeFlexibleNoteText(text);
  if (normalized.length < 3) {
    return true;
  }
  return NON_SUBSTANTIVE_IMPORTANT_STATEMENT_PATTERNS.some((pattern) =>
    normalized.includes(normalizeFlexibleNoteText(pattern)),
  );
}

function overlapsStructuredNote(
  statement: string,
  noteEntries: readonly Pick<NoteEntry, "answer" | "sourceEvidence">[],
): boolean {
  const normalizedStatement = normalizeFlexibleNoteText(statement);
  if (normalizedStatement.length === 0) {
    return false;
  }

  for (const entry of noteEntries) {
    const candidates = [entry.sourceEvidence, entry.answer];

    for (const candidate of candidates) {
      if (candidate === undefined) {
        continue;
      }

      const normalizedCandidate = normalizeFlexibleNoteText(candidate);
      if (normalizedCandidate.length < 3) {
        continue;
      }

      if (normalizedStatement === normalizedCandidate) {
        return true;
      }

      const shorterLength = Math.min(
        normalizedStatement.length,
        normalizedCandidate.length,
      );
      if (
        shorterLength >= 6 &&
        (normalizedStatement.includes(normalizedCandidate) ||
          normalizedCandidate.includes(normalizedStatement))
      ) {
        return true;
      }
    }
  }

  return false;
}

function shouldKeepFlexibleNoteItem(
  item: Pick<FlexibleNoteItem, "mentionCount" | "importance">,
): boolean {
  if (item.mentionCount > 1) {
    return true;
  }
  return item.importance !== "low";
}

function inferLegacyInsightImportance(text: string): InsightImportance {
  for (const pattern of LEGACY_INSIGHT_MEDIUM_SIGNAL_PATTERNS) {
    if (pattern.test(text)) {
      return "medium";
    }
  }
  return "low";
}

function normalizeFlexibleInsight(
  rawStatement: InsightStatement | string,
): InsightStatement {
  const normalized = normalizeInsightStatement(rawStatement);
  if (typeof rawStatement === "string") {
    return {
      ...normalized,
      importance: inferLegacyInsightImportance(rawStatement),
    };
  }
  return normalized;
}

export function buildFlexibleNoteItems(
  sources: readonly FlexibleNoteSource[],
): FlexibleNoteItem[] {
  const itemsById = new Map<string, FlexibleNoteItem>();
  const oldestFirst = [...sources].sort((a, b) => a.startedAt - b.startedAt);

  for (const source of oldestFirst) {
    const seenInConversation = new Set<string>();

    for (const rawStatement of source.importantStatements) {
      const insight = normalizeFlexibleInsight(rawStatement);
      const text = insight.text.trim();
      const id = normalizeFlexibleNoteText(text);
      if (id.length === 0) {
        continue;
      }
      if (seenInConversation.has(id)) {
        continue;
      }
      seenInConversation.add(id);

      if (isNonSubstantiveImportantStatement(text)) {
        continue;
      }
      if (overlapsStructuredNote(text, source.noteEntries)) {
        continue;
      }

      const existing = itemsById.get(id);
      if (existing !== undefined) {
        itemsById.set(id, {
          ...existing,
          text,
          category: insight.category,
          importance:
            importanceRank(insight.importance) >
            importanceRank(existing.importance)
              ? insight.importance
              : existing.importance,
          conversationId: source.conversationId,
          recordedAt: source.startedAt,
          mentionCount: existing.mentionCount + 1,
        });
        continue;
      }

      itemsById.set(id, {
        id,
        text,
        category: insight.category,
        importance: insight.importance,
        conversationId: source.conversationId,
        recordedAt: source.startedAt,
        mentionCount: 1,
      });
    }
  }

  return [...itemsById.values()]
    .filter((item) => shouldKeepFlexibleNoteItem(item))
    .sort((a, b) => b.recordedAt - a.recordedAt);
}

function importanceRank(importance: InsightImportance): number {
  switch (importance) {
    case "high":
      return 2;
    case "medium":
      return 1;
    case "low":
      return 0;
  }
}

// Re-export for convenience
export type { InsightCategory, InsightImportance, InsightStatement };
export { getInsightText };
