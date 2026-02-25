// Client-side search for past conversation records.
// Used by Realtime API Function Calling to let the AI
// reference past conversations on demand.

import { QUESTION_CATEGORIES } from "./questions";

import type {
  ConversationRecord,
  NoteEntry,
  QuestionCategory,
} from "../types/conversation";

// ---- Public types ----

export interface SearchParams {
  query: string;
  category?: QuestionCategory | null;
  maxResults?: number;
}

export interface SearchResult {
  conversationId: string;
  date: string;
  category: string;
  oneLinerSummary: string;
  relevantExcerpts: string[];
  score: number;
}

export interface SearchResponse {
  query: string;
  resultCount: number;
  results: SearchResult[];
}

export interface NoteEntriesParams {
  category: QuestionCategory;
}

export interface NoteEntriesResponse {
  category: string;
  totalEntries: number;
  entries: Array<{
    questionTitle: string;
    answer: string;
    /** Previous answer before the latest update, if any. */
    previousAnswer?: string;
    /** Number of times this entry was updated. */
    updateCount: number;
  }>;
}

// ---- Sanitization (duplicated from server/sanitizer.ts for client use) ----

const REDACTION_MARKER = "[保護済み]";
const CREDIT_CARD_PATTERN = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
const PIN_PASSWORD_PATTERN =
  /(暗証番号|パスワード|pin|password)\s*[:：=]?\s*[\d\w]+/gi;
const LONG_DIGIT_PATTERN = /\b\d{7,}\b/g;

function sanitize(text: string): string {
  let result = text;
  result = result.replace(CREDIT_CARD_PATTERN, REDACTION_MARKER);
  result = result.replace(PIN_PASSWORD_PATTERN, REDACTION_MARKER);
  result = result.replace(LONG_DIGIT_PATTERN, REDACTION_MARKER);
  return result;
}

// ---- Internal helpers ----

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 10;
const EXCERPT_MAX_LENGTH = 100;
const OUTPUT_MAX_LENGTH = 2000;

interface ScoredField {
  text: string;
  weight: number;
}

function getCategoryLabel(category: QuestionCategory | null): string {
  if (category === null) return "おまかせ";
  const info = QUESTION_CATEGORIES.find((c) => c.id === category);
  return info?.label ?? category;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function extractExcerpt(text: string, token: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(token.toLowerCase());
  if (idx === -1) return "";
  const start = Math.max(0, idx - 20);
  const end = Math.min(
    text.length,
    idx + token.length + EXCERPT_MAX_LENGTH - 20,
  );
  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = "..." + excerpt;
  if (end < text.length) excerpt = excerpt + "...";
  return excerpt;
}

function collectScoredFields(record: ConversationRecord): ScoredField[] {
  const fields: ScoredField[] = [];

  if (record.oneLinerSummary !== undefined && record.oneLinerSummary !== "") {
    fields.push({ text: record.oneLinerSummary, weight: 3 });
  }
  if (record.summary !== null) {
    fields.push({ text: record.summary, weight: 2 });
  }
  if (record.noteEntries !== undefined) {
    for (const entry of record.noteEntries) {
      fields.push({ text: entry.answer, weight: 2 });
      fields.push({ text: entry.questionTitle, weight: 1 });
    }
  }
  if (record.keyPoints !== undefined) {
    for (const s of record.keyPoints.importantStatements) {
      fields.push({ text: s, weight: 2 });
    }
    for (const s of record.keyPoints.decisions) {
      fields.push({ text: s, weight: 2 });
    }
    for (const s of record.keyPoints.undecidedItems) {
      fields.push({ text: s, weight: 1 });
    }
  }

  return fields;
}

function scoreRecord(fields: ScoredField[], tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    for (const field of fields) {
      const fieldLower = field.text.toLowerCase();
      if (fieldLower.includes(lower)) {
        total += field.weight;
      }
    }
  }
  return total;
}

function matchesCategory(
  record: ConversationRecord,
  category: QuestionCategory,
): boolean {
  if (record.category === category) return true;
  if (
    record.discussedCategories !== undefined &&
    record.discussedCategories.includes(category)
  ) {
    return true;
  }
  return false;
}

