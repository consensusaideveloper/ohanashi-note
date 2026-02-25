import { describe, it, expect } from "vitest";

import { getQuestionListForCategory, QUESTIONS } from "./questions";

describe("getQuestionListForCategory", () => {
  it("returns valid JSON for memories category", () => {
    const result = getQuestionListForCategory("memories");
    const parsed = JSON.parse(result) as Array<{
      id: string;
      title: string;
    }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const item of parsed) {
      expect(item.id).toMatch(/^memories-/);
      expect(typeof item.title).toBe("string");
    }
  });

  it("returns valid JSON for people category", () => {
    const result = getQuestionListForCategory("people");
    const parsed = JSON.parse(result) as Array<{
      id: string;
      title: string;
    }>;
    expect(parsed).toHaveLength(10);
    for (const item of parsed) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.title).toBe("string");
    }
  });

  it("includes only id and title fields", () => {
    const result = getQuestionListForCategory("house");
    const parsed = JSON.parse(result) as Array<Record<string, unknown>>;
    for (const item of parsed) {
      expect(Object.keys(item)).toEqual(["id", "title"]);
    }
  });
});

describe("QUESTIONS", () => {
  it("contains 111 questions", () => {
    expect(QUESTIONS).toHaveLength(111);
  });

  it("contains 12 legal questions", () => {
    const legal = QUESTIONS.filter((q) => q.category === "legal");
    expect(legal).toHaveLength(12);
  });

  it("contains 11 trust questions", () => {
    const trust = QUESTIONS.filter((q) => q.category === "trust");
    expect(trust).toHaveLength(11);
  });

  it("contains 8 support questions", () => {
    const support = QUESTIONS.filter((q) => q.category === "support");
    expect(support).toHaveLength(8);
  });
});
