import { describe, expect, it } from "vitest";

import {
  formatTranscript,
  buildConversationFolderName,
  getCategoryLabel,
  formatDate,
  aggregateNotesByCategory,
} from "./data-export-formatters.js";

import type { ConversationRow } from "./data-export-formatters.js";

describe("getCategoryLabel", () => {
  it("returns Japanese label for known category", () => {
    expect(getCategoryLabel("memories")).toBe("思い出");
    expect(getCategoryLabel("people")).toBe("大事な人・ペット");
    expect(getCategoryLabel("medical")).toBe("医療・介護");
  });

  it("returns その他 for unknown category", () => {
    expect(getCategoryLabel("unknown")).toBe("その他");
  });

  it("returns その他 for null", () => {
    expect(getCategoryLabel(null)).toBe("その他");
  });
});

describe("formatDate", () => {
  it("formats date as YYYY-MM-DD", () => {
    const date = new Date("2026-03-05T10:00:00Z");
    expect(formatDate(date)).toBe("2026-03-05");
  });

  it("zero-pads month and day", () => {
    const date = new Date("2026-01-02T10:00:00Z");
    expect(formatDate(date)).toBe("2026-01-02");
  });
});

describe("formatTranscript", () => {
  it("returns placeholder for empty transcript", () => {
    expect(formatTranscript([])).toBe("（会話の記録はありません）");
  });

  it("formats user and assistant entries", () => {
    const transcript = [
      { role: "user" as const, text: "こんにちは", timestamp: 1709625600000 },
      {
        role: "assistant" as const,
        text: "はじめまして",
        timestamp: 1709625660000,
      },
    ];
    const result = formatTranscript(transcript);
    expect(result).toContain("あなた:");
    expect(result).toContain("こんにちは");
    expect(result).toContain("話し相手:");
    expect(result).toContain("はじめまして");
  });
});

describe("buildConversationFolderName", () => {
  const baseConv: ConversationRow = {
    id: "test-id",
    category: "memories",
    startedAt: new Date("2026-02-15T10:00:00Z"),
    endedAt: null,
    transcript: [],
    summary: null,
    summaryStatus: "pending",
    noteEntries: [],
    discussedCategories: null,
    keyPoints: null,
    oneLinerSummary: null,
    audioAvailable: false,
    audioStorageKey: null,
    audioMimeType: null,
    coveredQuestionIds: null,
  };

  it("generates correct folder name", () => {
    expect(buildConversationFolderName(1, baseConv)).toBe(
      "01_思い出_2026-02-15",
    );
    expect(buildConversationFolderName(12, baseConv)).toBe(
      "12_思い出_2026-02-15",
    );
  });

  it("uses その他 for null category", () => {
    const conv = {
      ...baseConv,
      category: null,
      startedAt: new Date("2026-03-01T10:00:00Z"),
    };
    expect(buildConversationFolderName(3, conv)).toBe("03_その他_2026-03-01");
  });
});

