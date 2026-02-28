import { eq, and, count, isNull } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  accessPresets,
  categoryAccess,
  consentRecords,
  conversations,
  deletionConsentRecords,
  familyMembers,
  lifecycleActionLog,
  noteLifecycle,
  notifications,
  users,
} from "../db/schema.js";
import { deleteUserAudioFiles } from "./r2-cleanup.js";
import { logger } from "./logger.js";

// --- Creator name lookup ---

/**
 * Look up the display name for a creator by their user ID.
 * Returns a fallback string if the user record is not found.
 */
export async function getCreatorName(creatorId: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, creatorId),
    columns: { name: true },
  });
  return user?.name || "ご利用者";
}

// --- Representative check ---

/**
 * Check whether a creator has at least one active family member
 * with the "representative" role.
 */
export async function hasActiveRepresentative(
  creatorId: string,
): Promise<boolean> {
  const [result] = await db
    .select({ value: count() })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.creatorId, creatorId),
        eq(familyMembers.role, "representative"),
        eq(familyMembers.isActive, true),
      ),
    );
  return (result?.value ?? 0) > 0;
}

// --- Active family members ---

/**
 * Fetch all active family members for a given creator.
 * Returns an array of { memberId, familyMemberId } objects.
 */
export async function getActiveFamilyMembers(
  creatorId: string,
): Promise<Array<{ memberId: string; familyMemberId: string }>> {
  const rows = await db
    .select({
      memberId: familyMembers.memberId,
      familyMemberId: familyMembers.id,
    })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.creatorId, creatorId),
        eq(familyMembers.isActive, true),
      ),
    );
  return rows;
}

// --- Notification helper ---

/**
 * Create a notification for each specified user.
 * Best-effort: logs errors but does not throw — notifications should never
 * block critical lifecycle operations.
 */
export async function notifyFamilyMembers(
  memberUserIds: string[],
  type: string,
  title: string,
  message: string,
  relatedCreatorId: string,
): Promise<void> {
  if (memberUserIds.length === 0) return;

  const values = memberUserIds.map((userId) => ({
    userId,
    type,
    title,
    message,
    relatedCreatorId,
  }));

  try {
    await db.insert(notifications).values(values);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to insert notifications", {
      type,
      relatedCreatorId,
      memberCount: memberUserIds.length,
      error: msg,
    });
  }
}

// --- Lifecycle status helpers ---

/** Lifecycle statuses that block data deletion and modification. */
const DELETION_BLOCKED_STATUSES = new Set([
  "death_reported",
  "consent_gathering",
  "opened",
]);

/**
 * Retrieve the lifecycle status for a creator.
 * Returns "active" when no lifecycle record exists (default state).
 */
export async function getCreatorLifecycleStatus(
  creatorId: string,
): Promise<string> {
  const lifecycle = await db.query.noteLifecycle.findFirst({
    where: eq(noteLifecycle.creatorId, creatorId),
    columns: { status: true },
  });
  return lifecycle?.status ?? "active";
}

/**
 * Returns true if the creator's data is protected from deletion/modification.
 * Data is protected when status is "death_reported", "consent_gathering", or "opened".
 */
export function isDeletionBlocked(lifecycleStatus: string): boolean {
  return DELETION_BLOCKED_STATUSES.has(lifecycleStatus);
}

// --- Audit logging ---

/**
 * Record an action in the lifecycle action log for audit purposes.
 */
export async function logLifecycleAction(
  lifecycleId: string,
  action: string,
  performedBy: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(lifecycleActionLog).values({
    lifecycleId,
    action,
    performedBy,
    metadata: metadata ?? null,
  });
}

// --- Deceased user helpers ---

/** Lifecycle statuses indicating the user (as a creator) is deceased. */
const DECEASED_STATUSES = new Set([
  "death_reported",
  "consent_gathering",
  "opened",
]);

/**
 * Check if a user is deceased by examining their own noteLifecycle status.
 * Returns true when the user's lifecycle status is death_reported,
 * consent_gathering, or opened.
 */
export async function isDeceasedUser(userId: string): Promise<boolean> {
  const lifecycle = await db.query.noteLifecycle.findFirst({
    where: eq(noteLifecycle.creatorId, userId),
    columns: { status: true },
  });
  return lifecycle !== undefined && DECEASED_STATUSES.has(lifecycle.status);
}

interface ConsentEligibleResult {
  eligible: Array<{ memberId: string; familyMemberId: string }>;
  deceased: Array<{ memberId: string; familyMemberId: string }>;
}

/**
 * Filter active family members into consent-eligible (living) and deceased groups.
 * A member is considered deceased if their own noteLifecycle status
 * indicates death (death_reported, consent_gathering, or opened).
 */
