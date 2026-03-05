import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/connection.js", () => ({
  db: {
    query: {
      conversations: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("../middleware/auth.js", () => ({
  getFirebaseUid: vi.fn(),
}));

vi.mock("../lib/users.js", () => ({
  resolveUserId: vi.fn(),
}));

vi.mock("../lib/r2.js", () => ({
  r2: {
    uploadObject: vi.fn(),
    generateDownloadUrl: vi.fn(),
  },
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { audioUploadRoute } from "./audio-upload.js";

let db: typeof import("../db/connection.js").db;
let getFirebaseUid: typeof import("../middleware/auth.js").getFirebaseUid;
let resolveUserId: typeof import("../lib/users.js").resolveUserId;
let r2: NonNullable<typeof import("../lib/r2.js").r2>;

beforeEach(async () => {
  vi.clearAllMocks();

  db = (await import("../db/connection.js")).db;
  getFirebaseUid = (await import("../middleware/auth.js")).getFirebaseUid;
  resolveUserId = (await import("../lib/users.js")).resolveUserId;
  const importedR2 = (await import("../lib/r2.js")).r2;
  if (importedR2 === null) {
    throw new Error("R2 client mock is not available");
  }
  r2 = importedR2;

  vi.mocked(getFirebaseUid).mockReturnValue("firebase-uid");
  vi.mocked(resolveUserId).mockResolvedValue("user-1");
  vi.mocked(db.query.conversations.findFirst).mockResolvedValue({
    id: "conv-1",
    transcript: [{ role: "user", text: "こんにちは" }],
  } as never);
});

describe("audioUploadRoute", () => {
  it("rejects unsupported MIME types", async () => {
    const response = await audioUploadRoute.fetch(
      new Request("http://localhost/api/conversations/conv-1/audio", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not-audio",
      }),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_CONTENT_TYPE",
    });
    expect(r2.uploadObject).not.toHaveBeenCalled();
  });
});
