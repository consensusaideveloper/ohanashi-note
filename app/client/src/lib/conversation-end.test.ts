import { describe, expect, it } from "vitest";

import {
  hasExplicitConversationEndIntent,
  hasOnboardingCompletionSignal,
} from "./conversation-end";

describe("hasExplicitConversationEndIntent", () => {
  it("detects explicit close intent in natural Japanese phrasing", () => {
    expect(
      hasExplicitConversationEndIntent("今日はもういいかな、また今度"),
    ).toBe(true);
    expect(
      hasExplicitConversationEndIntent(
        "ありがとう、今日はここまででお願いします",
      ),
    ).toBe(true);
    expect(hasExplicitConversationEndIntent("終わりにしよう")).toBe(true);
  });

  it("detects fatigue expressions in various conjugations", () => {
    expect(hasExplicitConversationEndIntent("疲れた")).toBe(true);
    expect(hasExplicitConversationEndIntent("疲れちゃった")).toBe(true);
    expect(hasExplicitConversationEndIntent("疲れました")).toBe(true);
    expect(hasExplicitConversationEndIntent("疲れたわ")).toBe(true);
    expect(hasExplicitConversationEndIntent("ちょっと疲れちゃった")).toBe(true);
  });

  it("detects end-verb conjugations", () => {
    expect(hasExplicitConversationEndIntent("もう終わり")).toBe(true);
    expect(hasExplicitConversationEndIntent("今日はもう終わり")).toBe(true);
    expect(hasExplicitConversationEndIntent("もう終わろう")).toBe(true);
    expect(hasExplicitConversationEndIntent("もう終わります")).toBe(true);
    expect(hasExplicitConversationEndIntent("終わろう")).toBe(true);
    expect(hasExplicitConversationEndIntent("終わります")).toBe(true);
  });

  it("detects farewell phrases", () => {
    expect(hasExplicitConversationEndIntent("さようなら")).toBe(true);
    expect(hasExplicitConversationEndIntent("バイバイ")).toBe(true);
    expect(hasExplicitConversationEndIntent("おやすみなさい")).toBe(true);
  });

  it("detects sufficiency expressions", () => {
    expect(hasExplicitConversationEndIntent("もういい")).toBe(true);
    expect(hasExplicitConversationEndIntent("もういいです")).toBe(true);
    expect(hasExplicitConversationEndIntent("もういいよ")).toBe(true);
    expect(hasExplicitConversationEndIntent("もういいわ")).toBe(true);
  });

  it("detects time/amount boundary expressions", () => {
    expect(hasExplicitConversationEndIntent("もうこのくらいで")).toBe(true);
    expect(hasExplicitConversationEndIntent("もうそのくらいで")).toBe(true);
    expect(hasExplicitConversationEndIntent("そろそろ終わりにしよう")).toBe(
      true,
    );
    expect(hasExplicitConversationEndIntent("そろそろおしまい")).toBe(true);
  });

  it("does not trigger for ambiguous phrases (AI-only detection)", () => {
    expect(hasExplicitConversationEndIntent("ありがとうございました")).toBe(
      false,
    );
    expect(hasExplicitConversationEndIntent("そろそろ次の話題に")).toBe(false);
    expect(hasExplicitConversationEndIntent("お疲れ様です")).toBe(false);
  });

  it("does not trigger for similar but non-end expressions", () => {
    expect(hasExplicitConversationEndIntent("もういい加減にして")).toBe(false);
  });

  it("does not trigger for continue-intent utterances", () => {
    expect(
      hasExplicitConversationEndIntent(
        "また今度の話はあるけど、今日はもう少し続けたいです",
      ),
    ).toBe(false);
    expect(hasExplicitConversationEndIntent("まだ話したいです")).toBe(false);
  });
});

describe("hasOnboardingCompletionSignal", () => {
  it("detects completion summary/farewell style messages", () => {
    expect(
      hasOnboardingCompletionSignal(
        "設定ができました。次の画面でいつでもお話しできますよ。",
      ),
    ).toBe(true);
    expect(
      hasOnboardingCompletionSignal(
        "準備ができましたので、次の画面に進みましょう",
      ),
    ).toBe(true);
  });

  it("does not trigger for non-completion setup guidance", () => {
    expect(
      hasOnboardingCompletionSignal("これから設定を一緒に進めていきましょう"),
    ).toBe(false);
    expect(
      hasOnboardingCompletionSignal("文字の設定はあとで変更できます"),
    ).toBe(false);
  });
});
