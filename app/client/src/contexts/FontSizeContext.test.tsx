import { describe, it, expect } from "vitest";

import { DEFAULT_FONT_SIZE_LEVEL, FONT_SIZE_OPTIONS } from "../lib/constants";

import type { FontSizeLevel } from "../types/conversation";

describe("Font size constants", () => {
  it("has standard as the default font size level", () => {
    expect(DEFAULT_FONT_SIZE_LEVEL).toBe("standard");
  });

  it("defines exactly three font size options", () => {
    expect(FONT_SIZE_OPTIONS).toHaveLength(3);
  });

  it("has options with correct values", () => {
    const values = FONT_SIZE_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["standard", "large", "x-large"]);
  });

  it("has Japanese labels for all options", () => {
    for (const option of FONT_SIZE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
    const labels = FONT_SIZE_OPTIONS.map((o) => o.label);
    expect(labels).toEqual(["ふつう", "大きめ", "とても大きい"]);
  });

  it("has values that satisfy the FontSizeLevel type", () => {
    const validLevels: FontSizeLevel[] = ["standard", "large", "x-large"];
    for (const option of FONT_SIZE_OPTIONS) {
      expect(validLevels).toContain(option.value);
    }
  });
});
