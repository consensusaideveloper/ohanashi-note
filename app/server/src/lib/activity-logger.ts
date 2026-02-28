import { eq, and, gte } from "drizzle-orm";

import { db } from "../db/connection.js";
import { activityLog } from "../db/schema.js";
import { logger } from "./logger.js";

// --- Types ---

interface LogActivityParams {
  creatorId: string;
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

interface LogReadAccessParams {
  creatorId: string;
  actorId: string;
  actorRole: string;
  resourceType: string;
  resourceId: string;
}

// --- Activity logging ---

/**
 * Record an action in the activity log for audit purposes.
 * Best-effort: logs errors but does not throw — audit logging should never
 * block the primary operation.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await db.insert(activityLog).values({
      creatorId: params.creatorId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to write activity log", {
      action: params.action,
      creatorId: params.creatorId,
      error: msg,
    });
  }
}

/**
 * Record a read-access event with daily deduplication.
 * Only logs the first access per actor+resource+day to reduce log volume.
 * Best-effort: logs errors but does not throw.
 */
export async function logReadAccess(
  params: LogReadAccessParams,
): Promise<void> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await db.query.activityLog.findFirst({
      where: and(
        eq(activityLog.creatorId, params.creatorId),
        eq(activityLog.actorId, params.actorId),
        eq(activityLog.resourceType, params.resourceType),
        eq(activityLog.resourceId, params.resourceId),
        gte(activityLog.createdAt, todayStart),
      ),
      columns: { id: true },
    });

    if (existing) return;

    await db.insert(activityLog).values({
      creatorId: params.creatorId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: `${params.resourceType}_viewed`,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to write read-access log", {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      error: msg,
    });
  }
}
