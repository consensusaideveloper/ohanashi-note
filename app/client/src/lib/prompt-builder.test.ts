import { describe, expect, it } from "vitest";

import { buildSessionPrompt, buildSpeakingStylePrompt } from "./prompt-builder";

describe("buildSpeakingStylePrompt", () => {
  it("always includes elderly-friendly guardrails", () => {
    const prompt = buildSpeakingStylePrompt({
      speakingSpeed: "normal",
      silenceDuration: "normal",
      confirmationLevel: "normal",
    });

    expect(prompt).toContain("一度に一つの話題だけ扱い");
    expect(prompt).toContain("固有名詞・日付・数字が出たら");
    expect(prompt).toContain("聞き取れないときは推測せず");
    expect(prompt).toContain("語尾は常に「です・ます」調");
    expect(prompt).toContain(
      "明るすぎるテンションや、説教・命令の言い方は避けてください",
    );
  });

  it("reflects slow + long + frequent preferences", () => {
    const prompt = buildSpeakingStylePrompt({
      speakingSpeed: "slow",
      silenceDuration: "long",
      confirmationLevel: "frequent",
    });

    expect(prompt).toContain("20〜30文字程度を目安");
    expect(prompt).toContain("返答前に少し長めの間を取り");
    expect(prompt).toContain("ここまで大丈夫ですか？");
  });

  it("keeps safety floor with fast + short + minimal preferences", () => {
    const prompt = buildSpeakingStylePrompt({
      speakingSpeed: "fast",
      silenceDuration: "short",
      confirmationLevel: "minimal",
    });

    expect(prompt).toContain("速めでも「一文一要点」は守ってください");
    expect(prompt).toContain("返答までの間は短めにしつつ");
    expect(prompt).toContain("数字・固有名詞・意思決定は必ず1回だけ復唱");
  });
});

describe("buildSessionPrompt", () => {
  it("adds one-line opening bridge instruction when past summary exists", () => {
    const prompt = buildSessionPrompt(
      "character-a",
      "memories",
      {
        coveredQuestionIds: [],
        summaries: ["前回は家族旅行の思い出を話した。"],
      },
      "太郎",
      "さくら",
    );

    expect(prompt).toContain("【会話の冒頭ルール】");
    expect(prompt).toContain(
      "最初の返答の1文目は、次の定型文から1つをそのまま使ってください",
    );
    expect(prompt).toContain(
      "前回のお話の続きを、今日もゆっくり進めましょうね。",
    );
    expect(prompt).toContain("言い換え不可");
    expect(prompt).toContain(
      "前回の要点メモ: 前回は家族旅行の思い出を話した。",
    );
  });

  it("does not force opening bridge when no past summary exists", () => {
    const prompt = buildSessionPrompt(
      "character-a",
      "memories",
      {
        coveredQuestionIds: [],
        summaries: [],
      },
      "太郎",
      "さくら",
    );

    expect(prompt).not.toContain("【会話の冒頭ルール】");
  });

  it("still adds opening bridge when first summary is blank", () => {
    const prompt = buildSessionPrompt(
      "character-a",
      "memories",
      {
        coveredQuestionIds: [],
        summaries: ["   ", "前回はお墓の希望を確認した。"],
      },
      "太郎",
      "さくら",
    );

    expect(prompt).toContain("【会話の冒頭ルール】");
    expect(prompt).toContain("前回の要点メモ: 前回はお墓の希望を確認した。");
  });
});
