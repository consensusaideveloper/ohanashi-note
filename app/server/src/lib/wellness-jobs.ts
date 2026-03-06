import { and, eq } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  notifications,
  users,
  wellnessCheckins,
  wellnessNotificationLog,
  wellnessSettings,
} from "../db/schema.js";
import { getActiveFamilyMembers } from "./lifecycle-helpers.js";
import {
  buildFamilySummary,
  calculateMetrics,
  getStatusFromMissedStreak,
  listRecentConversations,
  shiftDateKey,
  toDateKey,
} from "./wellness.js";
import { logger } from "./logger.js";

const DAILY_EVALUATION_INTERVAL_MS = 6 * 60 * 60 * 1000;
const WEEKLY_SUMMARY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 45_000;
const WELLNESS_DAILY_HOUR_JST = 8;
const WELLNESS_WEEKLY_HOUR_JST = 9;
const DELIVERY_CHANNEL = "in_app";

function toWindowDate(dateKey: string, endOfDay = false): Date {
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return new Date(`${dateKey}${suffix}`);
}

function getWeekdayIndex(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return (day + 6) % 7;
}

function getCurrentHourInTimeZone(timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number.parseInt(formatted, 10);
}

async function insertWellnessNotification(
  creatorId: string,
  recipientUserId: string,
  type: string,
  title: string,
  message: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  const existing = await db.query.wellnessNotificationLog.findFirst({
    where: and(
      eq(wellnessNotificationLog.creatorId, creatorId),
      eq(wellnessNotificationLog.recipientUserId, recipientUserId),
      eq(wellnessNotificationLog.type, type),
      eq(wellnessNotificationLog.windowEnd, windowEnd),
    ),
    columns: { id: true },
  });

  if (existing) {
    return;
  }

  await db.insert(notifications).values({
    userId: recipientUserId,
    type,
    title,
    message,
    relatedCreatorId: creatorId,
  });

  await db.insert(wellnessNotificationLog).values({
    creatorId,
    recipientUserId,
    type,
    windowStart,
    windowEnd,
    deliveryChannel: DELIVERY_CHANNEL,
    deliveryStatus: "sent",
    metadata: {},
  });
}

async function upsertCheckinForCreator(
  settingsRow: typeof wellnessSettings.$inferSelect,
): Promise<void> {
  const timeZone = settingsRow.timezone;
  const todayKey = toDateKey(new Date(), timeZone);
  const targetDateKey = shiftDateKey(todayKey, -1);
  const rows = await listRecentConversations(settingsRow.creatorId);
  const metrics = calculateMetrics(rows, timeZone, targetDateKey);
  const conversationForDay = rows.find(
    (row) => toDateKey(row.startedAt, timeZone) === targetDateKey,
  );
  const paused =
    settingsRow.pausedUntil !== null &&
    settingsRow.pausedUntil.getTime() > Date.now();
  const status = paused
    ? "paused"
    : conversationForDay !== undefined
      ? "engaged"
      : "missed";

  const payload = {
    creatorId: settingsRow.creatorId,
    checkinDate: targetDateKey,
    status,
    conversationId: conversationForDay?.id ?? null,
    signals: {
      engagedDaysLast7: metrics.engagedDaysLast7,
      missedStreak: metrics.missedStreak,
      status: getStatusFromMissedStreak(metrics.missedStreak),
    },
    summaryForFamily: conversationForDay?.oneLinerSummary ?? null,
    updatedAt: new Date(),
  };

  const existing = await db.query.wellnessCheckins.findFirst({
    where: and(
      eq(wellnessCheckins.creatorId, settingsRow.creatorId),
      eq(wellnessCheckins.checkinDate, targetDateKey),
    ),
    columns: { id: true },
  });

  if (existing) {
    await db
      .update(wellnessCheckins)
      .set(payload)
      .where(eq(wellnessCheckins.id, existing.id));
  } else {
    await db.insert(wellnessCheckins).values(payload);
  }

  const familyMembers = await getActiveFamilyMembers(settingsRow.creatorId);
  if (familyMembers.length === 0 || paused) {
    return;
  }

  const windowStart = toWindowDate(targetDateKey, false);
  const windowEnd = toWindowDate(targetDateKey, true);
  if (metrics.missedStreak === 2) {
    await Promise.all(
      familyMembers.map((member) =>
        insertWellnessNotification(
          settingsRow.creatorId,
          member.memberId,
          "wellness_missed_day2",
          "見守りのご連絡",
          "2日連続で会話がありません。ご連絡をおすすめします。",
          windowStart,
          windowEnd,
        ),
      ),
    );
  }

  if (metrics.missedStreak >= 3) {
    await Promise.all(
      familyMembers.map((member) =>
        insertWellnessNotification(
          settingsRow.creatorId,
          member.memberId,
          "wellness_missed_day3",
          "見守りのご連絡",
          `${String(metrics.missedStreak)}日連続で会話が確認できていません。早めのご確認をお願いします。`,
          windowStart,
          windowEnd,
        ),
      ),
    );
  }
}

