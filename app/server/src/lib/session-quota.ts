// Counts persisted realtime session start events to determine
// a user's remaining daily session quota.

import { and, count, eq, gte } from "drizzle-orm";

import { db } from "../db/connection.js";
import { activityLog } from "../db/schema.js";
import { MAX_DAILY_SESSIONS, JST_TIMEZONE } from "./session-limits.js";
import { logger } from "./logger.js";

// --- Types ---

export interface SessionQuota {
  /** Total sessions allowed per day. */
  maxDaily: number;
  /** Sessions used today (completed + active). */
  usedToday: number;
  /** Remaining sessions available. */
  remaining: number;
  /** Whether the user can start a new session. */
  canStart: boolean;
}

// --- Helpers ---

/**
 * Get the start of "today" in JST as a UTC Date object.
 * JST is UTC+9, so JST midnight = previous day 15:00 UTC.
 *
 * Uses the same locale approach as the client's usage-tracker.ts
 * (toLocaleDateString with "sv-SE" + Asia/Tokyo timezone).
 */
function getJstDayStart(): Date {
  const now = new Date();
  // Format as YYYY-MM-DD in JST
  const jstDateStr = now.toLocaleDateString("sv-SE", {
    timeZone: JST_TIMEZONE,
  });
  // Parse YYYY-MM-DD components
  const parts = jstDateStr.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  // Create UTC date for JST midnight (JST midnight = UTC 15:00 previous day)
  // JST is UTC+9, so subtract 9 hours from midnight JST
  const JST_OFFSET_HOURS = 9;
  return new Date(Date.UTC(year, month - 1, day, -JST_OFFSET_HOURS, 0, 0));
}

// --- Public API ---

/**
 * Check the session quota for a given internal user ID.
 * Counts persisted realtime session start events created when a session
 * is successfully established.
 *
 * Fails open on DB errors to avoid blocking users.
 */
export async function getSessionQuota(userId: string): Promise<SessionQuota> {
  try {
    const dayStart = getJstDayStart();

    const [sessionUsage] = await db
      .select({ value: count() })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.creatorId, userId),
          eq(activityLog.actorId, userId),
          eq(activityLog.action, "realtime_session_started"),
          eq(activityLog.resourceType, "realtime_session"),
          gte(activityLog.createdAt, dayStart),
        ),
      );

    const usedToday = sessionUsage?.value ?? 0;
    const remaining = Math.max(0, MAX_DAILY_SESSIONS - usedToday);

    return {
      maxDaily: MAX_DAILY_SESSIONS,
      usedToday,
      remaining,
      canStart: remaining > 0,
    };
  } catch (error) {
    logger.error("Failed to check session quota", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fail open: allow the session to avoid blocking users due to DB errors.
    return {
      maxDaily: MAX_DAILY_SESSIONS,
      usedToday: 0,
      remaining: MAX_DAILY_SESSIONS,
      canStart: true,
    };
  }
}
