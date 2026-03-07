// Periodic hard-deletion of deactivated accounts whose grace period has expired.
//
// When a user requests account deletion, their account enters the "deactivated"
// state with a 30-day grace period. This batch job runs periodically and
// permanently removes accounts whose scheduledDeletionAt has passed.
//
// Follows the same setInterval pattern as data-retention.ts.

import { eq, and, lte, isNotNull, isNull } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  deletionConsentRecords,
  familyMembers,
  noteLifecycle,
  users,
  consentRecords,
} from "../db/schema.js";
import {
  completeDeletedUserCleanup,
  listUserAudioKeys,
} from "./permanent-account-deletion.js";
import {
  getActiveFamilyMembers,
  getCreatorName,
  notifyFamilyMembers,
} from "./lifecycle-helpers.js";
import { logger } from "./logger.js";

// --- Constants ---

/** How often to run the deletion sweep. */
const DELETION_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Delay before the first sweep after startup. */
const STARTUP_DELAY_MS = 60_000; // 60 seconds

/** Maximum accounts to delete per sweep. */
const MAX_DELETION_BATCH = 10;

async function hasPendingConsentParticipation(
  userId: string,
): Promise<boolean> {
  const memberships = await db
    .select({
      familyMemberId: familyMembers.id,
      creatorId: familyMembers.creatorId,
    })
    .from(familyMembers)
    .where(
      and(eq(familyMembers.memberId, userId), eq(familyMembers.isActive, true)),
    );

  if (memberships.length === 0) return false;

  for (const membership of memberships) {
    const lifecycle = await db.query.noteLifecycle.findFirst({
      where: eq(noteLifecycle.creatorId, membership.creatorId),
      columns: { status: true, deletionStatus: true },
    });

    if (lifecycle?.status === "consent_gathering") {
      const pending = await db.query.consentRecords.findFirst({
        where: and(
          eq(consentRecords.familyMemberId, membership.familyMemberId),
          isNull(consentRecords.consented),
        ),
        columns: { id: true },
      });
      if (pending) return true;
    }

    if (lifecycle?.deletionStatus === "deletion_consent_gathering") {
      const pending = await db.query.deletionConsentRecords.findFirst({
        where: and(
          eq(deletionConsentRecords.familyMemberId, membership.familyMemberId),
          isNull(deletionConsentRecords.consented),
        ),
        columns: { id: true },
      });
      if (pending) return true;
    }
  }

  return false;
}

// --- Hard deletion ---

/**
 * Permanently delete a single deactivated user account.
 * Deletes R2 audio files, DB records (CASCADE), and Firebase auth.
 */
async function hardDeleteUser(user: {
  id: string;
  firebaseUid: string;
}): Promise<void> {
  if (await hasPendingConsentParticipation(user.id)) {
    logger.warn(
      "Scheduled deletion postponed due to active family consent flow",
      {
        userId: user.id,
      },
    );
    return;
  }

  const creatorName = await getCreatorName(user.id);
  const familyMembersToNotify = await getActiveFamilyMembers(user.id);
  const audioKeys = await listUserAudioKeys(user.id);

  if (familyMembersToNotify.length > 0) {
    await notifyFamilyMembers(
      familyMembersToNotify.map((member) => member.memberId),
      "creator_account_deleted",
      "アカウントの完全削除",
      `${creatorName}さんのアカウントと記録は完全に削除されました。`,
      user.id,
    );
  }

  // Re-check deactivated status at delete time so a reactivated account is skipped.
  const deleted = await db
    .delete(users)
    .where(
      and(
        eq(users.id, user.id),
        eq(users.accountStatus, "deactivated"),
        isNotNull(users.scheduledDeletionAt),
        lte(users.scheduledDeletionAt, new Date()),
      ),
    )
    .returning({ id: users.id });

  if (deleted.length === 0) {
    logger.info(
      "Scheduled deletion skipped for reactivated or changed account",
      {
        userId: user.id,
      },
    );
    return;
  }

  await completeDeletedUserCleanup({
    userId: user.id,
    firebaseUid: user.firebaseUid,
    deletionReason: "user_requested",
    audioKeys,
    auditMetadata: {
      source: "scheduled_deletion",
    },
  });

  logger.info("Scheduled hard deletion completed", {
    userId: user.id,
  });
}

// --- Sweep ---

async function runDeletionSweep(): Promise<void> {
  try {
    const now = new Date();

    // Find deactivated accounts past their scheduled deletion time
    const candidates = await db
      .select({
        id: users.id,
        firebaseUid: users.firebaseUid,
      })
      .from(users)
      .where(
        and(
          eq(users.accountStatus, "deactivated"),
          isNotNull(users.scheduledDeletionAt),
          lte(users.scheduledDeletionAt, now),
        ),
      )
      .limit(MAX_DELETION_BATCH);

    if (candidates.length === 0) {
      return;
    }

    let deletedCount = 0;
    for (const candidate of candidates) {
      try {
        await hardDeleteUser(candidate);
        deletedCount++;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        logger.error("Scheduled hard deletion failed for user", {
          userId: candidate.id,
          error: msg,
        });
      }
    }

    logger.info("Scheduled deletion sweep completed", {
      candidates: candidates.length,
      deleted: deletedCount,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Scheduled deletion sweep failed", { error: msg });
  }
}

// --- Start periodic sweep ---

setInterval(() => {
  void runDeletionSweep();
}, DELETION_SWEEP_INTERVAL_MS);

// Run once on startup after a delay (let DB connections settle)
setTimeout(() => {
  void runDeletionSweep();
}, STARTUP_DELAY_MS);

logger.info("Scheduled deletion job initialized", {
  intervalMs: DELETION_SWEEP_INTERVAL_MS,
});
