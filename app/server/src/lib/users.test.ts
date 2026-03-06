import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveUserId } from "./users";

vi.mock("../db/connection.js", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
      deletedAuthIdentities: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
  },
}));

vi.mock("./logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

let db: typeof import("../db/connection.js").db;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../db/connection.js");
  db = mod.db;
});

describe("resolveUserId", () => {
  it("returns an existing user id when found", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: "user-1",
    } as never);

    await expect(resolveUserId("firebase-uid")).resolves.toBe("user-1");
  });

  it("rejects recreation when the firebase uid is tombstoned", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.query.deletedAuthIdentities.findFirst).mockResolvedValue({
      id: "deleted-1",
    } as never);

    await expect(resolveUserId("firebase-uid")).rejects.toThrow(
      "このアカウントは削除済みです",
    );
  });

  it("creates a new user when no existing or tombstoned identity exists", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.query.deletedAuthIdentities.findFirst).mockResolvedValue(
      undefined,
    );

    const returning = vi.fn().mockResolvedValue([{ id: "new-user" }]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    await expect(resolveUserId("firebase-uid")).resolves.toBe("new-user");
  });
});
