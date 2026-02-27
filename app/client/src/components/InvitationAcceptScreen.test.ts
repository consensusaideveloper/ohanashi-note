import { describe, it, expect, beforeEach } from "vitest";

import { ApiError } from "../lib/api";
import {
  INVITATION_MESSAGES,
  INVITATION_SUCCESS_DELAY_MS,
  INVITE_PATH_PREFIX,
} from "../lib/constants";

import { getInviteTokenFromUrl } from "../lib/inviteUrl";

import { parseApiError } from "./InvitationAcceptScreen";

// --- getInviteTokenFromUrl tests ---
// We test the URL parsing logic by manipulating window.location

function setPathname(pathname: string): void {
  Object.defineProperty(window, "location", {
    value: {
      pathname,
      origin: window.location.origin,
      href: window.location.href,
      host: window.location.host,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      port: window.location.port,
      search: window.location.search,
      hash: window.location.hash,
    },
    writable: true,
    configurable: true,
  });
}

describe("INVITATION_MESSAGES constants", () => {
  it("has all required screen text keys", () => {
    expect(INVITATION_MESSAGES.screenTitle).toBe("家族の招待");
    expect(INVITATION_MESSAGES.loadingText).toBeDefined();
    expect(INVITATION_MESSAGES.fromUser).toBeDefined();
    expect(INVITATION_MESSAGES.acceptButton).toBeDefined();
    expect(INVITATION_MESSAGES.acceptingButton).toBeDefined();
    expect(INVITATION_MESSAGES.successTitle).toBeDefined();
    expect(INVITATION_MESSAGES.successMessage).toBeDefined();
    expect(INVITATION_MESSAGES.startAppButton).toBeDefined();
    expect(INVITATION_MESSAGES.skipLink).toBeDefined();
  });

  it("has all required error message keys", () => {
    expect(INVITATION_MESSAGES.notFound).toBeDefined();
    expect(INVITATION_MESSAGES.alreadyUsed).toBeDefined();
    expect(INVITATION_MESSAGES.selfInvite).toBeDefined();
    expect(INVITATION_MESSAGES.alreadyMember).toBeDefined();
    expect(INVITATION_MESSAGES.genericError).toBeDefined();
    expect(INVITATION_MESSAGES.retryButton).toBeDefined();
    expect(INVITATION_MESSAGES.backToAppButton).toBeDefined();
  });

  it("has all text in Japanese", () => {
    // Verify key messages contain Japanese characters
    expect(INVITATION_MESSAGES.screenTitle).toMatch(/[\u3000-\u9FFF]/);
    expect(INVITATION_MESSAGES.notFound).toMatch(/[\u3000-\u9FFF]/);
    expect(INVITATION_MESSAGES.acceptButton).toMatch(/[\u3000-\u9FFF]/);
    expect(INVITATION_MESSAGES.successTitle).toMatch(/[\u3000-\u9FFF]/);
  });
});

describe("INVITE_PATH_PREFIX", () => {
  it("starts with /invite/", () => {
    expect(INVITE_PATH_PREFIX).toBe("/invite/");
  });
});

describe("INVITATION_SUCCESS_DELAY_MS", () => {
  it("is a positive number", () => {
    expect(INVITATION_SUCCESS_DELAY_MS).toBeGreaterThan(0);
  });
});

describe("getInviteTokenFromUrl", () => {
  beforeEach(() => {
    // Reset to default pathname
    setPathname("/");
  });

  it("returns null for root path", () => {
    setPathname("/");
    expect(getInviteTokenFromUrl()).toBeNull();
  });

  it("extracts token from /invite/{token} path", () => {
    setPathname("/invite/abc-123-def");
    expect(getInviteTokenFromUrl()).toBe("abc-123-def");
  });

  it("returns null for /invite/ with no token", () => {
    setPathname("/invite/");
    expect(getInviteTokenFromUrl()).toBeNull();
  });

  it("returns null for paths that do not start with /invite/", () => {
    setPathname("/settings");
    expect(getInviteTokenFromUrl()).toBeNull();
  });

  it("returns null for tokens with slashes (extra path segments)", () => {
    setPathname("/invite/abc/extra");
    expect(getInviteTokenFromUrl()).toBeNull();
  });

  it("handles UUID-style tokens", () => {
    setPathname("/invite/550e8400-e29b-41d4-a716-446655440000");
    expect(getInviteTokenFromUrl()).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });
});

describe("parseApiError", () => {
  it("parses NOT_FOUND error code", () => {
    const error = new ApiError(
      404,
      JSON.stringify({ error: "招待が見つかりません", code: "NOT_FOUND" }),
    );
    const result = parseApiError(error);
    expect(result.message).toBe(INVITATION_MESSAGES.notFound);
    expect(result.code).toBe("NOT_FOUND");
  });

  it("parses EXPIRED error code", () => {
    const error = new ApiError(
      410,
      JSON.stringify({
        error: "招待の有効期限が切れています",
        code: "EXPIRED",
      }),
    );
    const result = parseApiError(error);
    expect(result.message).toBe(INVITATION_MESSAGES.notFound);
    expect(result.code).toBe("EXPIRED");
  });

  it("parses ALREADY_ACCEPTED error code", () => {
    const error = new ApiError(
      410,
      JSON.stringify({
        error: "この招待はすでに使用されています",
        code: "ALREADY_ACCEPTED",
      }),
    );
    const result = parseApiError(error);
    expect(result.message).toBe(INVITATION_MESSAGES.alreadyUsed);
    expect(result.code).toBe("ALREADY_ACCEPTED");
  });

  it("parses SELF_INVITE error code", () => {
    const error = new ApiError(
      400,
      JSON.stringify({
        error: "ご自身を家族として登録することはできません",
        code: "SELF_INVITE",
      }),
    );
    const result = parseApiError(error);
    expect(result.message).toBe(INVITATION_MESSAGES.selfInvite);
    expect(result.code).toBe("SELF_INVITE");
  });

  it("parses ALREADY_MEMBER error code", () => {
    const error = new ApiError(
      409,
      JSON.stringify({
        error: "すでに家族として登録されています",
        code: "ALREADY_MEMBER",
      }),
    );
    const result = parseApiError(error);
    expect(result.message).toBe(INVITATION_MESSAGES.alreadyMember);
    expect(result.code).toBe("ALREADY_MEMBER");
  });

  it("returns generic error for unknown ApiError codes", () => {
    const error = new ApiError(
      500,
      JSON.stringify({ error: "Unknown error", code: "UNKNOWN_CODE" }),
    );
    const result = parseApiError(error);
    expect(result.message).toBe(INVITATION_MESSAGES.genericError);
    expect(result.code).toBe("UNKNOWN_CODE");
  });

  it("returns generic error for non-JSON ApiError response body", () => {
    const error = new ApiError(500, "Internal Server Error");
    const result = parseApiError(error);
    expect(result.message).toBe(INVITATION_MESSAGES.genericError);
    expect(result.code).toBe("");
  });

  it("returns generic error for non-ApiError errors", () => {
    const error = new Error("Network error");
    const result = parseApiError(error);
    expect(result.message).toBe(INVITATION_MESSAGES.genericError);
    expect(result.code).toBe("");
  });

  it("returns generic error for non-Error values", () => {
    const result = parseApiError("string error");
    expect(result.message).toBe(INVITATION_MESSAGES.genericError);
    expect(result.code).toBe("");
  });
});
