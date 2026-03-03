// Shared utilities for wellness check feature.
// JST date calculations, streak computation, and dashboard data assembly.

import { desc, eq, and, gte } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  conversations,
  wellnessCheckins,
  wellnessSettings,
} from "../db/schema.js";
import { JST_TIMEZONE } from "./session-limits.js";

// --- Constants ---

/** Frequency label to day count mapping. */
export const FREQUENCY_DAYS: Record<string, number> = {
  daily: 1,
  every_2_days: 2,
  every_3_days: 3,
};

/** Valid frequency values for input validation. */
export const VALID_FREQUENCIES = new Set(Object.keys(FREQUENCY_DAYS));

/** Valid sharing level values for input validation. */
export const VALID_SHARING_LEVELS = new Set([
  "activity_only",
  "activity_and_summary",
]);

/** JST offset in hours (UTC+9). */
const JST_OFFSET_HOURS = 9;

// --- JST Date Utilities ---

/**
 * Get today's date as a JST date string (YYYY-MM-DD).
 * Matches the JST timezone convention from session-limits.ts.
 */
export function getJstDateString(date?: Date): string {
  const d = date ?? new Date();
  return d.toLocaleDateString("sv-SE", { timeZone: JST_TIMEZONE });
}

/**
 * Parse a JST date string (YYYY-MM-DD) into a UTC Date at JST midnight.
 * JST midnight = UTC 15:00 previous day.
 */
export function parseJstDateToUtc(jstDateStr: string): Date {
  const parts = jstDateStr.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return new Date(Date.UTC(year, month - 1, day, -JST_OFFSET_HOURS, 0, 0));
}

/**
 * Calculate the number of days between two JST date strings.
 * Returns a positive number when dateA is earlier than dateB.
 * Returns a negative number when dateA is later than dateB.
 */
export function daysBetween(dateA: string, dateB: string): number {
  const a = parseJstDateToUtc(dateA);
  const b = parseJstDateToUtc(dateB);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

// --- Streak Calculation ---

/**
 * Calculate the current consecutive-day streak from check-in records.
 * Records must be sorted by date descending (most recent first).
 * A streak is broken when a day without conversation is found.
 */
export function calculateStreak(
  checkins: Array<{ date: string; hadConversation: boolean }>,
): number {
  if (checkins.length === 0) return 0;

  const today = getJstDateString();
  let streak = 0;
  let expectedDate = today;

  for (const checkin of checkins) {
    if (checkin.date === expectedDate && checkin.hadConversation) {
      streak++;
      // Move to previous day
      const prev = parseJstDateToUtc(expectedDate);
      prev.setUTCDate(prev.getUTCDate() - 1);
      expectedDate = getJstDateString(
        new Date(prev.getTime() + JST_OFFSET_HOURS * 60 * 60 * 1000),
      );
    } else if (checkin.date === expectedDate && !checkin.hadConversation) {
      // Day exists but no conversation — streak broken
      break;
    } else {
      // Gap in dates — streak broken
      break;
    }
  }

  return streak;
}

// --- Dashboard Data Assembly ---

/**
 * Find the last conversation date for a creator.
 * Returns a JST date string or null if no conversations exist.
 */
export async function getLastConversationDate(
  creatorId: string,
): Promise<string | null> {
  const rows = await db
    .select({ startedAt: conversations.startedAt })
    .from(conversations)
    .where(eq(conversations.userId, creatorId))
    .orderBy(desc(conversations.startedAt))
    .limit(1);

  if (rows.length === 0 || rows[0] === undefined) return null;
  return getJstDateString(rows[0].startedAt);
}

/**
 * Get recent check-in records for a creator.
 * Returns records sorted by date descending.
 */
export async function getRecentCheckins(
  creatorId: string,
  limit: number,
  offset: number,
): Promise<{
  records: Array<{
    date: string;
    hadConversation: boolean;
    summary: string | null;
  }>;
  total: number;
}> {
  const rows = await db
    .select({
      date: wellnessCheckins.date,
      hadConversation: wellnessCheckins.hadConversation,
      summary: wellnessCheckins.summary,
    })
    .from(wellnessCheckins)
    .where(eq(wellnessCheckins.creatorId, creatorId))
    .orderBy(desc(wellnessCheckins.date))
    .limit(limit)
    .offset(offset);

  // Count total records for pagination
  const allRows = await db
    .select({ date: wellnessCheckins.date })
    .from(wellnessCheckins)
    .where(eq(wellnessCheckins.creatorId, creatorId));

  return { records: rows, total: allRows.length };
}

/**
 * Get wellness settings for a creator.
 * Returns null if no settings row exists.
 */
export async function getWellnessSettingsForCreator(
  creatorId: string,
): Promise<{
  enabled: boolean;
  frequency: string;
  sharingLevel: string;
  enabledAt: Date | null;
  lastNotifiedAt: Date | null;
} | null> {
  const row = await db.query.wellnessSettings.findFirst({
    where: eq(wellnessSettings.creatorId, creatorId),
  });

  if (row === undefined) return null;

  return {
    enabled: row.enabled,
    frequency: row.frequency,
    sharingLevel: row.sharingLevel,
    enabledAt: row.enabledAt,
    lastNotifiedAt: row.lastNotifiedAt,
  };
}

/**
 * Build activity trend data for the dashboard.
 * Returns the last N days of check-in data with summary filtering
 * based on the creator's sharing level.
 */
export async function buildActivityTrend(
  creatorId: string,
  sharingLevel: string,
  days: number,
): Promise<
  Array<{ date: string; hadConversation: boolean; summary: string | null }>
> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = getJstDateString(startDate);

  const rows = await db
    .select({
      date: wellnessCheckins.date,
      hadConversation: wellnessCheckins.hadConversation,
      summary: wellnessCheckins.summary,
    })
    .from(wellnessCheckins)
    .where(
      and(
        eq(wellnessCheckins.creatorId, creatorId),
        gte(wellnessCheckins.date, startDateStr),
      ),
    )
    .orderBy(desc(wellnessCheckins.date));

  // Filter summaries based on sharing level
  return rows.map((row) => ({
    date: row.date,
    hadConversation: row.hadConversation,
    summary: sharingLevel === "activity_and_summary" ? row.summary : null,
  }));
}
