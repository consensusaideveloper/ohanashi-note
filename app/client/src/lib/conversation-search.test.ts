import { describe, it, expect } from "vitest";

import {
  searchPastConversations,
  getNoteEntriesForAI,
} from "./conversation-search";

import type { ConversationRecord } from "../types/conversation";

function makeRecord(
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return {
    id: crypto.randomUUID(),
    category: "memories",
    characterId: "character-a",
    startedAt: Date.now(),
    endedAt: Date.now(),
    transcript: [],
    summary: null,
    ...overrides,
  };
}

describe("searchPastConversations", () => {
  it("returns empty results for empty query", () => {
    const records = [makeRecord({ summary: "旅行の思い出" })];
    const result = searchPastConversations(records, { query: "" });
    expect(result.resultCount).toBe(0);
    expect(result.results).toEqual([]);
  });

  it("returns empty results when no records match", () => {
    const records = [makeRecord({ summary: "家族の思い出" })];
    const result = searchPastConversations(records, { query: "旅行" });
    expect(result.resultCount).toBe(0);
  });

  it("finds records matching a single keyword in summary", () => {
    const records = [
      makeRecord({ summary: "北海道旅行の楽しい思い出" }),
      makeRecord({ summary: "家族との夕食" }),
    ];
    const result = searchPastConversations(records, { query: "旅行" });
    expect(result.resultCount).toBe(1);
    expect(result.results[0]?.relevantExcerpts.length).toBeGreaterThan(0);
  });

  it("finds records matching keywords in noteEntries", () => {
    const records = [
      makeRecord({
        noteEntries: [
          {
            questionId: "q1",
            questionTitle: "好きな場所",
            answer: "京都のお寺が好きです",
          },
        ],
      }),
    ];
    const result = searchPastConversations(records, { query: "京都" });
    expect(result.resultCount).toBe(1);
  });

  it("finds records matching keywords in keyPoints", () => {
    const records = [
      makeRecord({
        keyPoints: {
          importantStatements: ["銀行は三菱UFJを使っている"],
          decisions: [],
          undecidedItems: [],
        },
      }),
    ];
    const result = searchPastConversations(records, { query: "三菱" });
    expect(result.resultCount).toBe(1);
  });

  it("ranks higher-weighted fields above lower-weighted ones", () => {
    const highScore = makeRecord({
      id: "high",
      oneLinerSummary: "旅行の思い出を語る",
      summary: "旅行について話した",
    });
    const lowScore = makeRecord({
      id: "low",
      keyPoints: {
        importantStatements: [],
        decisions: [],
        undecidedItems: ["旅行の日程が未定"],
      },
    });
    const result = searchPastConversations([highScore, lowScore], {
      query: "旅行",
    });
    expect(result.resultCount).toBe(2);
    expect(result.results[0]?.conversationId).toBe("high");
  });

  it("filters by category when specified", () => {
    const records = [
      makeRecord({ category: "memories", summary: "旅行の思い出" }),
      makeRecord({ category: "money", summary: "旅行の費用" }),
    ];
    const result = searchPastConversations(records, {
      query: "旅行",
      category: "memories",
    });
    expect(result.resultCount).toBe(1);
    expect(result.results[0]?.category).toBe("思い出");
  });

  it("matches discussedCategories for category filter", () => {
    const records = [
      makeRecord({
        category: null,
        discussedCategories: ["memories", "people"],
        summary: "旅行と家族の話",
      }),
    ];
    const result = searchPastConversations(records, {
      query: "旅行",
      category: "memories",
    });
    expect(result.resultCount).toBe(1);
  });

  it("respects maxResults limit", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ summary: `旅行の思い出 パート${i + 1}` }),
    );
    const result = searchPastConversations(records, {
      query: "旅行",
      maxResults: 3,
    });
    expect(result.resultCount).toBe(3);
  });

  it("handles multiple space-separated keywords", () => {
    const records = [
      makeRecord({ summary: "北海道旅行で家族と過ごした" }),
      makeRecord({ summary: "旅行の計画を立てた" }),
      makeRecord({ summary: "家族の誕生日パーティー" }),
    ];
    const result = searchPastConversations(records, { query: "旅行 家族" });
    // The record with both keywords should score highest
    expect(result.results[0]?.conversationId).toBe(records[0]?.id);
  });

  it("sanitizes sensitive data in excerpts", () => {
    const records = [
      makeRecord({
        summary: "口座番号は12345678901です",
      }),
    ];
    const result = searchPastConversations(records, { query: "口座" });
    expect(result.resultCount).toBe(1);
    const excerpt = result.results[0]?.relevantExcerpts[0] ?? "";
    expect(excerpt).toContain("[保護済み]");
    expect(excerpt).not.toContain("12345678901");
  });

  it("skips records with no useful content", () => {
    const records = [makeRecord({ summary: null, oneLinerSummary: undefined })];
    const result = searchPastConversations(records, { query: "何でも" });
    expect(result.resultCount).toBe(0);
  });

  it("returns empty results for empty records array", () => {
    const result = searchPastConversations([], { query: "旅行" });
    expect(result.resultCount).toBe(0);
    expect(result.results).toEqual([]);
  });

  it("formats date correctly", () => {
    const records = [
      makeRecord({
        startedAt: new Date(2025, 5, 15).getTime(), // June 15, 2025
        summary: "旅行の話",
      }),
    ];
    const result = searchPastConversations(records, { query: "旅行" });
    expect(result.results[0]?.date).toBe("2025年6月15日");
  });
});

