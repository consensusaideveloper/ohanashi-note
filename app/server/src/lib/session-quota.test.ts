import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/connection.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("./logger.js", () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { getSessionQuota } from "./session-quota.js";

let db: typeof import("../db/connection.js").db;

beforeEach(async () => {
  vi.clearAllMocks();
  db = (await import("../db/connection.js")).db;
});

describe("getSessionQuota", () => {
  it("counts only activated realtime sessions", async () => {
    const whereMock = vi.fn().mockResolvedValue([{ value: 2 }]);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as never);

    const quota = await getSessionQuota("user-1");

    expect(quota).toMatchObject({
      usedToday: 2,
      remaining: 1,
      canStart: true,
    });
  });
});
