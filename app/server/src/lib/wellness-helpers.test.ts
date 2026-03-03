import { describe, it, expect, vi } from "vitest";

vi.mock("../db/connection.js", () => ({
  db: {},
}));

import { daysBetween } from "./wellness-helpers.js";

describe("daysBetween", () => {
  it("returns positive days when the second date is later", () => {
    expect(daysBetween("2026-03-01", "2026-03-02")).toBe(1);
  });

  it("returns negative days when the second date is earlier", () => {
    expect(daysBetween("2026-03-02", "2026-03-01")).toBe(-1);
  });

  it("returns zero for the same date", () => {
    expect(daysBetween("2026-03-02", "2026-03-02")).toBe(0);
  });
});