export async function getConsentEligibleMembers(
  creatorId: string,
): Promise<ConsentEligibleResult> {
  const allActive = await getActiveFamilyMembers(creatorId);

  const eligible: Array<{ memberId: string; familyMemberId: string }> = [];
  const deceased: Array<{ memberId: string; familyMemberId: string }> = [];

  for (const member of allActive) {
    const dead = await isDeceasedUser(member.memberId);
    if (dead) {
      deceased.push(member);
    } else {
      eligible.push(member);
    }
  }

  return { eligible, deceased };
}

/**
 * When a user's death is reported, auto-resolve any pending consent records
 * they hold as a family member in other creators' consent processes.
 *
 * For each auto-resolved lifecycle where all consents are now complete,
 * triggers the appropriate transition (auto-open or data deletion).
 *
 * Best-effort per lifecycle: errors are logged but do not propagate.
 */
export async function autoResolveDeceasedMemberConsent(
  deceasedUserId: string,
): Promise<void> {
  const memberships = await db
    .select({
      familyMemberId: familyMembers.id,
      creatorId: familyMembers.creatorId,
    })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.memberId, deceasedUserId),
        eq(familyMembers.isActive, true),
      ),
    );

  if (memberships.length === 0) return;

  const now = new Date();

  for (const membership of memberships) {
    try {
      const lifecycle = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, membership.creatorId),
        columns: { id: true, status: true, deletionStatus: true },
      });

      if (!lifecycle) continue;

      // Auto-resolve pending opening consent
      if (lifecycle.status === "consent_gathering") {
        await autoResolveOpeningConsent(
          lifecycle.id,
          membership.creatorId,
          membership.familyMemberId,
          deceasedUserId,
          now,
        );
      }

      // Auto-resolve pending deletion consent
      if (lifecycle.deletionStatus === "deletion_consent_gathering") {
        await autoResolveDeletionConsent(
          lifecycle.id,
          membership.creatorId,
          membership.familyMemberId,
          deceasedUserId,
          now,
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to auto-resolve consent for deceased member", {
        deceasedUserId,
        creatorId: membership.creatorId,
        error: msg,
      });
    }
  }
}

/**
 * Auto-resolve a deceased member's pending opening consent record.
 * If all consents are now complete, auto-transitions to "opened".
 */
async function autoResolveOpeningConsent(
  lifecycleId: string,
  creatorId: string,
  familyMemberId: string,
  deceasedUserId: string,
  now: Date,
): Promise<void> {
  const updated = await db
    .update(consentRecords)
    .set({ consented: true, consentedAt: now, autoResolved: true })
    .where(
      and(
        eq(consentRecords.lifecycleId, lifecycleId),
        eq(consentRecords.familyMemberId, familyMemberId),
        isNull(consentRecords.consented),
      ),
    )
    .returning({ id: consentRecords.id });

  if (updated.length === 0) return;

  await logLifecycleAction(
    lifecycleId,
    "consent_auto_resolved_deceased",
    deceasedUserId,
    {
      familyMemberId,
    },
  );

  // Check if all opening consents are now complete
  const allRecords = await db
    .select({ consented: consentRecords.consented })
    .from(consentRecords)
    .where(eq(consentRecords.lifecycleId, lifecycleId));

  const allConsented =
    allRecords.length > 0 && allRecords.every((r) => r.consented === true);

  if (!allConsented) return;

  // Auto-open: transition to "opened" and apply access presets
  const [openedRecord] = await db
    .update(noteLifecycle)
    .set({ status: "opened", openedAt: now, updatedAt: now })
    .where(
      and(
        eq(noteLifecycle.id, lifecycleId),
        eq(noteLifecycle.status, "consent_gathering"),
      ),
    )
    .returning({ id: noteLifecycle.id });

  if (!openedRecord) return;

  // Apply creator's access presets
  const presets = await db
    .select({
      familyMemberId: accessPresets.familyMemberId,
      categoryId: accessPresets.categoryId,
    })
    .from(accessPresets)
    .where(eq(accessPresets.creatorId, creatorId));

  if (presets.length > 0) {
    await db
      .insert(categoryAccess)
      .values(
        presets.map((p) => ({
          lifecycleId,
          familyMemberId: p.familyMemberId,
          categoryId: p.categoryId,
          grantedBy: null,
        })),
      )
      .onConflictDoNothing();
  }

  await logLifecycleAction(lifecycleId, "note_auto_opened", deceasedUserId, {
    reason: "deceased_member_auto_resolved",
  });

  // Notify living family members
  const creatorName = await getCreatorName(creatorId);
  const members = await getActiveFamilyMembers(creatorId);
  const livingMemberIds = members
    .filter((m) => m.memberId !== deceasedUserId)
    .map((m) => m.memberId);

  await notifyFamilyMembers(
    livingMemberIds,
    "note_opened",
    "ノートが開封されました",
    `${creatorName}さんのノートが開封されました`,
    creatorId,
  );
}

