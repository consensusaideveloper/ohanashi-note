import { describe, expect, it } from "vitest";

import { buildFlexibleNoteItems } from "./flexible-notes";

import type { InsightStatement } from "../types/conversation";

function insight(
  text: string,
  category: InsightStatement["category"] = "hobbies",
  importance: InsightStatement["importance"] = "medium",
): InsightStatement {
  return { text, category, importance };
}

describe("buildFlexibleNoteItems", () => {
  it("keeps meaningful free-form statements and orders them newest first", () => {
    const result = buildFlexibleNoteItems([
      {
        conversationId: "conv-1",
        startedAt: 1000,
        importantStatements: [
          insight("甘いものよりしょっぱいものが好き"),
          insight("若い頃は喫茶店によく通っていた", "memories"),
        ],
        noteEntries: [],
      },
      {
        conversationId: "conv-2",
        startedAt: 2000,
        importantStatements: [insight("雨の匂いが好き")],
        noteEntries: [],
      },
    ]);

    expect(result.map((item) => item.text)).toEqual([
      "雨の匂いが好き",
      "甘いものよりしょっぱいものが好き",
      "若い頃は喫茶店によく通っていた",
    ]);
  });

  it("removes operational or filler statements", () => {
    const result = buildFlexibleNoteItems([
      {
        conversationId: "conv-1",
        startedAt: 1000,
        importantStatements: [
          insight("今日はここまでにする", "other", "low"),
          insight("ありがとうございます", "other", "low"),
          insight("昔の友人とは年賀状だけ続いている", "relationships"),
        ],
        noteEntries: [],
      },
    ]);

    expect(result.map((item) => item.text)).toEqual([
      "昔の友人とは年賀状だけ続いている",
    ]);
  });

  it("merges repeated statements across conversations", () => {
    const result = buildFlexibleNoteItems([
      {
        conversationId: "conv-1",
        startedAt: 1000,
        importantStatements: [insight("コーヒーよりお茶が好き")],
        noteEntries: [],
      },
      {
        conversationId: "conv-2",
        startedAt: 2000,
        importantStatements: [insight("コーヒーよりお茶が好き ")],
        noteEntries: [],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      text: "コーヒーよりお茶が好き",
      conversationId: "conv-2",
      recordedAt: 2000,
      mentionCount: 2,
    });
  });

  it("drops statements already captured in structured note entries", () => {
    const result = buildFlexibleNoteItems([
      {
        conversationId: "conv-1",
        startedAt: 1000,
        importantStatements: [
          insight("好きな食べ物はそば"),
          insight("写真を撮るのが好き"),
        ],
        noteEntries: [
          {
            answer: "好きな食べ物はそば",
            sourceEvidence: "好きな食べ物はそば",
          },
        ],
      },
    ]);

    expect(result.map((item) => item.text)).toEqual(["写真を撮るのが好き"]);
  });

  it("drops single-mention low-importance items", () => {
    const result = buildFlexibleNoteItems([
      {
        conversationId: "conv-1",
        startedAt: 1000,
        importantStatements: [
          insight("今日はカレーを食べた", "other", "low"),
          insight("雨の匂いが好き", "hobbies", "medium"),
        ],
        noteEntries: [],
      },
    ]);

    expect(result.map((item) => item.text)).toEqual(["雨の匂いが好き"]);
  });

  it("keeps repeated topics even if low importance", () => {
    const result = buildFlexibleNoteItems([
      {
        conversationId: "conv-1",
        startedAt: 1000,
        importantStatements: [insight("近所の喫茶店に行った", "other", "low")],
        noteEntries: [],
      },
      {
        conversationId: "conv-2",
        startedAt: 2000,
        importantStatements: [insight("近所の喫茶店に行った", "other", "low")],
        noteEntries: [],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      text: "近所の喫茶店に行った",
      mentionCount: 2,
      recordedAt: 2000,
    });
  });

  it("preserves category and importance from InsightStatement", () => {
    const result = buildFlexibleNoteItems([
      {
        conversationId: "conv-1",
        startedAt: 1000,
        importantStatements: [
          insight("家族のことが一番大事", "values", "high"),
        ],
        noteEntries: [],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: "values",
      importance: "high",
    });
  });

  it("handles legacy string format with backward compatibility", () => {
    const result = buildFlexibleNoteItems([
      {
        conversationId: "conv-1",
        startedAt: 1000,
        importantStatements: [
          "甘いものよりしょっぱいものが好き",
          "若い頃は喫茶店によく通っていた",
        ],
        noteEntries: [],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.category).toBe("other");
    expect(result[0]?.importance).toBe("medium");
  });
});
