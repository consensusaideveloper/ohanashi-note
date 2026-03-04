import { describe, expect, it } from "vitest";

import { buildFlexibleNoteItems } from "./flexible-notes";

describe("buildFlexibleNoteItems", () => {
  it("keeps meaningful free-form statements and orders them newest first", () => {
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
      {
        conversationId: "conv-2",
        startedAt: 2000,
        importantStatements: ["雨の匂いが好き"],
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
          "今日はここまでにする",
          "ありがとうございます",
          "昔の友人とは年賀状だけ続いている",
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
        importantStatements: ["コーヒーよりお茶が好き"],
        noteEntries: [],
      },
      {
        conversationId: "conv-2",
        startedAt: 2000,
        importantStatements: ["コーヒーよりお茶が好き "],
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
          "好きな食べ物はそば",
          "写真を撮るのが好き",
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
});
