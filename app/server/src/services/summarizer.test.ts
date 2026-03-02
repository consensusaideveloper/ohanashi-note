import { describe, it, expect } from "vitest";

import {
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

  it("falls back in focused mode when grounding drops all entries", () => {
    expect(shouldFallbackToUngroundedEntries("house", modelEntries, [])).toBe(
      true,
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
