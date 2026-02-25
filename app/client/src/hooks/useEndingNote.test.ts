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

describe("buildCategoryData — version history", () => {
  it("returns empty previousVersions when a question has only one answer", () => {
    const records = [
      makeRecord({
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "家族旅行",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const memoriesCategory = result.find((c) => c.category === "memories");
    expect(memoriesCategory).toBeDefined();

    const entry = memoriesCategory?.noteEntries.find(
      (e) => e.questionId === "memories-01",
    );
    expect(entry).toBeDefined();
    expect(entry?.answer).toBe("家族旅行");
    expect(entry?.previousVersions).toEqual([]);
    expect(entry?.hasHistory).toBe(false);
  });

  it("collects previousVersions when a question is answered in two conversations", () => {
    const records = [
      // Newest first (as returned by listConversations)
      makeRecord({
        id: "conv-2",
        startedAt: 2000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "北海道旅行",
          },
        ],
      }),
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "家族旅行",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const memoriesCategory = result.find((c) => c.category === "memories");
    const entry = memoriesCategory?.noteEntries.find(
      (e) => e.questionId === "memories-01",
    );

    expect(entry).toBeDefined();
    // Latest answer should be the current one
    expect(entry?.answer).toBe("北海道旅行");
    expect(entry?.conversationId).toBe("conv-2");
    expect(entry?.hasHistory).toBe(true);

    // previousVersions should contain the older answer
    expect(entry?.previousVersions).toHaveLength(1);
    expect(entry?.previousVersions[0]?.answer).toBe("家族旅行");
    expect(entry?.previousVersions[0]?.conversationId).toBe("conv-1");
    expect(entry?.previousVersions[0]?.recordedAt).toBe(1000);
  });

  it("orders previousVersions chronologically (oldest first) for 3+ updates", () => {
    const records = [
      makeRecord({
        id: "conv-3",
        startedAt: 3000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "沖縄旅行",
          },
        ],
      }),
      makeRecord({
        id: "conv-2",
        startedAt: 2000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "北海道旅行",
          },
        ],
      }),
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "家族旅行",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const entry = result
      .find((c) => c.category === "memories")
      ?.noteEntries.find((e) => e.questionId === "memories-01");

    expect(entry?.answer).toBe("沖縄旅行");
    expect(entry?.previousVersions).toHaveLength(2);
    // Oldest first
    expect(entry?.previousVersions[0]?.answer).toBe("家族旅行");
    expect(entry?.previousVersions[0]?.recordedAt).toBe(1000);
    expect(entry?.previousVersions[1]?.answer).toBe("北海道旅行");
    expect(entry?.previousVersions[1]?.recordedAt).toBe(2000);
  });

  it("does not mix entries from different questionIds", () => {
    const records = [
      makeRecord({
        id: "conv-2",
        startedAt: 2000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "更新された思い出",
          },
        ],
      }),
      makeRecord({
        id: "conv-1",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "最初の思い出",
          },
          {
            questionId: "memories-02",
            questionTitle: "子供時代",
            answer: "子供の頃の話",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const memoriesCategory = result.find((c) => c.category === "memories");

    const entry01 = memoriesCategory?.noteEntries.find(
      (e) => e.questionId === "memories-01",
    );
    const entry02 = memoriesCategory?.noteEntries.find(
      (e) => e.questionId === "memories-02",
    );

    expect(entry01?.hasHistory).toBe(true);
    expect(entry01?.previousVersions).toHaveLength(1);

    expect(entry02?.answer).toBe("子供の頃の話");
    expect(entry02?.hasHistory).toBe(false);
    expect(entry02?.previousVersions).toEqual([]);
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

    // Should not appear in memories
    expect(
      memoriesCategory?.noteEntries.find((e) => e.questionId === "money-01"),
    ).toBeUndefined();

    // Should appear in money
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
            questionId: "memories-01",
            questionTitle: "大切な思い出",
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
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "古い",
          },
        ],
      }),
    ];

    const result = buildCategoryData(records);
    const entry = result
      .find((c) => c.category === "memories")
      ?.noteEntries.find((e) => e.questionId === "memories-01");

    expect(entry?.audioAvailable).toBe(true);
    expect(entry?.previousVersions[0]?.audioAvailable).toBe(false);
  });
});
