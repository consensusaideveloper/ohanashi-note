import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  familyMembers,
  lifecycleActionLog,
  notifications,
  users,
} from "../db/schema.js";

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

  await db.insert(notifications).values(values);
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
