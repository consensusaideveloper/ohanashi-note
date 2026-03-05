import { describe, expect, it } from "vitest";

import { hasPersistableUserUtterance } from "./conversation-persistence";

describe("hasPersistableUserUtterance", () => {
  it("returns false for assistant-only transcript", () => {
    expect(
      hasPersistableUserUtterance([
        { role: "assistant", text: "こんにちは", timestamp: 1 },
      ]),
    ).toBe(false);
  });

  it("returns false for blank user text", () => {
    expect(
      hasPersistableUserUtterance([
        { role: "user", text: "   ", timestamp: 1 },
      ]),
    ).toBe(false);
  });

  it("returns true when user utterance exists", () => {
    expect(
      hasPersistableUserUtterance([
        { role: "assistant", text: "こんにちは", timestamp: 1 },
        { role: "user", text: "お願いします", timestamp: 2 },
      ]),
    ).toBe(true);
  });
});
