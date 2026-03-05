import { describe, expect, it } from "vitest";

import { hasPersistableUserUtterance } from "./conversation-persistence.js";

describe("hasPersistableUserUtterance", () => {
  it("returns false for non-array transcript", () => {
    expect(hasPersistableUserUtterance(null)).toBe(false);
    expect(hasPersistableUserUtterance({})).toBe(false);
  });

  it("returns false for assistant-only transcript", () => {
    expect(
      hasPersistableUserUtterance([{ role: "assistant", text: "こんにちは" }]),
    ).toBe(false);
  });

  it("returns false when user text is blank", () => {
    expect(
      hasPersistableUserUtterance([{ role: "user", text: "   " }]),
    ).toBe(false);
  });

  it("returns true when at least one non-empty user utterance exists", () => {
    expect(
      hasPersistableUserUtterance([
        { role: "assistant", text: "こんにちは" },
        { role: "user", text: "お願いします" },
      ]),
    ).toBe(true);
  });
});
