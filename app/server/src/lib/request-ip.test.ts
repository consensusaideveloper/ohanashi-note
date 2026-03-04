import { describe, expect, it } from "vitest";

import { extractTrustedIpAddress } from "./request-ip.js";

describe("extractTrustedIpAddress", () => {
  it("prefers x-real-ip when it is valid", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.10, 203.0.113.10",
    });

    expect(extractTrustedIpAddress(headers)).toBe("203.0.113.10");
  });

  it("falls back to the last valid forwarded hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "spoofed, 198.51.100.42",
    });

    expect(extractTrustedIpAddress(headers)).toBe("198.51.100.42");
  });

  it("returns null for invalid values", () => {
    const headers = new Headers({
      "x-forwarded-for": "not-an-ip",
    });

    expect(extractTrustedIpAddress(headers)).toBeNull();
  });
});
