import { afterEach, describe, expect, it } from "vitest";

import {
  __resetDataExportGuardForTests,
  tryStartDataExport,
} from "./data-export-guard.js";

afterEach(() => {
  __resetDataExportGuardForTests();
});

describe("tryStartDataExport", () => {
  it("rejects overly large full exports", () => {
    const result = tryStartDataExport({
      userId: "user-1",
      includeAudio: false,
      conversationCount: 1201,
      nowMs: 900,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.status).toBe(413);
      expect(result.code).toBe("EXPORT_SCOPE_TOO_LARGE");
    }
  });

  it("rejects overly large audio exports", () => {
    const result = tryStartDataExport({
      userId: "user-1",
      includeAudio: true,
      conversationCount: 121,
      nowMs: 1000,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.status).toBe(413);
      expect(result.code).toBe("EXPORT_AUDIO_TOO_LARGE");
    }
  });

  it("rejects second concurrent export for the same user", () => {
    const first = tryStartDataExport({
      userId: "user-1",
      includeAudio: false,
      conversationCount: 10,
      nowMs: 1000,
    });
    expect(first.allowed).toBe(true);

    const second = tryStartDataExport({
      userId: "user-1",
      includeAudio: false,
      conversationCount: 10,
      nowMs: 1001,
    });

    expect(second.allowed).toBe(false);
    if (!second.allowed) {
      expect(second.status).toBe(429);
      expect(second.code).toBe("EXPORT_ALREADY_RUNNING");
    }

    if (first.allowed) {
      first.lease.release();
    }
  });

  it("rejects when global concurrent exports are saturated", () => {
    const first = tryStartDataExport({
      userId: "user-1",
      includeAudio: false,
      conversationCount: 10,
      nowMs: 2000,
    });
    const second = tryStartDataExport({
      userId: "user-2",
      includeAudio: false,
      conversationCount: 10,
      nowMs: 2001,
    });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);

    const third = tryStartDataExport({
      userId: "user-3",
      includeAudio: false,
      conversationCount: 10,
      nowMs: 2002,
    });
    expect(third.allowed).toBe(false);
    if (!third.allowed) {
      expect(third.status).toBe(429);
      expect(third.code).toBe("EXPORT_SERVER_BUSY");
    }

    if (first.allowed) first.lease.release();
    if (second.allowed) second.lease.release();
  });

  it("applies cooldown after completion", () => {
    const first = tryStartDataExport({
      userId: "user-1",
      includeAudio: false,
      conversationCount: 10,
      nowMs: 5000,
    });
    expect(first.allowed).toBe(true);
    if (first.allowed) {
      first.lease.release();
    }

    const immediateRetry = tryStartDataExport({
      userId: "user-1",
      includeAudio: false,
      conversationCount: 10,
      nowMs: 5001,
    });
    expect(immediateRetry.allowed).toBe(false);
    if (!immediateRetry.allowed) {
      expect(immediateRetry.status).toBe(429);
      expect(immediateRetry.code).toBe("EXPORT_COOLDOWN");
      expect(immediateRetry.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});
