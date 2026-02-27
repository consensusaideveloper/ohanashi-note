import { describe, it, expect } from "vitest";

import { UI_MESSAGES, MAX_REPRESENTATIVES } from "./constants";

describe("MAX_REPRESENTATIVES", () => {
  it("is a positive integer", () => {
    expect(MAX_REPRESENTATIVES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_REPRESENTATIVES)).toBe(true);
  });

  it("equals 3", () => {
    expect(MAX_REPRESENTATIVES).toBe(3);
  });
});

describe("UI_MESSAGES.family", () => {
  it("has all required family member management keys", () => {
    expect(UI_MESSAGES.family.pageTitle).toBeDefined();
    expect(UI_MESSAGES.family.pageDescription).toBeDefined();
    expect(UI_MESSAGES.family.membersSectionTitle).toBeDefined();
    expect(UI_MESSAGES.family.inviteButton).toBeDefined();
    expect(UI_MESSAGES.family.setRepresentative).toBeDefined();
    expect(UI_MESSAGES.family.revokeRepresentative).toBeDefined();
    expect(UI_MESSAGES.family.removeButton).toBeDefined();
    expect(UI_MESSAGES.family.editMember).toBeDefined();
    expect(UI_MESSAGES.family.editMemberDialogTitle).toBeDefined();
    expect(UI_MESSAGES.family.editMemberDescription).toBeDefined();
  });

  it("has all required multiple representative keys", () => {
    expect(UI_MESSAGES.family.representativeSet).toBeDefined();
    expect(UI_MESSAGES.family.maxRepresentativesReached).toBeDefined();
    expect(UI_MESSAGES.family.representativeHelp).toBeDefined();
    expect(UI_MESSAGES.family.representativeRevoked).toBeDefined();
  });

  it("has maxRepresentativesReached message containing the count", () => {
    expect(UI_MESSAGES.family.maxRepresentativesReached).toContain("3");
  });

  it("has all required access presets keys", () => {
    expect(UI_MESSAGES.family.accessPresetsSectionTitle).toBeDefined();
    expect(UI_MESSAGES.family.accessPresetsDescription).toBeDefined();
    expect(UI_MESSAGES.family.accessPresetsNoMembers).toBeDefined();
    expect(UI_MESSAGES.family.accessPresetsEmpty).toBeDefined();
    expect(UI_MESSAGES.family.accessPresetAdded).toBeDefined();
    expect(UI_MESSAGES.family.accessPresetRemoved).toBeDefined();
    expect(UI_MESSAGES.family.accessPresetsNotActive).toBeDefined();
    expect(UI_MESSAGES.family.accessPresetsRecommendationHint).toBeDefined();
    expect(UI_MESSAGES.family.accessPresetsApplyAll).toBeDefined();
  });

  it("has all required consent flow keys", () => {
    expect(UI_MESSAGES.family.consentDialogTitle).toBeDefined();
    expect(UI_MESSAGES.family.consentExplanation).toBeDefined();
    expect(UI_MESSAGES.family.consentDetailExplanation).toBeDefined();
    expect(UI_MESSAGES.family.consentAgreeButton).toBeDefined();
    expect(UI_MESSAGES.family.consentDeclineButton).toBeDefined();
    expect(UI_MESSAGES.family.consentGiven).toBeDefined();
    expect(UI_MESSAGES.family.consentDeclined).toBeDefined();
  });

  it("has consent detail explanation mentioning irreversibility", () => {
    expect(UI_MESSAGES.family.consentDetailExplanation).toContain("取り消す");
  });

  it("has all required lifecycle status keys", () => {
    expect(UI_MESSAGES.family.lifecycleActive).toBeDefined();
    expect(UI_MESSAGES.family.lifecycleDeath).toBeDefined();
    expect(UI_MESSAGES.family.lifecycleConsent).toBeDefined();
    expect(UI_MESSAGES.family.lifecycleOpened).toBeDefined();
  });

  it("has all required notification keys", () => {
    expect(UI_MESSAGES.family.noNotifications).toBeDefined();
  });

  it("has all text in Japanese", () => {
    const japanesePattern = /[\u3000-\u9FFF\uFF00-\uFFEF]/;
    expect(UI_MESSAGES.family.pageTitle).toMatch(japanesePattern);
    expect(UI_MESSAGES.family.consentExplanation).toMatch(japanesePattern);
    expect(UI_MESSAGES.family.accessPresetsDescription).toMatch(
      japanesePattern,
    );
    expect(UI_MESSAGES.family.noNotifications).toMatch(japanesePattern);
  });
});

describe("UI_MESSAGES.familyError", () => {
  it("has all required error keys", () => {
    expect(UI_MESSAGES.familyError.loadFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.inviteFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.removeFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.updateFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.acceptFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.reportDeathFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.cancelDeathFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.consentFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.consentStatusFailed).toBeDefined();
  });

  it("has all required access preset error keys", () => {
    expect(UI_MESSAGES.familyError.accessPresetsFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.accessPresetAddFailed).toBeDefined();
    expect(UI_MESSAGES.familyError.accessPresetRemoveFailed).toBeDefined();
    expect(
      UI_MESSAGES.familyError.accessPresetsRecommendationsFailed,
    ).toBeDefined();
  });
});
