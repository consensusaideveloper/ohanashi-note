import { describe, it, expect } from "vitest";

import { buildFamilyCategoryData } from "./useFamilyEndingNote";

import type { FamilyConversation } from "../lib/family-api";

function makeConversation(
  overrides: Partial<FamilyConversation> = {},
): FamilyConversation {
  return {
    id: crypto.randomUUID(),
    category: "memories",
    startedAt: Date.now(),
    summary: null,
    oneLinerSummary: null,
    noteEntries: [],
    coveredQuestionIds: [],
    keyPoints: null,
    ...overrides,
  };
}

describe("buildFamilyCategoryData", () => {
  it("transforms a single conversation with one noteEntry", () => {
    const conversations = [
      makeConversation({
        category: "memories",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "家族旅行",
          },
        ],
        coveredQuestionIds: ["memories-01"],
      }),
    ];

    const result = buildFamilyCategoryData(["memories"], conversations);
    expect(result).toHaveLength(1);

    const memoriesCategory = result[0];
    expect(memoriesCategory?.category).toBe("memories");
    expect(memoriesCategory?.label).toBe("思い出");
    expect(memoriesCategory?.answeredCount).toBe(1);
    expect(memoriesCategory?.totalQuestions).toBeGreaterThan(0);

    const entry = memoriesCategory?.noteEntries.find(
      (e) => e.questionId === "memories-01",
    );
    expect(entry).toBeDefined();
    expect(entry?.answer).toBe("家族旅行");
    expect(entry?.previousVersions).toEqual([]);
    expect(entry?.hasHistory).toBe(false);
    expect(entry?.audioAvailable).toBe(false);
  });

  it("builds version history from multiple conversations", () => {
    const conversations = [
      makeConversation({
        id: "conv-2",
        category: "memories",
        startedAt: 2000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "北海道旅行",
          },
        ],
        coveredQuestionIds: ["memories-01"],
      }),
      makeConversation({
        id: "conv-1",
        category: "memories",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "家族旅行",
          },
        ],
        coveredQuestionIds: ["memories-01"],
      }),
    ];

    const result = buildFamilyCategoryData(["memories"], conversations);
    const entry = result[0]?.noteEntries.find(
      (e) => e.questionId === "memories-01",
    );

    expect(entry?.answer).toBe("北海道旅行");
    expect(entry?.conversationId).toBe("conv-2");
    expect(entry?.hasHistory).toBe(true);
    expect(entry?.previousVersions).toHaveLength(1);
    expect(entry?.previousVersions[0]?.answer).toBe("家族旅行");
    expect(entry?.previousVersions[0]?.conversationId).toBe("conv-1");
    expect(entry?.previousVersions[0]?.recordedAt).toBe(1000);
  });

  it("filters out malformed noteEntries", () => {
    const conversations = [
      makeConversation({
        category: "memories",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "有効",
          },
          { questionId: "memories-02" }, // missing answer
          { answer: "回答のみ" }, // missing questionId and questionTitle
          "not-an-object",
          null,
          42,
        ],
        coveredQuestionIds: ["memories-01"],
      }),
    ];

    const result = buildFamilyCategoryData(["memories"], conversations);
    // Only the valid entry should appear
    expect(result[0]?.noteEntries).toHaveLength(1);
    expect(result[0]?.noteEntries[0]?.questionId).toBe("memories-01");
  });

  it("computes unanswered questions correctly", () => {
    const conversations = [
      makeConversation({
        category: "memories",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "回答",
          },
        ],
        coveredQuestionIds: ["memories-01"],
      }),
    ];

    const result = buildFamilyCategoryData(["memories"], conversations);
    const memoriesCategory = result[0];

    // Should have unanswered questions (total - 1 answered)
    expect(memoriesCategory?.unansweredQuestions.length).toBe(
      (memoriesCategory?.totalQuestions ?? 0) - 1,
    );
    // The answered question should not be in the unanswered list
    expect(
      memoriesCategory?.unansweredQuestions.find((q) => q.id === "memories-01"),
    ).toBeUndefined();
  });

  it("returns only accessible categories", () => {
    const conversations = [
      makeConversation({
        category: "memories",
        startedAt: 1000,
        noteEntries: [],
        coveredQuestionIds: [],
      }),
      makeConversation({
        category: "money",
        startedAt: 1000,
        noteEntries: [],
        coveredQuestionIds: [],
      }),
    ];

    // Only grant access to memories
    const result = buildFamilyCategoryData(["memories"], conversations);
    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe("memories");
  });

  it("includes disclaimer for legal categories", () => {
    const result = buildFamilyCategoryData(["legal"], []);
    const legalCategory = result.find((c) => c.category === "legal");
    expect(legalCategory?.disclaimer).toBeDefined();
    expect(typeof legalCategory?.disclaimer).toBe("string");
  });

  it("does not include disclaimer for non-legal categories", () => {
    const result = buildFamilyCategoryData(["memories"], []);
    const memoriesCategory = result.find((c) => c.category === "memories");
    expect(memoriesCategory?.disclaimer).toBeUndefined();
  });

  it("maintains QUESTION_CATEGORIES display order", () => {
    const result = buildFamilyCategoryData(
      ["money", "memories", "medical"],
      [],
    );
    // QUESTION_CATEGORIES order: memories, people, house, medical, ..., money, ...
    expect(result[0]?.category).toBe("memories");
    expect(result[1]?.category).toBe("medical");
    expect(result[2]?.category).toBe("money");
  });

  it("handles empty conversations list", () => {
    const result = buildFamilyCategoryData(["memories"], []);
    expect(result).toHaveLength(1);
    expect(result[0]?.answeredCount).toBe(0);
    expect(result[0]?.noteEntries).toHaveLength(0);
    expect(result[0]?.unansweredQuestions.length).toBe(
      result[0]?.totalQuestions,
    );
  });

  it("handles empty accessible categories", () => {
    const result = buildFamilyCategoryData([], []);
    expect(result).toHaveLength(0);
  });

  it("finds noteEntries from conversations with null category", () => {
    const conversations = [
      makeConversation({
        id: "conv-null-cat",
        category: null,
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "nullカテゴリからの回答",
          },
        ],
        coveredQuestionIds: ["memories-01"],
      }),
    ];

    const result = buildFamilyCategoryData(["memories"], conversations);
    expect(result[0]?.answeredCount).toBe(1);
    expect(result[0]?.noteEntries).toHaveLength(1);
    expect(result[0]?.noteEntries[0]?.answer).toBe("nullカテゴリからの回答");
  });

  it("finds noteEntries from conversations with a different category", () => {
    const conversations = [
      makeConversation({
        id: "conv-cross",
        category: "people",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "別カテゴリ会話からの回答",
          },
          {
            questionId: "people-01",
            questionTitle: "大切な人",
            answer: "家族",
          },
        ],
        coveredQuestionIds: ["memories-01", "people-01"],
      }),
    ];

    const result = buildFamilyCategoryData(
      ["memories", "people"],
      conversations,
    );
    const memoriesCategory = result.find((c) => c.category === "memories");
    const peopleCategory = result.find((c) => c.category === "people");

    expect(memoriesCategory?.noteEntries).toHaveLength(1);
    expect(memoriesCategory?.noteEntries[0]?.answer).toBe(
      "別カテゴリ会話からの回答",
    );
    expect(memoriesCategory?.answeredCount).toBe(1);

    expect(peopleCategory?.noteEntries).toHaveLength(1);
    expect(peopleCategory?.noteEntries[0]?.answer).toBe("家族");
    expect(peopleCategory?.answeredCount).toBe(1);
  });

  it("collects coveredQuestionIds across all conversations regardless of category", () => {
    const conversations = [
      makeConversation({
        category: "people",
        startedAt: 1000,
        noteEntries: [],
        coveredQuestionIds: ["memories-01", "memories-02"],
      }),
      makeConversation({
        category: null,
        startedAt: 2000,
        noteEntries: [],
        coveredQuestionIds: ["memories-06"],
      }),
    ];

    const result = buildFamilyCategoryData(["memories"], conversations);
    expect(result[0]?.answeredCount).toBe(3);
  });

  it("sets audioAvailable to false for all entries", () => {
    const conversations = [
      makeConversation({
        id: "conv-2",
        category: "memories",
        startedAt: 2000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "最新",
          },
        ],
        coveredQuestionIds: ["memories-01"],
      }),
      makeConversation({
        id: "conv-1",
        category: "memories",
        startedAt: 1000,
        noteEntries: [
          {
            questionId: "memories-01",
            questionTitle: "大切な思い出",
            answer: "古い",
          },
        ],
        coveredQuestionIds: ["memories-01"],
      }),
    ];

    const result = buildFamilyCategoryData(["memories"], conversations);
    const entry = result[0]?.noteEntries.find(
      (e) => e.questionId === "memories-01",
    );

    expect(entry?.audioAvailable).toBe(false);
    expect(entry?.previousVersions[0]?.audioAvailable).toBe(false);
  });
});
