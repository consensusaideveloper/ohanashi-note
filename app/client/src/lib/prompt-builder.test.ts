import { describe, expect, it } from "vitest";

import {
  buildOnboardingPrompt,
  buildSessionPrompt,
  buildSpeakingStylePrompt,
} from "./prompt-builder";

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

describe("buildOnboardingPrompt", () => {
  it("makes assistant-name confirmation explicit and offers a candidate", () => {
    const prompt = buildOnboardingPrompt(undefined, "さくら");

    expect(prompt).toContain("私の呼び名は今『さくら』ですが");
    expect(prompt).toContain("別の呼び名に変えても大丈夫ですよ");
  });

  it("avoids ambiguous 'current as-is' wording when no assistant name exists", () => {
    const prompt = buildOnboardingPrompt();

    expect(prompt).toContain("たとえば『のんびり』でも大丈夫");
    expect(prompt).toContain("好きな呼び名を自由に決めていただいても大丈夫");
    expect(prompt).toContain("今はまだ呼び名が決まっていない");
  });

  it("does not inherit main-conversation note collection instructions", () => {
    const prompt = buildOnboardingPrompt();

    expect(prompt).toContain("この会話の目的は初回設定の完了だけです");
    expect(prompt).toContain("最初の質問は必ずお名前確認にしてください");
    expect(prompt).toContain(
      "通常会話用の「まだ聞いていない質問から聞く」という進め方はこの会話では無効です",
    );
    expect(prompt).toContain("complete_onboarding");
  });

  it("tells the model to use read capabilities for app state questions", () => {
    const prompt = buildSessionPrompt("character-a", "memories");

    expect(prompt).toContain("search_my_information");
    expect(prompt).toContain("get_current_settings");
    expect(prompt).toContain("get_current_screen_context");
    expect(prompt).toContain("get_recommended_next_action");
    expect(prompt).toContain("get_family_status");
    expect(prompt).toContain("読み取り系ツールは、ユーザーが確認したいと言ったときに優先して使う");
    expect(prompt).toContain("過去会話とノートのどちらにあるか分からない情報を探す時の第一候補");
    expect(prompt).toContain("次の一歩を案内する");
  });
});
