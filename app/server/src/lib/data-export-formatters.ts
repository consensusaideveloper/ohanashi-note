// Pure formatting functions for data export (no DB/R2 dependencies).
// Extracted so they can be unit-tested without DATABASE_URL.

import { QUESTIONS } from "./questions.js";

import type { InsightStatement } from "../types/conversation.js";

// --- Types ---

export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export interface NoteEntry {
  questionId: string;
  questionTitle: string;
  answer: string;
  sourceEvidence?: string;
}

interface ImportantStatementItem {
  text: string;
}

export interface KeyPoints {
  importantStatements: Array<string | ImportantStatementItem>;
  decisions: string[];
  undecidedItems: string[];
}

export interface ConversationRow {
  id: string;
  category: string | null;
  startedAt: Date;
  endedAt: Date | null;
  transcript: unknown;
  summary: string | null;
  summaryStatus: string;
  noteEntries: unknown;
  discussedCategories: string[] | null;
  keyPoints: unknown;
  oneLinerSummary: string | null;
  audioAvailable: boolean;
  audioStorageKey: string | null;
  audioMimeType: string | null;
  coveredQuestionIds: string[] | null;
}

// --- Structured types for PDF generation ---

export interface NoteEntryVersion {
  answer: string;
  conversationId: string;
  recordedAt: Date;
}

export interface AccumulativeEntry {
  answer: string;
  conversationId: string;
  recordedAt: Date;
}

export type QuestionType = "single" | "accumulative";

export interface NoteEntryWithSource extends NoteEntry {
  conversationId: string;
  questionType: QuestionType;
  /** Past versions in chronological order (oldest first); excludes current. Single type only. */
  previousVersions: NoteEntryVersion[];
  hasHistory: boolean;
  /** All entries as equal peers (newest first). Accumulative type only. */
  allEntries: AccumulativeEntry[];
}

export interface UnansweredQuestion {
  id: string;
  title: string;
}

export interface CategoryNoteData {
  category: string;
  label: string;
  totalQuestions: number;
  answeredCount: number;
  noteEntries: NoteEntryWithSource[];
  unansweredQuestions: UnansweredQuestion[];
  disclaimer?: string;
}

// --- Constants ---

interface CategoryMeta {
  id: string;
  label: string;
  disclaimer?: string;
}

export const CATEGORY_META: readonly CategoryMeta[] = [
  { id: "memories", label: "思い出" },
  { id: "people", label: "大事な人・ペット" },
  { id: "house", label: "生活" },
  { id: "medical", label: "医療・介護" },
  { id: "funeral", label: "葬儀・供養" },
  { id: "money", label: "お金・資産" },
  { id: "work", label: "仕事・事業" },
  { id: "digital", label: "スマホ・ネット" },
  {
    id: "legal",
    label: "財産と遺言",
    disclaimer:
      "このアプリはお気持ちや希望を記録するためのものです。法律の手続きには使えませんので、くわしいことは専門家（弁護士や司法書士など）にご相談ください。",
  },
  {
    id: "trust",
    label: "将来の備え",
    disclaimer:
      "このアプリはお気持ちや希望を記録するためのものです。法律の手続きには使えませんので、くわしいことは専門家（弁護士や司法書士など）にご相談ください。",
  },
  {
    id: "support",
    label: "使える制度",
    disclaimer:
      "制度の詳細や申請方法は、お住まいの市区町村窓口や社会福祉協議会にご確認ください。",
  },
];

const CATEGORY_LABEL_MAP = new Map(CATEGORY_META.map((c) => [c.id, c.label]));

const MIME_EXT_MAP: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/webm;codecs=opus": ".webm",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/ogg;codecs=opus": ".ogg",
};

const DEFAULT_AUDIO_EXT = ".webm";
const QUESTION_META_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q] as const));

// --- Public functions ---

export function getCategoryLabel(categoryId: string | null): string {
  if (categoryId === null) return "その他";
  return CATEGORY_LABEL_MAP.get(categoryId) ?? "その他";
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateJapanese(date: Date): string {
  const y = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}年${month}月${day}日 ${h}:${min}`;
}

export function formatDateJapaneseShort(date: Date): string {
  const y = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${y}年${month}月${day}日`;
}

export function parseTranscript(raw: unknown): TranscriptEntry[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter(
    (entry): entry is TranscriptEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).role === "string" &&
      typeof (entry as Record<string, unknown>).text === "string" &&
      typeof (entry as Record<string, unknown>).timestamp === "number",
  );
}

export function parseNoteEntries(raw: unknown): NoteEntry[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter(
    (entry): entry is NoteEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).questionTitle === "string" &&
      typeof (entry as Record<string, unknown>).answer === "string",
  );
}

export function getImportantStatementText(
  item: string | ImportantStatementItem,
): string {
  if (typeof item === "string") return item;
  return item.text;
}

export function parseKeyPoints(raw: unknown): KeyPoints | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  return {
    importantStatements: Array.isArray(obj.importantStatements)
      ? (obj.importantStatements as Array<string | ImportantStatementItem>)
      : [],
    decisions: Array.isArray(obj.decisions) ? (obj.decisions as string[]) : [],
    undecidedItems: Array.isArray(obj.undecidedItems)
      ? (obj.undecidedItems as string[])
      : [],
  };
}

export function formatTranscript(transcript: TranscriptEntry[]): string {
  if (transcript.length === 0) return "（会話の記録はありません）";

  return transcript
    .map((entry) => {
      const time = formatDateJapanese(new Date(entry.timestamp));
      const speaker = entry.role === "user" ? "あなた" : "話し相手";
      return `[${time}] ${speaker}:\n${entry.text}`;
    })
    .join("\n\n");
}

