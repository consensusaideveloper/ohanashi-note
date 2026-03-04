import { describe, expect, it } from "vitest";

import {
  normalizeStoredProfile,
  validateProfileUpdateValue,
} from "./profile-validation.js";

describe("normalizeStoredProfile", () => {
  it("returns safe defaults for invalid stored values", () => {
    expect(
      normalizeStoredProfile({
        name: "  ",
        characterId: "unknown",
        fontSize: "huge",
        speakingSpeed: "warp",
        silenceDuration: "zero",
        confirmationLevel: "always",
      }),
    ).toEqual({
      name: "",
      characterId: null,
      fontSize: "standard",
      speakingSpeed: "normal",
      silenceDuration: "normal",
      confirmationLevel: "normal",
    });
  });
});

describe("validateProfileUpdateValue", () => {
  it("rejects empty names", () => {
    const result = validateProfileUpdateValue("name", "   ");
    expect("error" in result && result.error.code).toBe("INVALID_NAME");
  });

  it("rejects invalid preference enums", () => {
    const result = validateProfileUpdateValue("silenceDuration", "forever");
    expect("error" in result && result.error.code).toBe(
      "INVALID_SILENCE_DURATION",
    );
  });

  it("accepts valid character changes", () => {
    expect(validateProfileUpdateValue("characterId", "character-b")).toEqual({
      normalized: "character-b",
    });
  });
});
