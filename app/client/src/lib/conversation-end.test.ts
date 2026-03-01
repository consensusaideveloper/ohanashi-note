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