export function buildConversationFolderName(
  index: number,
  conv: ConversationRow,
): string {
  const paddedIndex = String(index).padStart(2, "0");
  const label = getCategoryLabel(conv.category);
  const date = formatDate(conv.startedAt);
  return `${paddedIndex}_${label}_${date}`;
}

export function getAudioExtension(mimeType: string | null): string {
  if (mimeType === null) return DEFAULT_AUDIO_EXT;
  return MIME_EXT_MAP[mimeType] ?? DEFAULT_AUDIO_EXT;
}

// --- Structured note aggregation for PDF ---

function getQuestionType(questionId: string): QuestionType {
  const q = QUESTION_META_BY_ID.get(questionId);
  return q?.questionType === "accumulative" ? "accumulative" : "single";
}

function getQuestionsByCategory(
  categoryId: string,
): Array<{ id: string; title: string; questionType: QuestionType }> {
  return QUESTIONS.filter((q) => q.category === categoryId).map((q) => ({
    id: q.id,
    title: q.title,
    questionType: q.questionType,
  }));
}

const VALID_INSIGHT_CATEGORIES = new Set([
  "hobbies",
  "values",
  "relationships",
  "memories",
  "concerns",
  "other",
]);

const VALID_INSIGHT_IMPORTANCES = new Set(["high", "medium", "low"]);

function isInsightStatement(value: unknown): value is InsightStatement {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["text"] === "string" &&
    typeof obj["category"] === "string" &&
    VALID_INSIGHT_CATEGORIES.has(obj["category"]) &&
    typeof obj["importance"] === "string" &&
    VALID_INSIGHT_IMPORTANCES.has(obj["importance"])
  );
}

export function sanitizeImportantStatements(
  value: unknown,
): Array<string | InsightStatement> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string | InsightStatement =>
      typeof item === "string" || isInsightStatement(item),
  );
}

/**
 * Aggregates note entries from conversation rows into structured category data,
 * replicating the client-side `buildCategoryData()` logic from `useEndingNote.ts`.
 *
 * Rows must be ordered newest-first (desc by startedAt).
 */
export function aggregateNotesByCategory(
  rows: ConversationRow[],
): CategoryNoteData[] {
  // Process oldest-first for version tracking
  const oldest = [...rows].reverse();

  return CATEGORY_META.map((cat) => {
    const questions = getQuestionsByCategory(cat.id);
    const questionIdSet = new Set(questions.map((q) => q.id));

    // Collect ALL versions of note entries per questionId (oldest-first).
    const allVersionsMap = new Map<string, NoteEntryVersion[]>();
    const latestMetaMap = new Map<
      string,
      { entry: NoteEntry; convId: string }
    >();

    for (const record of oldest) {
      const entries = parseNoteEntries(record.noteEntries);
      for (const entry of entries) {
        if (questionIdSet.has(entry.questionId)) {
          const version: NoteEntryVersion = {
            answer: entry.answer,
            conversationId: record.id,
            recordedAt: record.startedAt,
          };
          const existing = allVersionsMap.get(entry.questionId);
          if (existing !== undefined) {
            existing.push(version);
          } else {
            allVersionsMap.set(entry.questionId, [version]);
          }
          latestMetaMap.set(entry.questionId, {
            entry,
            convId: record.id,
          });
        }
      }
    }

    const entryMap = new Map<string, NoteEntryWithSource>();
    for (const [qId, latest] of latestMetaMap.entries()) {
      const allVersions = allVersionsMap.get(qId) ?? [];
      const clientQuestion = questions.find((q) => q.id === qId);
      const questionTitle = clientQuestion?.title ?? latest.entry.questionTitle;
      const qType = getQuestionType(qId);

      if (qType === "accumulative") {
        const allEntries: AccumulativeEntry[] = [...allVersions]
          .reverse()
          .map((v) => ({
            answer: v.answer,
            conversationId: v.conversationId,
            recordedAt: v.recordedAt,
          }));
        entryMap.set(qId, {
          ...latest.entry,
          questionTitle,
          conversationId: latest.convId,
          questionType: qType,
          previousVersions: [],
          hasHistory: false,
          allEntries,
        });
      } else {
        const previousVersions = allVersions.slice(0, -1);
        entryMap.set(qId, {
          ...latest.entry,
          questionTitle,
          conversationId: latest.convId,
          questionType: qType,
          previousVersions,
          hasHistory: previousVersions.length > 0,
          allEntries: [],
        });
      }
    }

    // Collect all covered question IDs for this category from ALL records
    const coveredIds = new Set<string>();
    for (const record of rows) {
      if (record.coveredQuestionIds !== null) {
        for (const id of record.coveredQuestionIds) {
          if (questionIdSet.has(id)) {
            coveredIds.add(id);
          }
        }
      }
    }

    const answeredCount = questions.filter((q) => coveredIds.has(q.id)).length;

    const unansweredQuestions: UnansweredQuestion[] = questions
      .filter((q) => !coveredIds.has(q.id))
      .map((q) => ({ id: q.id, title: q.title }));

    return {
      category: cat.id,
      label: cat.label,
      totalQuestions: questions.length,
      answeredCount,
      noteEntries: Array.from(entryMap.values()),
      unansweredQuestions,
      ...(cat.disclaimer !== undefined ? { disclaimer: cat.disclaimer } : {}),
    };
  });
}