describe("getNoteEntriesForAI", () => {
  it("returns entries for the specified category", () => {
    const records = [
      makeRecord({
        category: "memories",
        noteEntries: [
          {
            questionId: "q1",
            questionTitle: "好きな場所",
            answer: "京都",
          },
        ],
      }),
    ];
    const result = getNoteEntriesForAI(records, "memories");
    expect(result.totalEntries).toBe(1);
    expect(result.entries[0]?.answer).toBe("京都");
    expect(result.category).toBe("思い出");
  });

  it("uses last-write-wins for duplicate questionIds", () => {
    const records = [
      makeRecord({
        category: "memories",
        startedAt: 1000,
        noteEntries: [
          { questionId: "q1", questionTitle: "好きな場所", answer: "京都" },
        ],
      }),
      makeRecord({
        category: "memories",
        startedAt: 2000,
        noteEntries: [
          { questionId: "q1", questionTitle: "好きな場所", answer: "奈良" },
        ],
      }),
    ];
    const result = getNoteEntriesForAI(records, "memories");
    expect(result.totalEntries).toBe(1);
    expect(result.entries[0]?.answer).toBe("奈良");
  });

  it("returns empty entries when no records match category", () => {
    const records = [
      makeRecord({
        category: "money",
        noteEntries: [
          { questionId: "q1", questionTitle: "銀行", answer: "三菱UFJ" },
        ],
      }),
    ];
    const result = getNoteEntriesForAI(records, "memories");
    expect(result.totalEntries).toBe(0);
    expect(result.entries).toEqual([]);
  });

  it("sanitizes sensitive data in answers", () => {
    const records = [
      makeRecord({
        category: "money",
        noteEntries: [
          {
            questionId: "q1",
            questionTitle: "口座情報",
            answer: "パスワード：secret123",
          },
        ],
      }),
    ];
    const result = getNoteEntriesForAI(records, "money");
    expect(result.entries[0]?.answer).toContain("[保護済み]");
    expect(result.entries[0]?.answer).not.toContain("secret123");
  });

  it("handles records with no noteEntries", () => {
    const records = [makeRecord({ category: "memories" })];
    const result = getNoteEntriesForAI(records, "memories");
    expect(result.totalEntries).toBe(0);
  });

  it("includes previousAnswer and updateCount when entry was updated", () => {
    const records = [
      makeRecord({
        category: "memories",
        startedAt: 1000,
        noteEntries: [
          { questionId: "q1", questionTitle: "好きな場所", answer: "京都" },
        ],
      }),
      makeRecord({
        category: "memories",
        startedAt: 2000,
        noteEntries: [
          { questionId: "q1", questionTitle: "好きな場所", answer: "奈良" },
        ],
      }),
    ];
    const result = getNoteEntriesForAI(records, "memories");
    expect(result.entries[0]?.answer).toBe("奈良");
    expect(result.entries[0]?.previousAnswer).toBe("京都");
    expect(result.entries[0]?.updateCount).toBe(1);
  });

  it("sets updateCount to 0 and omits previousAnswer when entry has no history", () => {
    const records = [
      makeRecord({
        category: "memories",
        startedAt: 1000,
        noteEntries: [
          { questionId: "q1", questionTitle: "好きな場所", answer: "京都" },
        ],
      }),
    ];
    const result = getNoteEntriesForAI(records, "memories");
    expect(result.entries[0]?.updateCount).toBe(0);
    expect(result.entries[0]?.previousAnswer).toBeUndefined();
  });

  it("tracks multiple updates with correct updateCount", () => {
    const records = [
      makeRecord({
        category: "memories",
        startedAt: 1000,
        noteEntries: [
          { questionId: "q1", questionTitle: "好きな場所", answer: "京都" },
        ],
      }),
      makeRecord({
        category: "memories",
        startedAt: 2000,
        noteEntries: [
          { questionId: "q1", questionTitle: "好きな場所", answer: "奈良" },
        ],
      }),
      makeRecord({
        category: "memories",
        startedAt: 3000,
        noteEntries: [
          { questionId: "q1", questionTitle: "好きな場所", answer: "東京" },
        ],
      }),
    ];
    const result = getNoteEntriesForAI(records, "memories");
    expect(result.entries[0]?.answer).toBe("東京");
    expect(result.entries[0]?.previousAnswer).toBe("奈良");
    expect(result.entries[0]?.updateCount).toBe(2);
  });
});
