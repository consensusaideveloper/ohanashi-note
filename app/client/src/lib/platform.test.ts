import { describe, it, expect, vi, afterEach } from "vitest";

import { isIOSDevice } from "./platform";

describe("isIOSDevice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true for iPhone user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    });
    expect(isIOSDevice()).toBe(true);
  });

  it("returns true for iPad with desktop user agent (iPadOS 13+)", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    });
    expect(isIOSDevice()).toBe(true);
  });

  it("returns false for actual Mac desktop", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      maxTouchPoints: 0,
    });
    expect(isIOSDevice()).toBe(false);
  });

  it("returns false for Android device", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      maxTouchPoints: 5,
    });
    expect(isIOSDevice()).toBe(false);
  });

  it("returns false when navigator is undefined (SSR)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isIOSDevice()).toBe(false);
  });
});
