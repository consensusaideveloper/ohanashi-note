// Pure formatting functions for data export (no DB/R2 dependencies).
// Extracted so they can be unit-tested without DATABASE_URL.

import { QUESTIONS } from "./questions.js";

// --- Types ---

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface NoteEntry {
  questionId: string;
  questionTitle: string;
  answer: string;
}

interface ImportantStatementItem {
  text: string;
}

interface KeyPoints {
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

// --- Constants ---

const CATEGORY_LABEL_MAP: Record<string, string> = {
  memories: "思い出",
  people: "大事な人・ペット",
  house: "生活",
  medical: "医療・介護",
  funeral: "葬儀・供養",
  money: "お金・資産",
  work: "仕事・事業",
  digital: "スマホ・ネット",
  legal: "財産と遺言",
  trust: "将来の備え",
  support: "使える制度",
};

const MIME_EXT_MAP: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/webm;codecs=opus": ".webm",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/ogg;codecs=opus": ".ogg",
};

const DEFAULT_AUDIO_EXT = ".webm";
const QUESTION_META_BY_ID = new Map(
  QUESTIONS.map((q) => [q.id, q] as const),
);

// --- Public functions ---

export function getCategoryLabel(categoryId: string | null): string {
  if (categoryId === null) return "その他";
  return CATEGORY_LABEL_MAP[categoryId] ?? "その他";
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTime(date: Date): string {
  const dateStr = formatDate(date);
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dateStr} ${h}:${min}`;
}

function formatTimestamp(ms: number): string {
  return formatDateTime(new Date(ms));
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

function getImportantStatementText(
  item: string | ImportantStatementItem,
): string {
  if (typeof item === "string") return item;
  return item.text;
}

function parseKeyPoints(raw: unknown): KeyPoints | null {
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
      const time = formatTimestamp(entry.timestamp);
      const speaker = entry.role === "user" ? "あなた" : "話し相手";
      return `[${time}] ${speaker}:\n${entry.text}`;
    })
    .join("\n\n");
}

export function buildConversationSummaryText(conv: ConversationRow): string {
  const lines: string[] = [];
  const entries = parseNoteEntries(conv.noteEntries);
  const keyPoints = parseKeyPoints(conv.keyPoints);

  if (conv.oneLinerSummary !== null) {
    lines.push(`■ ひとこと: ${conv.oneLinerSummary}`);
    lines.push("");
  }

  if (conv.summary !== null) {
    lines.push("■ 会話のまとめ");
    lines.push(conv.summary);
    lines.push("");
  }

  if (keyPoints !== null) {
    if (keyPoints.importantStatements.length > 0) {
      lines.push("■ 重要な発言");
      for (const s of keyPoints.importantStatements) {
        lines.push(`  - ${getImportantStatementText(s)}`);
      }
      lines.push("");
    }
    if (keyPoints.decisions.length > 0) {
      lines.push("■ 決定事項");
      for (const s of keyPoints.decisions) {
        lines.push(`  - ${s}`);
      }
      lines.push("");
    }
    if (keyPoints.undecidedItems.length > 0) {
      lines.push("■ 未確定の事項");
      for (const s of keyPoints.undecidedItems) {
        lines.push(`  - ${s}`);
      }
      lines.push("");
    }
  }

  if (entries.length > 0) {
    lines.push("■ 記録された内容");
    for (const entry of entries) {
      lines.push(`  Q: ${entry.questionTitle}`);
      lines.push(`  A: ${entry.answer}`);
      lines.push("");
    }
  }

  if (lines.length === 0) {
    lines.push("（要約はまだありません）");
  }

  return lines.join("\n");
}

function isAccumulativeQuestion(questionId: string): boolean {
  const q = QUESTION_META_BY_ID.get(questionId);
  return q?.questionType === "accumulative";
}

function inferCategoryFromQuestionId(questionId: string): string | null {
  const idx = questionId.lastIndexOf("-");
  if (idx <= 0) {
    return null;
  }
  return questionId.slice(0, idx);
}

export function buildEndingNoteText(
  rows: ConversationRow[],
  userName: string,
): string {
  // For single questions: keep only the latest entry per questionId.
  // For accumulative questions: collect all entries.
  const noteMap = new Map<string, Map<string, NoteEntry[]>>();

  for (const row of rows) {
    const entries = parseNoteEntries(row.noteEntries);

    for (const entry of entries) {
      const questionMeta = QUESTION_META_BY_ID.get(entry.questionId);
      const category =
        questionMeta?.category ??
        inferCategoryFromQuestionId(entry.questionId) ??
        row.category ??
        "other";
      const normalizedEntry =
        questionMeta !== undefined
          ? { ...entry, questionTitle: questionMeta.title }
          : entry;

      let catMap = noteMap.get(category);
      if (catMap === undefined) {
        catMap = new Map();
        noteMap.set(category, catMap);
      }

      const existing = catMap.get(entry.questionId);
      if (isAccumulativeQuestion(entry.questionId)) {
        if (existing !== undefined) {
          existing.push(normalizedEntry);
        } else {
          catMap.set(entry.questionId, [normalizedEntry]);
        }
      } else {
        // Rows are newest-first, so keep the first seen single entry.
        if (existing === undefined) {
          catMap.set(entry.questionId, [normalizedEntry]);
        }
      }
    }
  }

  const lines: string[] = [];
  lines.push("=".repeat(50));
  lines.push("わたしのエンディングノート");
  lines.push("=".repeat(50));
  if (userName !== "") {
    lines.push(`作成者: ${userName}`);
  }
  lines.push(`作成日: ${formatDate(new Date())}`);
  lines.push("");

  const categoryOrder = Object.keys(CATEGORY_LABEL_MAP);
  const allCategories = new Set([...categoryOrder, ...noteMap.keys()]);

  for (const catId of allCategories) {
    const catEntries = noteMap.get(catId);
    if (catEntries === undefined || catEntries.size === 0) continue;

    const label = getCategoryLabel(catId);
    lines.push("-".repeat(40));
    lines.push(`【${label}】`);
    lines.push("-".repeat(40));
    lines.push("");

    for (const entryList of catEntries.values()) {
      const firstEntry = entryList[0];
      if (firstEntry === undefined) continue;
      if (entryList.length === 1) {
        lines.push(`Q: ${firstEntry.questionTitle}`);
        lines.push(`A: ${firstEntry.answer}`);
        lines.push("");
      } else {
        lines.push(`Q: ${firstEntry.questionTitle}（${entryList.length}件）`);
        for (const entry of entryList) {
          lines.push(`  - ${entry.answer}`);
        }
        lines.push("");
      }
    }
  }

  if (noteMap.size === 0) {
    lines.push("（まだ記録はありません）");
  }

  lines.push("");
  lines.push("※ この文書は「おはなしエンディングノート」で作成されました。");
  lines.push("※ 法的効力はありません。正式な手続きは専門家にご相談ください。");

  return lines.join("\n");
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

export interface AudioLinkageRow {
  index: number;
  conversationId: string;
  folderName: string;
  categoryLabel: string;
  startedAt: Date;
  audioFileName: string | null;
  conversationPdfFileName: string;
}

export function buildAudioLinkageCsv(rows: readonly AudioLinkageRow[]): string {
  const header = [
    "index",
    "conversation_id",
    "category",
    "started_at",
    "folder",
    "conversation_pdf",
    "audio_file",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        String(row.index),
        row.conversationId,
        row.categoryLabel,
        formatDateTime(row.startedAt),
        row.folderName,
        row.conversationPdfFileName,
        row.audioFileName ?? "",
      ]
        .map((field) => `"${field.replaceAll('"', '""')}"`)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function buildReadmeText(
  audioFailures: string[],
  options?: { includesPdf?: boolean; includesAudioLinkage?: boolean },
): string {
  const lines: string[] = [];
  lines.push(
    "このフォルダには、おはなしエンディングノートのすべてのデータが入っています。",
  );
  lines.push("");
  if (options?.includesPdf === true) {
    lines.push("■ エンディングノート.pdf");
    lines.push("  印刷しやすい形式でまとめたエンディングノートです。");
    lines.push("");
  }
  lines.push("■ エンディングノート.txt");
  lines.push("  会話から記録されたノートの内容です。");
  lines.push("");
  lines.push("■ 会話フォルダ");
  lines.push("  これまでの会話の記録が入っています。");
  lines.push("  各フォルダには以下のファイルが含まれます：");
  if (options?.includesPdf === true) {
    lines.push("  - 会話記録.pdf … 会話内容を見やすくまとめたPDF");
  }
  lines.push("  - 会話内容.txt … 会話の書き起こし");
  lines.push("  - 要約.txt … 会話の要約と記録内容");
  lines.push("  - 録音（ある場合） … 会話の録音");
  lines.push("");
  if (options?.includesAudioLinkage === true) {
    lines.push("■ 音源対応表.csv");
    lines.push("  会話ID・PDF・録音ファイルの対応表です。");
    lines.push("");
  }
  lines.push("■ メタデータ.json");
  lines.push("  データの詳細情報です（技術的な内容）。");

  if (audioFailures.length > 0) {
    lines.push("");
    lines.push("■ ご注意");
    lines.push("  以下の会話の録音はダウンロードできませんでした：");
    for (const name of audioFailures) {
      lines.push(`  - ${name}`);
    }
  }

  lines.push("");
  lines.push(`作成日: ${formatDate(new Date())}`);

  return lines.join("\n");
}
