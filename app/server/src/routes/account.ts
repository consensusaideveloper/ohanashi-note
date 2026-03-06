import { Hono } from "hono";
import { eq, and, gte } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  users,
  noteLifecycle,
  familyMembers,
  consentRecords,
  deletionConsentRecords,
  notifications,
  shares,
} from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";
import {
  getCreatorLifecycleStatus,
  isDeletionBlocked,
  getCreatorName,
  getActiveFamilyMembers,
  notifyFamilyMembers,
} from "../lib/lifecycle-helpers.js";

import type { Context } from "hono";

/** Grace period before hard deletion (30 days in milliseconds). */
const DEACTIVATION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function getAccountFamilyNotificationRecipients(
  memberUserIds: string[],
  type: string,
  relatedCreatorId: string,
): Promise<string[]> {
  if (memberUserIds.length === 0) return [];

  const since = new Date(Date.now() - ACCOUNT_NOTIFICATION_COOLDOWN_MS);
  const existing = await Promise.all(
    memberUserIds.map((userId) =>
      db.query.notifications.findFirst({
        where: and(
          eq(notifications.userId, userId),
          eq(notifications.type, type),
          eq(notifications.relatedCreatorId, relatedCreatorId),
          gte(notifications.createdAt, since),
        ),
        columns: { id: true },
      }),
    ),
  );

  return memberUserIds.filter((_, index) => existing[index] === undefined);
}

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

const accountRoute = new Hono();

/**
 * DELETE /api/account — Soft-delete the authenticated user's account.
 * Sets the account to "deactivated" with a 30-day grace period.
 * After the grace period, a batch job permanently deletes all data.
 */
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

    // Check if already deactivated
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { accountStatus: true },
    });
    if (user?.accountStatus === "deactivated") {
      return c.json(
        {
          error: "すでに退会手続き中です。",
          code: "ACCOUNT_ALREADY_DEACTIVATED",
        },
        409,
      );
    }

    const now = new Date();
    const scheduledDeletionAt = new Date(
      now.getTime() + DEACTIVATION_GRACE_PERIOD_MS,
    );

    // Soft-delete: mark account as deactivated
    await db
      .update(users)
      .set({
        accountStatus: "deactivated",
        deactivatedAt: now,
        scheduledDeletionAt,
        deletionReason: "user_requested",
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    // Revoke existing public share links immediately while the account is hidden.
    await db.delete(shares).where(eq(shares.userId, userId));

    // Notify family members (best-effort)
    const members = await getActiveFamilyMembers(userId);
    if (members.length > 0) {
      try {
        const creatorName = await getCreatorName(userId);
        const memberUserIds = members.map((m) => m.memberId);
        const recipients = await getAccountFamilyNotificationRecipients(
          memberUserIds,
          "creator_account_deactivated",
          userId,
        );
        if (recipients.length > 0) {
          await notifyFamilyMembers(
            recipients,
            "creator_account_deactivated",
            "退会のお知らせ",
            `${creatorName}さんが退会手続きを開始しました。30日以内であれば復元できます。`,
            userId,
          );
        }
      } catch (notifyError: unknown) {
        const msg =
          notifyError instanceof Error ? notifyError.message : "Unknown error";
        logger.error(
          "Failed to notify family members during account deactivation",
          { userId, error: msg },
        );
      }
    }

    logger.info("Account deactivated (soft-delete)", {
      userId,
      firebaseUid,
      scheduledDeletionAt: scheduledDeletionAt.toISOString(),
    });

    return c.json({
      success: true,
      scheduledDeletionAt: scheduledDeletionAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to deactivate account", { error: message });
    return c.json(
      {
        error:
          "アカウントの退会手続きに失敗しました。しばらくしてからもう一度お試しください。",
        code: "ACCOUNT_DEACTIVATE_FAILED",
      },
      500,
    );
  }
});

/**
 * GET /api/account/status — Get the account status for the authenticated user.
 * This endpoint is accessible even when the account is deactivated.
 */
accountRoute.get("/api/account/status", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);

    const user = await db.query.users.findFirst({
      where: eq(users.firebaseUid, firebaseUid),
      columns: {
        accountStatus: true,
        deactivatedAt: true,
        scheduledDeletionAt: true,
      },
    });

    if (!user) {
      return c.json(
        {
          error: "アカウントが見つかりません",
          code: "ACCOUNT_NOT_FOUND",
        },
        404,
      );
    }

    return c.json({
      accountStatus: user.accountStatus,
      deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
      scheduledDeletionAt: user.scheduledDeletionAt?.toISOString() ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get account status", { error: message });
    return c.json(
      {
        error: "アカウント情報の取得に失敗しました。",
        code: "ACCOUNT_STATUS_FAILED",
      },
      500,
    );
  }
});

/**
 * POST /api/account/reactivate — Reactivate a deactivated account.
 * This endpoint is accessible even when the account is deactivated.
 * Cancels the scheduled deletion and restores the account to active status.
 */
accountRoute.post("/api/account/reactivate", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);

    const user = await db.query.users.findFirst({
      where: eq(users.firebaseUid, firebaseUid),
      columns: { id: true, accountStatus: true },
    });

    if (!user) {
      return c.json(
        {
          error: "アカウントが見つかりません",
          code: "ACCOUNT_NOT_FOUND",
        },
        404,
      );
    }

    if (user.accountStatus !== "deactivated") {
      return c.json(
        {
          error: "このアカウントは退会手続き中ではありません。",
          code: "ACCOUNT_NOT_DEACTIVATED",
        },
        409,
      );
    }

    const now = new Date();
    await db
      .update(users)
      .set({
        accountStatus: "active",
        deactivatedAt: null,
        scheduledDeletionAt: null,
        deletionReason: null,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    // Notify family members (best-effort)
    const members = await getActiveFamilyMembers(user.id);
    if (members.length > 0) {
      try {
        const creatorName = await getCreatorName(user.id);
        const memberUserIds = members.map((m) => m.memberId);
        const recipients = await getAccountFamilyNotificationRecipients(
          memberUserIds,
          "creator_account_reactivated",
          user.id,
        );
        if (recipients.length > 0) {
          await notifyFamilyMembers(
            recipients,
            "creator_account_reactivated",
            "アカウント復元のお知らせ",
            `${creatorName}さんがアカウントを復元しました。`,
            user.id,
          );
        }
      } catch (notifyError: unknown) {
        const msg =
          notifyError instanceof Error ? notifyError.message : "Unknown error";
        logger.error(
          "Failed to notify family members during account reactivation",
          { userId: user.id, error: msg },
        );
      }
    }

    logger.info("Account reactivated", {
      userId: user.id,
      firebaseUid,
    });

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to reactivate account", { error: message });
    return c.json(
      {
        error:
          "アカウントの復元に失敗しました。しばらくしてからもう一度お試しください。",
        code: "ACCOUNT_REACTIVATE_FAILED",
      },
      500,
    );
  }
});

export { accountRoute };
