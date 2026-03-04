import { describe, it, expect } from "vitest";

import {
  filterMeaningfulImportantStatements,
  filterSubstantiveDecisions,
  selectTranscriptForAnalysis,
  shouldFallbackToUngroundedEntries,
} from "./summarizer";

describe("selectTranscriptForAnalysis", () => {
  it("keeps assistant turns when user utterances exist", () => {
    const transcript = [
      { role: "assistant" as const, text: "今日は生活のことを伺います" },
      { role: "user" as const, text: "コレクションがあります" },
    ];

    expect(selectTranscriptForAnalysis(transcript)).toEqual(transcript);
  });

  it("returns fallback when there is no user utterance", () => {
    const transcript = [{ role: "assistant" as const, text: "こんにちは" }];

    expect(selectTranscriptForAnalysis(transcript)).toEqual([
      { role: "user", text: "（ユーザー発話なし）" },
    ]);
  });
});

describe("shouldFallbackToUngroundedEntries", () => {
  const modelEntries = [
    {
      questionId: "house-02",
      questionTitle: "貴重品・コレクション",
      answer: "切手のコレクションがある",
      sourceEvidence: "切手のコレクションがあります",
    },
  ];

  it("does not fall back in focused mode when grounding drops all entries", () => {
    expect(shouldFallbackToUngroundedEntries("house", modelEntries, [])).toBe(
      false,
    );
  });

  it("does not fall back in guided mode", () => {
    expect(shouldFallbackToUngroundedEntries(null, modelEntries, [])).toBe(
      false,
    );
  });

  it("does not fall back when grounded entries remain", () => {
    expect(
      shouldFallbackToUngroundedEntries("house", modelEntries, modelEntries),
    ).toBe(false);
  });

  it("does not fall back when model produced no entries", () => {
    expect(shouldFallbackToUngroundedEntries("house", [], [])).toBe(false);
  });
});

describe("filterSubstantiveDecisions", () => {
  it("removes conversation-ending decisions", () => {
    expect(
      filterSubstantiveDecisions([
        "今日はここまでにする",
        "また今度にする",
        "葬儀は家族葬にする",
      ]),
    ).toEqual(["葬儀は家族葬にする"]);
  });

  it("removes app-setting decisions", () => {
    expect(
      filterSubstantiveDecisions([
        "話す速さはゆっくりにする",
        "文字の大きさは大きめにする",
        "延命治療は希望しない",
      ]),
    ).toEqual(["延命治療は希望しない"]);
  });

  it("deduplicates surviving decisions", () => {
    expect(
      filterSubstantiveDecisions([
        "遺言書を作成する",
        "遺言書を作成する ",
      ]),
    ).toEqual(["遺言書を作成する"]);
  });
});

describe("filterMeaningfulImportantStatements", () => {
  it("removes filler and operation-like statements", () => {
    expect(
      filterMeaningfulImportantStatements([
        "ありがとうございます",
        "今日はここまでにする",
        "甘いものよりせんべいが好き",
      ]),
    ).toEqual(["甘いものよりせんべいが好き"]);
  });

  it("deduplicates surviving statements", () => {
    expect(
      filterMeaningfulImportantStatements([
        "雨の匂いが好き",
        "雨の匂いが好き ",
      ]),
    ).toEqual(["雨の匂いが好き"]);
  });
});
