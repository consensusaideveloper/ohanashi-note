// Counts persisted realtime session activation events to determine
// a user's remaining session quota (daily and optional monthly).

import { and, count, eq, gte } from "drizzle-orm";

import { db } from "../db/connection.js";
import { activityLog } from "../db/schema.js";
import {
  MAX_DAILY_SESSIONS,
  MAX_MONTHLY_SESSIONS,
  JST_TIMEZONE,
} from "./session-limits.js";
import { logger } from "./logger.js";

// --- Types ---

export type SessionQuotaLimitPeriod = "daily" | "monthly" | null;

export interface SessionQuota {
  /** Total sessions allowed per day. */
  maxDaily: number;
  /** Sessions used today (completed + active). */
  usedToday: number;
  /** Remaining daily sessions available. */
  remaining: number;
  /** Total sessions allowed per month (null when disabled). */
  maxMonthly: number | null;
  /** Sessions used this month (null when monthly quota is disabled). */
  usedThisMonth: number | null;
  /** Remaining monthly sessions (null when monthly quota is disabled). */
  remainingThisMonth: number | null;
  /** Which limit blocked the user (if any). */
  limitPeriod: SessionQuotaLimitPeriod;
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
function getJstDateParts(): { year: number; month: number; day: number } {
  const jstDateStr = new Date().toLocaleDateString("sv-SE", {
    timeZone: JST_TIMEZONE,
  });
  const parts = jstDateStr.split("-");
  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2]),
  };
}

function getJstDayStart(): Date {
  const { year, month, day } = getJstDateParts();
  const JST_OFFSET_HOURS = 9;
  return new Date(Date.UTC(year, month - 1, day, -JST_OFFSET_HOURS, 0, 0));
}

function getJstMonthStart(): Date {
  const { year, month } = getJstDateParts();
  const JST_OFFSET_HOURS = 9;
  return new Date(Date.UTC(year, month - 1, 1, -JST_OFFSET_HOURS, 0, 0));
}

// --- Public API ---

/**
 * Check the session quota for a given internal user ID.
 * Counts persisted realtime session activation events created when the user
 * actually begins speaking in a normal conversation.
 *
 * Fails open on DB errors to avoid blocking users.
 */
export async function getSessionQuota(userId: string): Promise<SessionQuota> {
  try {
    const dayStart = getJstDayStart();
    const [dailyUsage] = await db
      .select({ value: count() })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.creatorId, userId),
          eq(activityLog.actorId, userId),
          eq(activityLog.action, "realtime_session_activated"),
          eq(activityLog.resourceType, "realtime_session"),
          gte(activityLog.createdAt, dayStart),
        ),
      );

    const usedToday = dailyUsage?.value ?? 0;
    const remaining = Math.max(0, MAX_DAILY_SESSIONS - usedToday);

    const hasMonthlyQuota = MAX_MONTHLY_SESSIONS > 0;
    let usedThisMonth: number | null = null;
    let remainingThisMonth: number | null = null;

    if (hasMonthlyQuota) {
      const monthStart = getJstMonthStart();
      const [monthlyUsage] = await db
        .select({ value: count() })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.creatorId, userId),
            eq(activityLog.actorId, userId),
            eq(activityLog.action, "realtime_session_activated"),
            eq(activityLog.resourceType, "realtime_session"),
            gte(activityLog.createdAt, monthStart),
          ),
        );
      usedThisMonth = monthlyUsage?.value ?? 0;
      remainingThisMonth = Math.max(0, MAX_MONTHLY_SESSIONS - usedThisMonth);
    }

    const monthlyAllowed =
      remainingThisMonth === null || remainingThisMonth > 0;
    const canStart = remaining > 0 && monthlyAllowed;
    const limitPeriod: SessionQuotaLimitPeriod =
      remaining <= 0 ? "daily" : monthlyAllowed ? null : "monthly";

    return {
      maxDaily: MAX_DAILY_SESSIONS,
      usedToday,
      remaining,
      maxMonthly: hasMonthlyQuota ? MAX_MONTHLY_SESSIONS : null,
      usedThisMonth,
      remainingThisMonth,
      limitPeriod,
      canStart,
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
      maxMonthly: MAX_MONTHLY_SESSIONS > 0 ? MAX_MONTHLY_SESSIONS : null,
      usedThisMonth: MAX_MONTHLY_SESSIONS > 0 ? 0 : null,
      remainingThisMonth:
        MAX_MONTHLY_SESSIONS > 0 ? MAX_MONTHLY_SESSIONS : null,
      limitPeriod: null,
      canStart: true,
    };
  }
}
