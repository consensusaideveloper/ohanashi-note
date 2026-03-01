import { describe, it, expect } from "vitest";

import { getQuestionsByCategory, QUESTIONS } from "./questions";

describe("getQuestionsByCategory", () => {
  it("returns only questions for the memories category", () => {
    const result = getQuestionsByCategory("memories");
    expect(result).toHaveLength(6);
    for (const q of result) {
      expect(q.category).toBe("memories");
    }
  });

  it("returns only questions for the people category", () => {
    const result = getQuestionsByCategory("people");
    expect(result).toHaveLength(10);
    for (const q of result) {
      expect(q.category).toBe("people");
    }
  });

  it("returns only questions for the house category", () => {
    const result = getQuestionsByCategory("house");
    expect(result).toHaveLength(5);
    for (const q of result) {
      expect(q.category).toBe("house");
    }
  });

  it("returns only questions for the medical category", () => {
    const result = getQuestionsByCategory("medical");
    expect(result).toHaveLength(13);
    for (const q of result) {
      expect(q.category).toBe("medical");
    }
  });

  it("returns only questions for the work category", () => {
    const result = getQuestionsByCategory("work");
    expect(result).toHaveLength(9);
    for (const q of result) {
      expect(q.category).toBe("work");
    }
  });

  it("returns only questions for the funeral category", () => {
    const result = getQuestionsByCategory("funeral");
    expect(result).toHaveLength(11);
    for (const q of result) {
      expect(q.category).toBe("funeral");
    }
  });

  it("returns only questions for the money category", () => {
    const result = getQuestionsByCategory("money");
    expect(result).toHaveLength(18);
    for (const q of result) {
      expect(q.category).toBe("money");
    }
  });

  it("returns only questions for the legal category", () => {
    const result = getQuestionsByCategory("legal");
    expect(result).toHaveLength(12);
    for (const q of result) {
      expect(q.category).toBe("legal");
    }
  });

  it("returns only questions for the trust category", () => {
    const result = getQuestionsByCategory("trust");
    expect(result).toHaveLength(11);
    for (const q of result) {
      expect(q.category).toBe("trust");
    }
  });

  it("returns only questions for the support category", () => {
    const result = getQuestionsByCategory("support");
    expect(result).toHaveLength(8);
    for (const q of result) {
      expect(q.category).toBe("support");
    }
  });

  it("returns an empty array for an unknown category", () => {
    const result = getQuestionsByCategory("nonexistent" as "memories");
    expect(result).toEqual([]);
  });
});

describe("QUESTIONS", () => {
  it("contains 110 total questions", () => {
    expect(QUESTIONS).toHaveLength(110);
  });

  it("has unique question IDs", () => {
    const ids = QUESTIONS.map((q) => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
