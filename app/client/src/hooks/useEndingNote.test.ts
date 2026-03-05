import { describe, it, expect } from "vitest";

import { buildCategoryData } from "./useEndingNote";

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

// --- Single-type questions (latest answer wins, version history) ---

describe("buildCategoryData — single-type version history", () => {
  // Use funeral-01 (single type) for version history tests
  it("returns empty previousVersions when a single-type question has only one answer", () => {
    const records = [
      makeRecord({
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "funeral-01",
            questionTitle: "葬儀の希望",
            answer: "家族葬",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const funeralCategory = result.find((c) => c.category === "funeral");
    expect(funeralCategory).toBeDefined();

    const entry = funeralCategory?.noteEntries.find(
      (e) => e.questionId === "funeral-01",
    );
    expect(entry).toBeDefined();
    expect(entry?.answer).toBe("家族葬");
    expect(entry?.questionType).toBe("single");
    expect(entry?.previousVersions).toEqual([]);
    expect(entry?.hasHistory).toBe(false);
    expect(entry?.allEntries).toEqual([]);
  });

  it("collects previousVersions when a single-type question is answered in two conversations", () => {
    const records = [
      makeRecord({
        id: "conv-2",
        startedAt: 2000,
        noteEntries: [
          {
            questionId: "funeral-01",
            questionTitle: "葬儀の希望",
            answer: "一般葬",
          },
        ],
      }),
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "funeral-01",
            questionTitle: "葬儀の希望",
            answer: "家族葬",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const entry = result
      .find((c) => c.category === "funeral")
      ?.noteEntries.find((e) => e.questionId === "funeral-01");

    expect(entry?.answer).toBe("一般葬");
    expect(entry?.conversationId).toBe("conv-2");
    expect(entry?.hasHistory).toBe(true);
    expect(entry?.previousVersions).toHaveLength(1);
    expect(entry?.previousVersions[0]?.answer).toBe("家族葬");
    expect(entry?.previousVersions[0]?.conversationId).toBe("conv-1");
  });

  it("orders previousVersions chronologically (oldest first) for 3+ updates", () => {
    const records = [
      makeRecord({
        id: "conv-3",
        startedAt: 3000,
        noteEntries: [
          {
            questionId: "funeral-01",
            questionTitle: "葬儀の希望",
            answer: "直葬",
          },
        ],
      }),
      makeRecord({
        id: "conv-2",
        startedAt: 2000,
        noteEntries: [
          {
            questionId: "funeral-01",
            questionTitle: "葬儀の希望",
            answer: "一般葬",
          },
        ],
      }),
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "funeral-01",
            questionTitle: "葬儀の希望",
            answer: "家族葬",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const entry = result
      .find((c) => c.category === "funeral")
      ?.noteEntries.find((e) => e.questionId === "funeral-01");

    expect(entry?.answer).toBe("直葬");
    expect(entry?.previousVersions).toHaveLength(2);
    expect(entry?.previousVersions[0]?.answer).toBe("家族葬");
    expect(entry?.previousVersions[0]?.recordedAt).toBe(1000);
    expect(entry?.previousVersions[1]?.answer).toBe("一般葬");
    expect(entry?.previousVersions[1]?.recordedAt).toBe(2000);
  });

  it("does not show cross-category entries as versions", () => {
    const records = [
      makeRecord({
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "money-01",
            questionTitle: "メインの銀行",
            answer: "三菱UFJ銀行",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const memoriesCategory = result.find((c) => c.category === "memories");
    const moneyCategory = result.find((c) => c.category === "money");

    expect(
      memoriesCategory?.noteEntries.find((e) => e.questionId === "money-01"),
    ).toBeUndefined();

    const moneyEntry = moneyCategory?.noteEntries.find(
      (e) => e.questionId === "money-01",
    );
    expect(moneyEntry?.answer).toBe("三菱UFJ銀行");
  });

  it("tracks audioAvailable per version", () => {
    const records = [
      makeRecord({
        id: "conv-2",
        startedAt: 2000,
        audioAvailable: true,
        noteEntries: [
          {
            questionId: "funeral-01",
            questionTitle: "葬儀の希望",
            answer: "最新",
          },
        ],
      }),
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        audioAvailable: false,
        noteEntries: [
          {
            questionId: "funeral-01",
            questionTitle: "葬儀の希望",
            answer: "古い",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const entry = result
      .find((c) => c.category === "funeral")
      ?.noteEntries.find((e) => e.questionId === "funeral-01");

    expect(entry?.audioAvailable).toBe(true);
    expect(entry?.previousVersions[0]?.audioAvailable).toBe(false);
  });
});

// --- Accumulative-type questions (all entries as peers) ---

describe("buildCategoryData — accumulative-type entries", () => {
  it("stores a single accumulative answer in allEntries with no version history", () => {
    const records = [
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "子が生まれた日",
            answer: "長女が生まれた日",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const entry = result
      .find((c) => c.category === "memories")
      ?.noteEntries.find((e) => e.questionId === "memories-01");

    expect(entry).toBeDefined();
    expect(entry?.questionType).toBe("accumulative");
    expect(entry?.answer).toBe("長女が生まれた日");
    expect(entry?.hasHistory).toBe(false);
    expect(entry?.previousVersions).toEqual([]);
    expect(entry?.allEntries).toHaveLength(1);
    expect(entry?.allEntries[0]?.answer).toBe("長女が生まれた日");
  });

  it("collects all entries as peers (newest first) for accumulative questions", () => {
    const records = [
      makeRecord({
        id: "conv-2",
        startedAt: 2000,
        audioAvailable: true,
        noteEntries: [
          {
            questionId: "people-01",
            questionTitle: "大事な人",
            answer: "親友の山田さん",
          },
        ],
      }),
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        audioAvailable: false,
        noteEntries: [
          {
            questionId: "people-01",
            questionTitle: "大事な人",
            answer: "妻の花子",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const entry = result
      .find((c) => c.category === "people")
      ?.noteEntries.find((e) => e.questionId === "people-01");

    expect(entry?.questionType).toBe("accumulative");
    // Latest answer is the headline
    expect(entry?.answer).toBe("親友の山田さん");
    // No version history (accumulative doesn't use it)
    expect(entry?.previousVersions).toEqual([]);
    expect(entry?.hasHistory).toBe(false);
    // All entries present as peers, newest first
    expect(entry?.allEntries).toHaveLength(2);
    expect(entry?.allEntries[0]?.answer).toBe("親友の山田さん");
    expect(entry?.allEntries[0]?.conversationId).toBe("conv-2");
    expect(entry?.allEntries[0]?.audioAvailable).toBe(true);
    expect(entry?.allEntries[0]?.recordedAt).toBe(2000);
    expect(entry?.allEntries[1]?.answer).toBe("妻の花子");
    expect(entry?.allEntries[1]?.conversationId).toBe("conv-1");
    expect(entry?.allEntries[1]?.audioAvailable).toBe(false);
    expect(entry?.allEntries[1]?.recordedAt).toBe(1000);
  });

  it("handles 3+ accumulative entries newest first", () => {
    const records = [
      makeRecord({
        id: "conv-3",
        startedAt: 3000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "子が生まれた日",
            answer: "三女が生まれた日",
          },
        ],
      }),
      makeRecord({
        id: "conv-2",
        startedAt: 2000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "子が生まれた日",
            answer: "次女が生まれた日",
          },
        ],
      }),
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "子が生まれた日",
            answer: "長女が生まれた日",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const entry = result
      .find((c) => c.category === "memories")
      ?.noteEntries.find((e) => e.questionId === "memories-01");

    expect(entry?.allEntries).toHaveLength(3);
    expect(entry?.allEntries[0]?.answer).toBe("三女が生まれた日");
    expect(entry?.allEntries[1]?.answer).toBe("次女が生まれた日");
    expect(entry?.allEntries[2]?.answer).toBe("長女が生まれた日");
  });

  it("does not mix single and accumulative entries for different questions in same category", () => {
    const records = [
      makeRecord({
        id: "conv-2",
        startedAt: 2000,
        noteEntries: [
          {
            questionId: "medical-01",
            questionTitle: "常用の薬",
            answer: "新しい薬B",
          },
          {
            questionId: "medical-05",
            questionTitle: "延命治療の希望",
            answer: "希望しない（更新）",
          },
        ],
      }),
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "medical-01",
            questionTitle: "常用の薬",
            answer: "薬A",
          },
          {
            questionId: "medical-05",
            questionTitle: "延命治療の希望",
            answer: "希望しない",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const medicalCategory = result.find((c) => c.category === "medical");

    // medical-01 is accumulative
    const drugEntry = medicalCategory?.noteEntries.find(
      (e) => e.questionId === "medical-01",
    );
    expect(drugEntry?.questionType).toBe("accumulative");
    expect(drugEntry?.allEntries).toHaveLength(2);
    expect(drugEntry?.previousVersions).toEqual([]);

    // medical-05 is single
    const lifeEntry = medicalCategory?.noteEntries.find(
      (e) => e.questionId === "medical-05",
    );
    expect(lifeEntry?.questionType).toBe("single");
    expect(lifeEntry?.answer).toBe("希望しない（更新）");
    expect(lifeEntry?.hasHistory).toBe(true);
    expect(lifeEntry?.previousVersions).toHaveLength(1);
    expect(lifeEntry?.allEntries).toEqual([]);
  });
});
