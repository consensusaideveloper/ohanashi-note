import { describe, it, expect } from "vitest";

import {
  buildAnalysisTranscript,
  buildNoteUpdateProposals,
  filterGroundedNoteEntries,
  filterMeaningfulImportantStatements,
  filterSubstantiveDecisions,
  normalizeDiscussedCategories,
  resolveSummarizerTemperature,
  selectTranscriptForAnalysis,
  shouldFallbackToUngroundedEntries,
} from "./summarizer";

import type { InsightStatement } from "./summarizer";

function insight(
  text: string,
  category: InsightStatement["category"] = "other",
  importance: InsightStatement["importance"] = "medium",
): InsightStatement {
  return { text, category, importance };
}

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

describe("buildAnalysisTranscript", () => {
  it("annotates suspicious user utterances with assistant-confirmed domain terms", () => {
    const transcript = [
      {
        role: "assistant" as const,
        text: "使っている証券会社を教えてください",
      },
      { role: "user" as const, text: "6.0制限" },
      {
        role: "assistant" as const,
        text: "楽天証券ですね。ほかにも使っているところはありますか",
      },
    ];

    expect(buildAnalysisTranscript(transcript)[1]).toEqual({
      role: "user",
      text: "6.0制限（音声認識補正候補: 楽天証券）",
    });
  });

  it("does not annotate when the assistant is still asking a question", () => {
    const transcript = [
      {
        role: "assistant" as const,
        text: "使っている証券会社を教えてください",
      },
      { role: "user" as const, text: "6.0制限" },
      { role: "assistant" as const, text: "楽天証券ですか？" },
    ];

    expect(buildAnalysisTranscript(transcript)[1]).toEqual({
      role: "user",
      text: "6.0制限",
    });
  });
});

describe("filterGroundedNoteEntries", () => {
  it("accepts evidence from assistant-confirmed correction hints in user turns", () => {
    const noteEntries = [
      {
        questionId: "money-03",
        questionTitle: "利用中の証券会社",
        answer: "楽天証券を利用している",
        sourceEvidence: "楽天証券",
      },
    ];
    const transcript = [
      {
        role: "user" as const,
        text: "6.0制限（音声認識補正候補: 楽天証券）",
      },
    ];

    expect(filterGroundedNoteEntries(noteEntries, transcript)).toEqual(
      noteEntries,
    );
  });
});

describe("resolveSummarizerTemperature", () => {
  it("omits custom temperature for GPT-5 models", () => {
    expect(resolveSummarizerTemperature("gpt-5-mini", 0.2)).toBeUndefined();
    expect(resolveSummarizerTemperature("gpt-5-nano", 0.7)).toBeUndefined();
    expect(
      resolveSummarizerTemperature(" GPT-5-mini-2026-01-01 ", 0.4),
    ).toBeUndefined();
  });

  it("preserves configured temperature for non GPT-5 models", () => {
    expect(resolveSummarizerTemperature("gpt-4.1-mini", 0.2)).toBe(0.2);
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
      filterSubstantiveDecisions(["遺言書を作成する", "遺言書を作成する "]),
    ).toEqual(["遺言書を作成する"]);
  });
});

describe("filterMeaningfulImportantStatements", () => {
  it("removes filler and operation-like statements", () => {
    const result = filterMeaningfulImportantStatements([
      insight("ありがとうございます"),
      insight("今日はここまでにする"),
      insight("甘いものよりせんべいが好き", "hobbies"),
    ]);

    expect(result).toEqual([insight("甘いものよりせんべいが好き", "hobbies")]);
  });

  it("deduplicates surviving statements", () => {
    const result = filterMeaningfulImportantStatements([
      insight("雨の匂いが好き", "hobbies"),
      insight("雨の匂いが好き ", "hobbies"),
    ]);

    expect(result).toEqual([insight("雨の匂いが好き", "hobbies")]);
  });
});

describe("normalizeDiscussedCategories", () => {
  it("maps aliases to valid categories and preserves first-seen order", () => {
    expect(
      normalizeDiscussedCategories([
        "relationships",
        "money",
        "finance",
        "people",
      ]),
    ).toEqual(["people", "money"]);
  });

  it("drops unsupported categories and trims/case-normalizes values", () => {
    expect(
      normalizeDiscussedCategories([
        " LEGAL ",
        "unknown",
        "",
        "support",
        "RELATIONSHIP",
      ]),
    ).toEqual(["legal", "support", "people"]);
  });

  it("returns empty array when all categories are invalid", () => {
    expect(normalizeDiscussedCategories(["foo", "bar"])).toEqual([]);
  });
});

describe("buildNoteUpdateProposals", () => {
  it("creates update proposals for changed single-answer questions", () => {
    const result = buildNoteUpdateProposals(
      [
        {
          questionId: "medical-05",
          questionTitle: "延命治療の希望",
          answer: "延命治療は希望しない",
          sourceEvidence: "延命治療は希望しません",
        },
      ],
      [
        {
          questionId: "medical-05",
          questionTitle: "延命治療の希望",
          answer: "家族と相談して決めたい",
        },
      ],
    );

    expect(result).toEqual([
      {
        questionId: "medical-05",
        questionTitle: "延命治療の希望",
        category: "medical",
        questionType: "single",
        proposalType: "update",
        previousAnswer: "家族と相談して決めたい",
        proposedAnswer: "延命治療は希望しない",
        sourceEvidence: "延命治療は希望しません",
      },
    ]);
  });

  it("creates add proposals for new accumulative answers and skips duplicates", () => {
    const result = buildNoteUpdateProposals(
      [
        {
          questionId: "medical-02",
          questionTitle: "かかりつけの病院",
          answer: "桜木クリニック",
          sourceEvidence: "桜木クリニックに通っています",
        },
        {
          questionId: "medical-02",
          questionTitle: "かかりつけの病院",
          answer: "中央病院",
          sourceEvidence: "中央病院にも通っています",
        },
      ],
      [
        {
          questionId: "medical-02",
          questionTitle: "かかりつけの病院",
          answer: "中央病院",
        },
      ],
    );

    expect(result).toEqual([
      {
        questionId: "medical-02",
        questionTitle: "かかりつけの病院",
        category: "medical",
        questionType: "accumulative",
        proposalType: "add",
        previousAnswer: null,
        proposedAnswer: "桜木クリニック",
        sourceEvidence: "桜木クリニックに通っています",
      },
    ]);
  });

  it("limits proposals to two and prioritizes single-answer updates", () => {
    const result = buildNoteUpdateProposals([
      {
        questionId: "money-01",
        questionTitle: "メインの銀行",
        answer: "北洋銀行",
        sourceEvidence: "北洋銀行です",
      },
      {
        questionId: "work-01",
        questionTitle: "現在のお仕事",
        answer: "今はパートをしている",
        sourceEvidence: "今はパートをしています",
      },
      {
        questionId: "people-01",
        questionTitle: "大事な人",
        answer: "近所の佐藤さん",
        sourceEvidence: "佐藤さんにはお世話になっています",
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.questionId).toBe("money-01");
    expect(result[1]?.questionId).toBe("work-01");
  });
});