/**
 * Auto-resolve a deceased member's pending deletion consent record.
 * If all consents are now complete, executes data deletion.
 */
async function autoResolveDeletionConsent(
  lifecycleId: string,
  creatorId: string,
  familyMemberId: string,
  deceasedUserId: string,
  now: Date,
): Promise<void> {
  const updated = await db
    .update(deletionConsentRecords)
    .set({ consented: true, consentedAt: now, autoResolved: true })
    .where(
      and(
        eq(deletionConsentRecords.lifecycleId, lifecycleId),
        eq(deletionConsentRecords.familyMemberId, familyMemberId),
        isNull(deletionConsentRecords.consented),
      ),
    )
    .returning({ id: deletionConsentRecords.id });

  if (updated.length === 0) return;

  await logLifecycleAction(
    lifecycleId,
    "deletion_consent_auto_resolved_deceased",
    deceasedUserId,
    { familyMemberId },
  );

  // Check if all deletion consents are now complete
  const allRecords = await db
    .select({ consented: deletionConsentRecords.consented })
    .from(deletionConsentRecords)
    .where(eq(deletionConsentRecords.lifecycleId, lifecycleId));

  const allConsented =
    allRecords.length > 0 && allRecords.every((r) => r.consented === true);

  if (!allConsented) return;

  // Execute data deletion
  await logLifecycleAction(
    lifecycleId,
    "data_deletion_auto_executed",
    deceasedUserId,
    {
      reason: "deceased_member_auto_resolved",
    },
  );

  // Notify living family members before deletion
  const creatorName = await getCreatorName(creatorId);
  const members = await getActiveFamilyMembers(creatorId);
  const livingMemberIds = members
    .filter((m) => m.memberId !== deceasedUserId)
    .map((m) => m.memberId);

  await notifyFamilyMembers(
    livingMemberIds,
    "data_deleted",
    "ノートデータが削除されました",
    `${creatorName}さんのノートデータは、全員の同意により削除されました`,
    creatorId,
  );

  // Clean up R2 audio files (best-effort)
  await deleteUserAudioFiles(creatorId);

  // Delete conversations and lifecycle records
  await db.delete(conversations).where(eq(conversations.userId, creatorId));
  await db
    .delete(deletionConsentRecords)
    .where(eq(deletionConsentRecords.lifecycleId, lifecycleId));
  await db
    .delete(consentRecords)
    .where(eq(consentRecords.lifecycleId, lifecycleId));
  await db.delete(noteLifecycle).where(eq(noteLifecycle.id, lifecycleId));
}

/**
 * Revert auto-resolved consent records when a death report is cancelled.
 * Resets records that were auto-resolved (autoResolved = true) back to
 * pending state (consented = null, autoResolved = false).
 */
export async function revertAutoResolvedConsent(
  cancelledUserId: string,
): Promise<void> {
  const memberships = await db
    .select({
      familyMemberId: familyMembers.id,
      creatorId: familyMembers.creatorId,
    })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.memberId, cancelledUserId),
        eq(familyMembers.isActive, true),
      ),
    );

  if (memberships.length === 0) return;

  for (const membership of memberships) {
    try {
      // Revert opening consent records
      const openingReverted = await db
        .update(consentRecords)
        .set({ consented: null, consentedAt: null, autoResolved: false })
        .where(
          and(
            eq(consentRecords.familyMemberId, membership.familyMemberId),
            eq(consentRecords.autoResolved, true),
          ),
        )
        .returning({ id: consentRecords.id });

      // Revert deletion consent records
      const deletionReverted = await db
        .update(deletionConsentRecords)
        .set({ consented: null, consentedAt: null, autoResolved: false })
        .where(
          and(
            eq(
              deletionConsentRecords.familyMemberId,
              membership.familyMemberId,
            ),
            eq(deletionConsentRecords.autoResolved, true),
          ),
        )
        .returning({ id: deletionConsentRecords.id });

      if (openingReverted.length > 0 || deletionReverted.length > 0) {
        const lifecycle = await db.query.noteLifecycle.findFirst({
          where: eq(noteLifecycle.creatorId, membership.creatorId),
          columns: { id: true },
        });
        if (lifecycle) {
          await logLifecycleAction(
            lifecycle.id,
            "consent_auto_resolution_reverted",
            cancelledUserId,
            {
              openingReverted: openingReverted.length,
              deletionReverted: deletionReverted.length,
            },
          );
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to revert auto-resolved consent", {
        cancelledUserId,
        creatorId: membership.creatorId,
        error: msg,
      });
    }
  }
}