describe("aggregateNotesByCategory", () => {
  const baseConv: ConversationRow = {
    id: "conv1",
    category: "memories",
    startedAt: new Date("2026-02-15"),
    endedAt: null,
    transcript: [],
    summary: null,
    summaryStatus: "completed",
    noteEntries: [],
    discussedCategories: null,
    keyPoints: null,
    oneLinerSummary: null,
    audioAvailable: false,
    audioStorageKey: null,
    audioMimeType: null,
    coveredQuestionIds: null,
  };

  it("returns all 11 categories even with no data", () => {
    const result = aggregateNotesByCategory([]);
    expect(result).toHaveLength(11);
    expect(result[0]?.category).toBe("memories");
    expect(result[0]?.answeredCount).toBe(0);
    expect(result[0]?.noteEntries).toHaveLength(0);
  });

  it("aggregates note entries by category", () => {
    const rows: ConversationRow[] = [
      {
        ...baseConv,
        noteEntries: [
          {
            questionId: "memories-08",
            questionTitle: "自分史・趣味・好きなもの",
            answer: "釣りが好き",
          },
        ],
        coveredQuestionIds: ["memories-08"],
      },
    ];
    const result = aggregateNotesByCategory(rows);
    const memoriesCat = result.find((c) => c.category === "memories");
    expect(memoriesCat).toBeDefined();
    expect(memoriesCat?.answeredCount).toBe(1);
    expect(memoriesCat?.noteEntries).toHaveLength(1);
    expect(memoriesCat?.noteEntries[0]?.answer).toBe("釣りが好き");
  });

  it("keeps latest answer for single-type questions", () => {
    const rows: ConversationRow[] = [
      {
        ...baseConv,
        id: "conv-new",
        startedAt: new Date("2026-03-01"),
        noteEntries: [
          {
            questionId: "money-01",
            questionTitle: "メインの銀行",
            answer: "ゆうちょ銀行",
          },
        ],
        coveredQuestionIds: ["money-01"],
      },
      {
        ...baseConv,
        id: "conv-old",
        startedAt: new Date("2026-02-01"),
        noteEntries: [
          {
            questionId: "money-01",
            questionTitle: "メインの銀行",
            answer: "地方銀行",
          },
        ],
        coveredQuestionIds: ["money-01"],
      },
    ];
    const result = aggregateNotesByCategory(rows);
    const moneyCat = result.find((c) => c.category === "money");
    const entry = moneyCat?.noteEntries.find(
      (e) => e.questionId === "money-01",
    );
    expect(entry?.answer).toBe("ゆうちょ銀行");
    expect(entry?.hasHistory).toBe(true);
    expect(entry?.previousVersions).toHaveLength(1);
    expect(entry?.previousVersions[0]?.answer).toBe("地方銀行");
  });

  it("collects all entries for accumulative-type questions", () => {
    const rows: ConversationRow[] = [
      {
        ...baseConv,
        id: "conv-new",
        startedAt: new Date("2026-03-01"),
        noteEntries: [
          {
            questionId: "memories-08",
            questionTitle: "自分史・趣味・好きなもの",
            answer: "読書",
          },
        ],
        coveredQuestionIds: ["memories-08"],
      },
      {
        ...baseConv,
        id: "conv-old",
        startedAt: new Date("2026-02-01"),
        noteEntries: [
          {
            questionId: "memories-08",
            questionTitle: "自分史・趣味・好きなもの",
            answer: "釣り",
          },
        ],
        coveredQuestionIds: ["memories-08"],
      },
    ];
    const result = aggregateNotesByCategory(rows);
    const memoriesCat = result.find((c) => c.category === "memories");
    const entry = memoriesCat?.noteEntries.find(
      (e) => e.questionId === "memories-08",
    );
    expect(entry?.questionType).toBe("accumulative");
    expect(entry?.allEntries).toHaveLength(2);
    // Newest first
    expect(entry?.allEntries[0]?.answer).toBe("読書");
    expect(entry?.allEntries[1]?.answer).toBe("釣り");
  });

  it("categorizes entries by questionId even when conversation category differs", () => {
    const rows: ConversationRow[] = [
      {
        ...baseConv,
        id: "conv-mixed",
        category: "memories",
        noteEntries: [
          {
            questionId: "money-01",
            questionTitle: "銀行口座",
            answer: "地方銀行に1口座",
          },
        ],
        coveredQuestionIds: ["money-01"],
        discussedCategories: ["memories", "money"],
      },
    ];
    const result = aggregateNotesByCategory(rows);
    const moneyCat = result.find((c) => c.category === "money");
    expect(moneyCat?.noteEntries).toHaveLength(1);
    // Uses canonical question title from QUESTIONS, not the row's
    expect(moneyCat?.noteEntries[0]?.questionTitle).toBe("メインの銀行");
    expect(moneyCat?.noteEntries[0]?.answer).toBe("地方銀行に1口座");
  });

  it("tracks unanswered questions", () => {
    const result = aggregateNotesByCategory([]);
    const memoriesCat = result.find((c) => c.category === "memories");
    expect(memoriesCat?.unansweredQuestions.length).toBeGreaterThan(0);
    expect(memoriesCat?.unansweredQuestions[0]?.title).toBeDefined();
  });
});
