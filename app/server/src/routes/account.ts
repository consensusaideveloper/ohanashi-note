import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  users,
  noteLifecycle,
  familyMembers,
  consentRecords,
  deletionConsentRecords,
} from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { deleteFirebaseUser } from "../lib/firebase-admin.js";
import { deleteUserAudioFiles } from "../lib/r2-cleanup.js";
import { logger } from "../lib/logger.js";
import {
  getCreatorLifecycleStatus,
  isDeletionBlocked,
  getCreatorName,
  getActiveFamilyMembers,
  notifyFamilyMembers,
} from "../lib/lifecycle-helpers.js";

import type { Context } from "hono";

const accountRoute = new Hono();

/**
 * Check if the user is participating in any active consent processes
 * (opening consent or deletion consent) as a family member for other creators.
 */
async function hasActiveConsentParticipation(userId: string): Promise<boolean> {
  // Find all family memberships where the user is an active member
  const memberships = await db
    .select({
      familyMemberId: familyMembers.id,
      creatorId: familyMembers.creatorId,
    })
    .from(familyMembers)
    .where(
      and(eq(familyMembers.memberId, userId), eq(familyMembers.isActive, true)),
    );

  if (memberships.length === 0) {
    return false;
  }

  // Check if any of these creators are in consent_gathering state
  for (const membership of memberships) {
    const lifecycle = await db.query.noteLifecycle.findFirst({
      where: eq(noteLifecycle.creatorId, membership.creatorId),
      columns: { status: true, deletionStatus: true },
    });

    if (lifecycle?.status === "consent_gathering") {
      // Check if this user has a pending consent record
      const pendingConsent = await db.query.consentRecords.findFirst({
        where: and(
          eq(consentRecords.familyMemberId, membership.familyMemberId),
        ),
        columns: { consented: true },
      });
      if (pendingConsent && pendingConsent.consented === null) {
        return true;
      }
    }

    if (lifecycle?.deletionStatus === "deletion_consent_gathering") {
      const pendingDeletionConsent =
        await db.query.deletionConsentRecords.findFirst({
          where: eq(
            deletionConsentRecords.familyMemberId,
            membership.familyMemberId,
          ),
          columns: { consented: true },
        });
      if (pendingDeletionConsent && pendingDeletionConsent.consented === null) {
        return true;
      }
    }
  }

  return false;
}

/** DELETE /api/account — Delete the authenticated user's account and all data. */
accountRoute.delete("/api/account", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    // Check lifecycle status as creator
    const lifecycleStatus = await getCreatorLifecycleStatus(userId);
    if (isDeletionBlocked(lifecycleStatus)) {
      return c.json(
        {
          error: "ノートが保護されている状態では、アカウントを削除できません",
          code: "ACCOUNT_DELETION_BLOCKED_BY_LIFECYCLE",
        },
        403,
      );
    }

    // Check if user is participating in any active consent processes
    const hasActiveConsent = await hasActiveConsentParticipation(userId);
    if (hasActiveConsent) {
      return c.json(
        {
          error:
            "現在、ご家族のノート手続きに参加しているため、アカウントを削除できません。手続きの完了後にもう一度お試しください。",
          code: "ACCOUNT_DELETION_BLOCKED_BY_FAMILY_PROCESS",
        },
        403,
      );
    }

    // Notify family members before deletion
    const members = await getActiveFamilyMembers(userId);
    if (members.length > 0) {
      const creatorName = await getCreatorName(userId);
      const memberUserIds = members.map((m) => m.memberId);
      await notifyFamilyMembers(
        memberUserIds,
        "creator_account_deleted",
        "アカウント削除のお知らせ",
        `${creatorName}さんがアカウントを削除しました。関連するノートデータはすべて削除されました。`,
        userId,
      );
    }

    // Clean up R2 audio files (best-effort)
    await deleteUserAudioFiles(userId);

    // Delete from DB (cascades clean up everything)
    await db.delete(users).where(eq(users.id, userId));

    // Delete from Firebase Auth
    await deleteFirebaseUser(firebaseUid);

    logger.info("Account deleted", { userId, firebaseUid });

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to delete account", { error: message });
    return c.json(
      {
        error:
          "アカウントの削除に失敗しました。しばらくしてからもう一度お試しください。",
        code: "ACCOUNT_DELETE_FAILED",
      },
      500,
    );
  }
});

export { accountRoute };
