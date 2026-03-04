import { describe, it, expect } from "vitest";

import { getAcceptedUserTranscript, isNoiseTranscript } from "./audio";

describe("isNoiseTranscript", () => {
  it("detects known Whisper hallucination patterns", () => {
    expect(isNoiseTranscript("ご視聴ありがとうございました")).toBe(true);
    expect(isNoiseTranscript("チャンネル登録お願いします")).toBe(true);
    expect(isNoiseTranscript("お疲れ様でした")).toBe(true);
  });

  it("detects punctuation-only transcripts as noise", () => {
    expect(isNoiseTranscript("。。。")).toBe(true);
    expect(isNoiseTranscript("、、")).toBe(true);
    expect(isNoiseTranscript("   ")).toBe(true);
  });

  it("allows genuine transcripts", () => {
    expect(isNoiseTranscript("今日はいい天気ですね")).toBe(false);
    expect(isNoiseTranscript("私の家族について話したいです")).toBe(false);
  });

  it("detects patterns embedded in longer text", () => {
    expect(isNoiseTranscript("はい、ご視聴ありがとうございました、では")).toBe(
      true,
    );
  });

  it("does not filter conversation-end signals", () => {
    expect(isNoiseTranscript("ありがとうございました")).toBe(false);
    expect(isNoiseTranscript("おやすみなさい")).toBe(false);
    expect(isNoiseTranscript("ありがとうございました、今日はここまでで")).toBe(
      false,
    );
  });
});

describe("getAcceptedUserTranscript", () => {
  it("returns trimmed text for a valid transcript", () => {
    expect(getAcceptedUserTranscript(" こんにちは ")).toBe("こんにちは");
  });

  it("rejects transcripts shorter than the minimum length", () => {
    expect(getAcceptedUserTranscript("あ")).toBeNull();
  });

  it("rejects known noise transcripts", () => {
    expect(
      getAcceptedUserTranscript("ご視聴ありがとうございました"),
    ).toBeNull();
  });

  it("rejects transcripts received during the audio guard window", () => {
    expect(
      getAcceptedUserTranscript("こんにちは", {
        receivedAt: 999,
        ignoreUntil: 1000,
      }),
    ).toBeNull();
  });
});
