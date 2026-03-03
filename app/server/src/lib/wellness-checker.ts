// Periodic background job for wellness inactivity detection and resumption.
// Checks whether creators with wellness enabled have been inactive beyond
// their configured frequency, and sends notifications to family members.
//
// Follows the same setInterval pattern as pending-summary-recovery.ts.

import { eq, and, isNotNull, gt } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations, wellnessSettings } from "../db/schema.js";
import {
  getActiveFamilyMembers,
  getCreatorName,
  getCreatorLifecycleStatus,
  notifyFamilyMembers,
} from "./lifecycle-helpers.js";
import { logActivity } from "./activity-logger.js";
import {
  FREQUENCY_DAYS,
  getJstDateString,
  daysBetween,
  getLastConversationDate,
} from "./wellness-helpers.js";
import { logger } from "./logger.js";

// --- Constants ---

/** How often to check for inactive creators. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Delay before the first check after startup. */
const STARTUP_DELAY_MS = 15_000; // 15 seconds

/** Grace period after enabling wellness before first alert (hours). */
const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Maximum creators to process per sweep. */
const MAX_BATCH_SIZE = 50;

// --- Inactivity Detection ---

async function checkWellnessInactivity(): Promise<void> {
  try {
    const enabledSettings = await db
      .select()
      .from(wellnessSettings)
      .where(eq(wellnessSettings.enabled, true))
      .limit(MAX_BATCH_SIZE);

    if (enabledSettings.length === 0) return;

    const now = new Date();
    const today = getJstDateString(now);

    for (const settings of enabledSettings) {
      try {
        // Check lifecycle status — auto-disable if not "active"
        const lifecycleStatus = await getCreatorLifecycleStatus(
          settings.creatorId,
        );
        if (lifecycleStatus !== "active") {
          await db
            .update(wellnessSettings)
            .set({ enabled: false, lastNotifiedAt: null, updatedAt: now })
            .where(eq(wellnessSettings.id, settings.id));

          void logActivity({
            creatorId: settings.creatorId,
            actorId: null,
            actorRole: "system",
            action: "wellness_auto_disabled",
            resourceType: "wellness",
            metadata: { reason: "lifecycle_state_changed", lifecycleStatus },
          });
          continue;
        }

        // Check grace period
        if (
          settings.enabledAt !== null &&
          now.getTime() - settings.enabledAt.getTime() < GRACE_PERIOD_MS
        ) {
          continue;
        }

        // Find last conversation date
        const lastConversationDate = await getLastConversationDate(
          settings.creatorId,
        );
        if (lastConversationDate === null) {
          // No conversations at all — check if enabledAt is past grace period
          // (already checked above), so they are inactive since enabling
          const enabledDate = settings.enabledAt
            ? getJstDateString(settings.enabledAt)
            : null;
          if (enabledDate === null) continue;

          const daysSinceEnabled = Math.max(0, daysBetween(enabledDate, today));
          const frequencyDays = FREQUENCY_DAYS[settings.frequency] ?? 1;

          if (daysSinceEnabled < frequencyDays) continue;

          // Check deduplication
          if (
            settings.lastNotifiedAt !== null &&
            now.getTime() - settings.lastNotifiedAt.getTime() <
              frequencyDays * 24 * 60 * 60 * 1000
          ) {
            continue;
          }

          await sendInactiveNotification(
            settings.creatorId,
            settings.id,
            daysSinceEnabled,
            now,
          );
          continue;
        }

        const inactiveDays = Math.max(
          0,
          daysBetween(lastConversationDate, today),
        );
        const frequencyDays = FREQUENCY_DAYS[settings.frequency] ?? 1;

        if (inactiveDays < frequencyDays) continue;

        // Check deduplication — only send if lastNotifiedAt is null
        // or enough time has passed since last notification
        if (
          settings.lastNotifiedAt !== null &&
          now.getTime() - settings.lastNotifiedAt.getTime() <
            frequencyDays * 24 * 60 * 60 * 1000
        ) {
          continue;
        }

        await sendInactiveNotification(
          settings.creatorId,
          settings.id,
          inactiveDays,
          now,
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        logger.error("Wellness check failed for creator", {
          creatorId: settings.creatorId,
          error: msg,
        });
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Wellness inactivity check sweep failed", { error: msg });
  }
}

async function sendInactiveNotification(
  creatorId: string,
  settingsId: string,
  inactiveDays: number,
  now: Date,
): Promise<void> {
  const members = await getActiveFamilyMembers(creatorId);
  if (members.length === 0) return;

  const creatorName = await getCreatorName(creatorId);
  const memberUserIds = members.map((m) => m.memberId);

  await notifyFamilyMembers(
    memberUserIds,
    "wellness_inactive",
    "見守りのお知らせ",
    `${creatorName}さんが${String(inactiveDays)}日間お話しされていません`,
    creatorId,
  );

  // Update lastNotifiedAt
  await db
    .update(wellnessSettings)
    .set({ lastNotifiedAt: now, updatedAt: now })
    .where(eq(wellnessSettings.id, settingsId));

  void logActivity({
    creatorId,
    actorId: null,
    actorRole: "system",
    action: "wellness_inactive_alert",
    resourceType: "wellness",
    metadata: { inactiveDays },
  });

  logger.info("Sent wellness inactive notification", {
    creatorId,
    inactiveDays,
    recipientCount: memberUserIds.length,
  });
}

// --- Resumption Detection ---

async function checkWellnessResumption(): Promise<void> {
  try {
    const notifiedSettings = await db
      .select()
      .from(wellnessSettings)
      .where(
        and(
          eq(wellnessSettings.enabled, true),
          isNotNull(wellnessSettings.lastNotifiedAt),
        ),
      )
      .limit(MAX_BATCH_SIZE);

    if (notifiedSettings.length === 0) return;

    const now = new Date();

    for (const settings of notifiedSettings) {
      try {
        if (settings.lastNotifiedAt === null) continue;

        // Check if there's a conversation after lastNotifiedAt
        const recentConversation = await db.query.conversations.findFirst({
          where: and(
            eq(conversations.userId, settings.creatorId),
            gt(conversations.startedAt, settings.lastNotifiedAt),
          ),
          columns: { id: true },
        });

        if (recentConversation === undefined) continue;

        // Creator has resumed — send notification and reset
        const members = await getActiveFamilyMembers(settings.creatorId);
        if (members.length > 0) {
          const creatorName = await getCreatorName(settings.creatorId);
          const memberUserIds = members.map((m) => m.memberId);

          await notifyFamilyMembers(
            memberUserIds,
            "wellness_resumed",
            "見守りのお知らせ",
            `${creatorName}さんがお話しを再開されました`,
            settings.creatorId,
          );
        }

        // Reset lastNotifiedAt to start fresh cycle
        await db
          .update(wellnessSettings)
          .set({ lastNotifiedAt: null, updatedAt: now })
          .where(eq(wellnessSettings.id, settings.id));

        void logActivity({
          creatorId: settings.creatorId,
          actorId: null,
          actorRole: "system",
          action: "wellness_resumed_alert",
          resourceType: "wellness",
        });

        logger.info("Sent wellness resumed notification", {
          creatorId: settings.creatorId,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        logger.error("Wellness resumption check failed for creator", {
          creatorId: settings.creatorId,
          error: msg,
        });
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Wellness resumption check sweep failed", { error: msg });
  }
}

// --- Combined Check ---

async function runWellnessChecks(): Promise<void> {
  await checkWellnessResumption();
  await checkWellnessInactivity();
}

// --- Start periodic checks ---

setInterval(() => {
  void runWellnessChecks();
}, CHECK_INTERVAL_MS);

// Run once on startup after a short delay
setTimeout(() => {
  void runWellnessChecks();
}, STARTUP_DELAY_MS);

logger.info("Wellness checker initialized", {
  intervalMs: CHECK_INTERVAL_MS,
  gracePeriodMs: GRACE_PERIOD_MS,
});
