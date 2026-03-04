import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/connection.js", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(),
  },
}));

vi.mock("../middleware/auth.js", () => ({
  getFirebaseUid: vi.fn(),
}));

vi.mock("../lib/users.js", () => ({
  resolveUserId: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { profileRoute } from "./profile.js";

let db: typeof import("../db/connection.js").db;
let getFirebaseUid: typeof import("../middleware/auth.js").getFirebaseUid;
let resolveUserId: typeof import("../lib/users.js").resolveUserId;

const updateWhereMock = vi.fn();
const updateSetMock = vi.fn(() => ({
  where: updateWhereMock,
}));

beforeEach(async () => {
  vi.clearAllMocks();

  db = (await import("../db/connection.js")).db;
  getFirebaseUid = (await import("../middleware/auth.js")).getFirebaseUid;
  resolveUserId = (await import("../lib/users.js")).resolveUserId;

  vi.mocked(getFirebaseUid).mockReturnValue("firebase-uid");
  vi.mocked(resolveUserId).mockResolvedValue("user-1");
  vi.mocked(db.update).mockReturnValue({
    set: updateSetMock,
  } as never);
  updateWhereMock.mockResolvedValue(undefined);
});

describe("profileRoute", () => {
  it("normalizes invalid stored profile values on GET", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: "user-1",
      name: "   ",
      characterId: "invalid-character",
      fontSize: "huge",
      speakingSpeed: "warp",
      silenceDuration: "zero",
      confirmationLevel: "always",
      updatedAt: new Date("2026-03-04T00:00:00.000Z"),
    } as never);

    const response = await profileRoute.fetch(
      new Request("http://localhost/api/profile"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "user-1",
      name: "",
      characterId: null,
      fontSize: "standard",
      speakingSpeed: "normal",
      silenceDuration: "normal",
      confirmationLevel: "normal",
    });
  });

  it("rejects empty names on PUT before touching the database", async () => {
    const response = await profileRoute.fetch(
      new Request("http://localhost/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_NAME",
    });
    expect(db.update).not.toHaveBeenCalled();
  });
});