export async function runDailyEvaluation(): Promise<void> {
  try {
    const rows = await db
      .select({ settingsRow: wellnessSettings })
      .from(wellnessSettings)
      .innerJoin(users, eq(users.id, wellnessSettings.creatorId))
      .where(
        and(
          eq(wellnessSettings.enabled, true),
          eq(users.accountStatus, "active"),
        ),
      );

    for (const { settingsRow } of rows) {
      const hour = getCurrentHourInTimeZone(settingsRow.timezone);
      if (hour < WELLNESS_DAILY_HOUR_JST) {
        continue;
      }

      await upsertCheckinForCreator(settingsRow);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Wellness daily evaluation failed", { error: message });
  }
}

export async function runWeeklySummaryDispatch(): Promise<void> {
  try {
    const rows = await db
      .select({ settingsRow: wellnessSettings })
      .from(wellnessSettings)
      .innerJoin(users, eq(users.id, wellnessSettings.creatorId))
      .where(
        and(
          eq(wellnessSettings.enabled, true),
          eq(users.accountStatus, "active"),
        ),
      );

    for (const { settingsRow } of rows) {
      const now = new Date();
      const todayKey = toDateKey(now, settingsRow.timezone);
      const weekdayIndex = getWeekdayIndex(todayKey);
      const hour = getCurrentHourInTimeZone(settingsRow.timezone);
      const paused =
        settingsRow.pausedUntil !== null &&
        settingsRow.pausedUntil.getTime() > Date.now();

      if (
        paused ||
        weekdayIndex !== settingsRow.weeklySummaryDay ||
        hour < WELLNESS_WEEKLY_HOUR_JST
      ) {
        continue;
      }

      const familySummary = await buildFamilySummary(
        settingsRow.creatorId,
        settingsRow,
      );
      if (!familySummary) {
        continue;
      }

      const weekStart = toWindowDate(familySummary.weekStart, false);
      const weekEnd = toWindowDate(familySummary.weekEnd, true);
      const familyMembers = await getActiveFamilyMembers(settingsRow.creatorId);

      await Promise.all(
        familyMembers.map((member) =>
          insertWellnessNotification(
            settingsRow.creatorId,
            member.memberId,
            "wellness_weekly_summary",
            "今週の見守りサマリー",
            familySummary.summary,
            weekStart,
            weekEnd,
          ),
        ),
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Wellness weekly summary dispatch failed", {
      error: message,
    });
  }
}

setInterval(() => {
  void runDailyEvaluation();
}, DAILY_EVALUATION_INTERVAL_MS);

setInterval(() => {
  void runWeeklySummaryDispatch();
}, WEEKLY_SUMMARY_INTERVAL_MS);

setTimeout(() => {
  void runDailyEvaluation();
  void runWeeklySummaryDispatch();
}, STARTUP_DELAY_MS);

logger.info("Wellness jobs initialized", {
  dailyIntervalMs: DAILY_EVALUATION_INTERVAL_MS,
  weeklyIntervalMs: WEEKLY_SUMMARY_INTERVAL_MS,
});
