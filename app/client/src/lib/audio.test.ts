import { describe, it, expect } from "vitest";

import { isNoiseTranscript } from "./audio";

describe("isNoiseTranscript", () => {
  it("detects known Whisper hallucination patterns", () => {
    expect(isNoiseTranscript("ご視聴ありがとうございました")).toBe(true);
    expect(isNoiseTranscript("チャンネル登録お願いします")).toBe(true);
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
});
