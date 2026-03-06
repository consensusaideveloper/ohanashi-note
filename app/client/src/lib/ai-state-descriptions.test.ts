import { describe, expect, it } from "vitest";

import {
  describeCurrentSettings,
  describeCurrentScreenContext,
  describeFamilyStatus,
  describeRecommendedNextAction,
} from "./ai-state-descriptions";

describe("describeCurrentSettings", () => {
  it("summarizes current settings in plain Japanese", () => {
    const result = describeCurrentSettings({
      name: "太郎",
      assistantName: "さくら",
      characterId: "character-b",
      fontSize: "large",
      speakingSpeed: "slow",
      silenceDuration: "long",
      confirmationLevel: "frequent",
      updatedAt: Date.now(),
    });

    expect(result).toContain("お名前は太郎さん");
    expect(result).toContain("話し相手はしっかり");
    expect(result).toContain("呼び名はさくら");
    expect(result).toContain("文字の大きさは大きめ");
    expect(result).toContain("話す速さはゆっくり");
  });
});

describe("describeFamilyStatus", () => {
  it("summarizes active family members and access presets", () => {
    const result = describeFamilyStatus(
      [
        {
          id: "family-1",
          memberId: "member-1",
          name: "花子",
          relationship: "spouse",
          relationshipLabel: "妻",
          role: "representative",
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ],
      [
        {
          id: "preset-1",
          familyMemberId: "family-1",
          memberName: "花子",
          categoryId: "medical",
          createdAt: new Date().toISOString(),
        },
      ],
    );

    expect(result).toContain("現在登録されているご家族は1人");
    expect(result).toContain("花子さんは妻");
    expect(result).toContain("医療・介護");
  });
});

describe("describeCurrentScreenContext", () => {
  it("describes the current screen and next actions", () => {
    const result = describeCurrentScreenContext("settings");

    expect(result).toContain("今は設定の画面です");
    expect(result).toContain("文字の大きさを変える");
    expect(result).toContain("話し相手や話し方を変える");
  });
});

describe("describeRecommendedNextAction", () => {
  it("guides next action on settings when assistant name is missing", () => {
    const result = describeRecommendedNextAction(
      "settings",
      {
        name: "太郎",
        assistantName: null,
        updatedAt: Date.now(),
      },
      [],
    );

    expect(result).toContain("話し相手の呼び名");
  });

  it("guides family invitation when no family members are registered", () => {
    const result = describeRecommendedNextAction(
      "family-dashboard",
      {
        name: "太郎",
        assistantName: "さくら",
        updatedAt: Date.now(),
      },
      [],
    );

    expect(result).toContain("最初に招待を作る");
  });
});
