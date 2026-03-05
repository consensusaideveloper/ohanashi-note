import { describe, expect, it } from "vitest";

import {
  formatTranscript,
  buildConversationSummaryText,
  buildEndingNoteText,
  buildConversationFolderName,
  getCategoryLabel,
  formatDate,
} from "./data-export-formatters.js";

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

describe("buildConversationSummaryText", () => {
  const baseConv = {
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

  it("returns placeholder when no summary data exists", () => {
    const result = buildConversationSummaryText(baseConv);
    expect(result).toContain("（要約はまだありません）");
  });

  it("includes one-liner summary", () => {
    const conv = { ...baseConv, oneLinerSummary: "思い出を語りました" };
    const result = buildConversationSummaryText(conv);
    expect(result).toContain("思い出を語りました");
  });

  it("includes key points", () => {
    const conv = {
      ...baseConv,
      keyPoints: {
        importantStatements: ["北海道で生まれた"],
        decisions: ["お墓は地元に"],
        undecidedItems: ["保険の見直し"],
      },
    };
    const result = buildConversationSummaryText(conv);
    expect(result).toContain("北海道で生まれた");
    expect(result).toContain("お墓は地元に");
    expect(result).toContain("保険の見直し");
  });

  it("includes note entries", () => {
    const conv = {
      ...baseConv,
      noteEntries: [
        {
          questionId: "q1",
          questionTitle: "生まれた場所は？",
          answer: "北海道旭川市",
        },
      ],
    };
    const result = buildConversationSummaryText(conv);
    expect(result).toContain("生まれた場所は？");
    expect(result).toContain("北海道旭川市");
  });
});

describe("buildEndingNoteText", () => {
  it("returns placeholder for empty conversations", () => {
    const result = buildEndingNoteText([], "テスト太郎");
    expect(result).toContain("わたしのエンディングノート");
    expect(result).toContain("テスト太郎");
    expect(result).toContain("（まだ記録はありません）");
  });

  it("aggregates note entries by category", () => {
    const rows = [
      {
        id: "conv1",
        category: "memories",
        startedAt: new Date("2026-02-15"),
        endedAt: null,
        transcript: [],
        summary: null,
        summaryStatus: "completed",
        noteEntries: [
          {
            questionId: "q1",
            questionTitle: "生まれた場所は？",
            answer: "北海道",
          },
        ],
        discussedCategories: ["memories"],
        keyPoints: null,
        oneLinerSummary: null,
        audioAvailable: false,
        audioStorageKey: null,
        audioMimeType: null,
        coveredQuestionIds: null,
      },
    ];
    const result = buildEndingNoteText(rows, "");
    expect(result).toContain("【思い出】");
    expect(result).toContain("生まれた場所は？");
    expect(result).toContain("北海道");
  });
});

describe("buildConversationFolderName", () => {
  it("generates correct folder name", () => {
    const conv = {
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
    expect(buildConversationFolderName(1, conv)).toBe("01_思い出_2026-02-15");
    expect(buildConversationFolderName(12, conv)).toBe("12_思い出_2026-02-15");
  });

  it("uses その他 for null category", () => {
    const conv = {
      id: "test-id",
      category: null,
      startedAt: new Date("2026-03-01T10:00:00Z"),
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
    expect(buildConversationFolderName(3, conv)).toBe("03_その他_2026-03-01");
  });
});
