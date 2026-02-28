import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  isDeletionBlocked,
  isDeceasedUser,
  getConsentEligibleMembers,
} from "./lifecycle-helpers";

// Mock the database module
vi.mock("../db/connection.js", () => ({
  db: {
    query: {
      noteLifecycle: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock r2-cleanup
vi.mock("./r2-cleanup.js", () => ({
  deleteUserAudioFiles: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let db: typeof import("../db/connection.js").db;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../db/connection.js");
  db = mod.db;
});

describe("isDeletionBlocked", () => {
  it("returns true for death_reported status", () => {
    expect(isDeletionBlocked("death_reported")).toBe(true);
  });

  it("returns true for consent_gathering status", () => {
    expect(isDeletionBlocked("consent_gathering")).toBe(true);
  });

  it("returns true for opened status", () => {
    expect(isDeletionBlocked("opened")).toBe(true);
  });

  it("returns false for active status", () => {
    expect(isDeletionBlocked("active")).toBe(false);
  });

  it("returns false for unknown status", () => {
    expect(isDeletionBlocked("unknown")).toBe(false);
  });
});

describe("isDeceasedUser", () => {
  it("returns true when user lifecycle status is death_reported", async () => {
    vi.mocked(db.query.noteLifecycle.findFirst).mockResolvedValue({
      status: "death_reported",
    } as never);

    const result = await isDeceasedUser("user-1");
    expect(result).toBe(true);
  });

  it("returns true when user lifecycle status is consent_gathering", async () => {
    vi.mocked(db.query.noteLifecycle.findFirst).mockResolvedValue({
      status: "consent_gathering",
    } as never);

    const result = await isDeceasedUser("user-1");
    expect(result).toBe(true);
  });

  it("returns true when user lifecycle status is opened", async () => {
    vi.mocked(db.query.noteLifecycle.findFirst).mockResolvedValue({
      status: "opened",
    } as never);

    const result = await isDeceasedUser("user-1");
    expect(result).toBe(true);
  });

  it("returns false when user lifecycle status is active", async () => {
    vi.mocked(db.query.noteLifecycle.findFirst).mockResolvedValue({
      status: "active",
    } as never);

    const result = await isDeceasedUser("user-1");
    expect(result).toBe(false);
  });

  it("returns false when no lifecycle record exists", async () => {
    vi.mocked(db.query.noteLifecycle.findFirst).mockResolvedValue(undefined);

    const result = await isDeceasedUser("user-1");
    expect(result).toBe(false);
  });
});

describe("getConsentEligibleMembers", () => {
  it("separates living and deceased members", async () => {
    // Mock getActiveFamilyMembers (via db.select)
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { memberId: "living-user", familyMemberId: "fm-1" },
          { memberId: "deceased-user", familyMemberId: "fm-2" },
          { memberId: "another-living", familyMemberId: "fm-3" },
        ]),
      }),
    });
    vi.mocked(db.select).mockImplementation(mockSelect);

    // Mock isDeceasedUser via noteLifecycle.findFirst
    // Called once for each member to check their deceased status
    vi.mocked(db.query.noteLifecycle.findFirst)
      .mockResolvedValueOnce(undefined) // living-user: no lifecycle = alive
      .mockResolvedValueOnce({ status: "opened" } as never) // deceased-user: opened = dead
      .mockResolvedValueOnce({ status: "active" } as never); // another-living: active = alive

    const result = await getConsentEligibleMembers("creator-1");

    expect(result.eligible).toHaveLength(2);
    expect(result.deceased).toHaveLength(1);
    expect(result.eligible[0]?.memberId).toBe("living-user");
    expect(result.eligible[1]?.memberId).toBe("another-living");
    expect(result.deceased[0]?.memberId).toBe("deceased-user");
  });

  it("returns all members as eligible when none are deceased", async () => {
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { memberId: "user-1", familyMemberId: "fm-1" },
          { memberId: "user-2", familyMemberId: "fm-2" },
        ]),
      }),
    });
    vi.mocked(db.select).mockImplementation(mockSelect);

    vi.mocked(db.query.noteLifecycle.findFirst)
      .mockResolvedValueOnce(undefined) // user-1: no lifecycle
      .mockResolvedValueOnce(undefined); // user-2: no lifecycle

    const result = await getConsentEligibleMembers("creator-1");

    expect(result.eligible).toHaveLength(2);
    expect(result.deceased).toHaveLength(0);
  });

  it("returns all members as deceased when all are deceased", async () => {
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { memberId: "dead-1", familyMemberId: "fm-1" },
          { memberId: "dead-2", familyMemberId: "fm-2" },
        ]),
      }),
    });
    vi.mocked(db.select).mockImplementation(mockSelect);

    vi.mocked(db.query.noteLifecycle.findFirst)
      .mockResolvedValueOnce({ status: "death_reported" } as never)
      .mockResolvedValueOnce({ status: "opened" } as never);

    const result = await getConsentEligibleMembers("creator-1");

    expect(result.eligible).toHaveLength(0);
    expect(result.deceased).toHaveLength(2);
  });

  it("returns empty arrays when no active members exist", async () => {
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    vi.mocked(db.select).mockImplementation(mockSelect);

    const result = await getConsentEligibleMembers("creator-1");

    expect(result.eligible).toHaveLength(0);
    expect(result.deceased).toHaveLength(0);
  });
});
