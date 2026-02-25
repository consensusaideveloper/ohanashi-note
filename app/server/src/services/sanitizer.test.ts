import { describe, it, expect } from "vitest";

import { sanitizeText } from "./sanitizer";

describe("sanitizeText", () => {
  it("redacts credit card numbers with spaces", () => {
    const input = "1234 5678 9012 3456";
    const result = sanitizeText(input);
    expect(result).not.toContain("1234 5678 9012 3456");
    expect(result).toContain("[保護済み]");
  });

  it("redacts credit card numbers with hyphens", () => {
    const input = "1234-5678-9012-3456";
    const result = sanitizeText(input);
    expect(result).not.toContain("1234-5678-9012-3456");
    expect(result).toContain("[保護済み]");
  });

  it("redacts credit card numbers without separators", () => {
    const input = "1234567890123456";
    const result = sanitizeText(input);
    expect(result).not.toContain("1234567890123456");
    expect(result).toContain("[保護済み]");
  });

  it("redacts Japanese PIN patterns", () => {
    const input = "暗証番号：1234";
    const result = sanitizeText(input);
    expect(result).toContain("[保護済み]");
  });

  it("redacts password patterns", () => {
    const input = "パスワード: mypassword123";
    const result = sanitizeText(input);
    expect(result).not.toContain("mypassword123");
    expect(result).toContain("[保護済み]");
  });

  it("redacts long digit sequences (account numbers)", () => {
    const input = "口座番号は 12345678 です";
    const result = sanitizeText(input);
    expect(result).not.toContain("12345678");
    expect(result).toContain("[保護済み]");
  });

  it("does not redact short numbers", () => {
    const input = "3つの銀行を使っています";
    const result = sanitizeText(input);
    expect(result).toBe("3つの銀行を使っています");
  });

  it("preserves non-sensitive text", () => {
    const input = "三菱UFJ銀行の渋谷支店に口座があります";
    const result = sanitizeText(input);
    expect(result).toBe("三菱UFJ銀行の渋谷支店に口座があります");
  });
});
