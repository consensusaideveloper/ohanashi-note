import type { NoteEntry } from "../types/conversation";

export interface FlexibleNoteSource {
  conversationId: string;
  startedAt: number;
  importantStatements: string[];
  noteEntries: Array<Pick<NoteEntry, "answer" | "sourceEvidence">>;
}

export interface FlexibleNoteItem {
  id: string;
  text: string;
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

export function buildFlexibleNoteItems(
  sources: readonly FlexibleNoteSource[],
): FlexibleNoteItem[] {
  const itemsById = new Map<string, FlexibleNoteItem>();
  const oldestFirst = [...sources].sort((a, b) => a.startedAt - b.startedAt);

  for (const source of oldestFirst) {
    const seenInConversation = new Set<string>();

    for (const rawStatement of source.importantStatements) {
      const text = rawStatement.trim();
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
          conversationId: source.conversationId,
          recordedAt: source.startedAt,
          mentionCount: existing.mentionCount + 1,
        });
        continue;
      }

      itemsById.set(id, {
        id,
        text,
        conversationId: source.conversationId,
        recordedAt: source.startedAt,
        mentionCount: 1,
      });
    }
  }

  return [...itemsById.values()].sort((a, b) => b.recordedAt - a.recordedAt);
}