function truncateResponse(json: string): string {
  if (json.length <= OUTPUT_MAX_LENGTH) return json;
  const parsed = JSON.parse(json) as SearchResponse;
  while (
    parsed.results.length > 1 &&
    JSON.stringify(parsed).length > OUTPUT_MAX_LENGTH
  ) {
    parsed.results.pop();
  }
  parsed.resultCount = parsed.results.length;
  return JSON.stringify(parsed);
}

// ---- Public API ----

/**
 * Search past conversations by keyword.
 * Operates on an in-memory array.
 */
export function searchPastConversations(
  records: readonly ConversationRecord[],
  params: SearchParams,
): SearchResponse {
  const query = params.query.trim();
  if (query === "") {
    return { query, resultCount: 0, results: [] };
  }

  const tokens = query.split(/\s+/).filter((t) => t.length > 0);
  const maxResults = Math.min(
    params.maxResults ?? DEFAULT_MAX_RESULTS,
    MAX_RESULTS_LIMIT,
  );

  const scored: Array<{
    record: ConversationRecord;
    score: number;
    fields: ScoredField[];
  }> = [];

  for (const record of records) {
    // Skip conversations with no useful content
    if (
      record.summary === null &&
      record.oneLinerSummary === undefined &&
      (record.noteEntries === undefined || record.noteEntries.length === 0) &&
      record.keyPoints === undefined
    ) {
      continue;
    }

    // Category filter
    if (
      params.category !== undefined &&
      params.category !== null &&
      !matchesCategory(record, params.category)
    ) {
      continue;
    }

    const fields = collectScoredFields(record);
    const score = scoreRecord(fields, tokens);

    if (score > 0) {
      scored.push({ record, score, fields });
    }
  }

  // Sort by score descending, then by date descending
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.record.startedAt - a.record.startedAt;
  });

  const topResults = scored.slice(0, maxResults);

  const results: SearchResult[] = topResults.map(
    ({ record, score, fields }) => {
      // Build excerpts from highest-weight matched fields
      const excerpts: string[] = [];
      for (const token of tokens) {
        for (const field of fields) {
          if (field.text.toLowerCase().includes(token.toLowerCase())) {
            const excerpt = extractExcerpt(field.text, token);
            if (excerpt !== "" && !excerpts.includes(excerpt)) {
              excerpts.push(sanitize(excerpt));
              if (excerpts.length >= 3) break;
            }
          }
        }
        if (excerpts.length >= 3) break;
      }

      return {
        conversationId: record.id,
        date: formatDate(record.startedAt),
        category: getCategoryLabel(record.category),
        oneLinerSummary: sanitize(
          record.oneLinerSummary ?? record.summary ?? "",
        ),
        relevantExcerpts: excerpts,
        score,
      };
    },
  );

  const response: SearchResponse = {
    query,
    resultCount: results.length,
    results,
  };

  // Truncate if output JSON exceeds limit
  const json = JSON.stringify(response);
  if (json.length > OUTPUT_MAX_LENGTH) {
    return JSON.parse(truncateResponse(json)) as SearchResponse;
  }

  return response;
}

/**
 * Retrieve note entries for a specific category.
 * Uses last-write-wins: iterates oldest-first, latest answer per questionId wins.
 */
export function getNoteEntriesForAI(
  records: readonly ConversationRecord[],
  category: QuestionCategory,
): NoteEntriesResponse {
  // Collect all versions per questionId (oldest-first iteration)
  const versionsMap = new Map<string, NoteEntry[]>();

  const sorted = [...records].sort((a, b) => a.startedAt - b.startedAt);

  for (const record of sorted) {
    if (record.noteEntries === undefined) continue;
    if (!matchesCategory(record, category)) continue;

    for (const entry of record.noteEntries) {
      const existing = versionsMap.get(entry.questionId);
      if (existing !== undefined) {
        existing.push(entry);
      } else {
        versionsMap.set(entry.questionId, [entry]);
      }
    }
  }

  const entries = [...versionsMap.entries()].map(([, versions]) => {
    const latest = versions[versions.length - 1] as NoteEntry;
    const updateCount = versions.length - 1;
    const previousVersion =
      updateCount > 0 ? (versions[versions.length - 2] as NoteEntry) : null;

    return {
      questionTitle: latest.questionTitle,
      answer: sanitize(latest.answer),
      ...(previousVersion !== null
        ? { previousAnswer: sanitize(previousVersion.answer) }
        : {}),
      updateCount,
    };
  });

  return {
    category: getCategoryLabel(category),
    totalEntries: entries.length,
    entries,
  };
}
