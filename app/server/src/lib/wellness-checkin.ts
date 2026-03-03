// Records daily check-in events for wellness tracking.
// Called after a conversation is successfully saved or recovered.
// Best-effort: never blocks the primary operation.

import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import { wellnessCheckins, wellnessSettings } from "../db/schema.js";
import { getJstDateString } from "./wellness-helpers.js";
import { logger } from "./logger.js";

/**
 * Record a wellness check-in for today if the creator has wellness enabled.
 * Creates or updates the daily check-in row.
 *
 * Best-effort: logs errors but does not throw — check-in recording
 * should never block conversation saving.
 */
export async function recordWellnessCheckin(
  creatorId: string,
  conversationId: string,
  oneLinerSummary: string | null,
): Promise<void> {
  try {
    // Check if wellness is enabled for this creator
    const settings = await db.query.wellnessSettings.findFirst({
      where: and(
        eq(wellnessSettings.creatorId, creatorId),
        eq(wellnessSettings.enabled, true),
      ),
      columns: { sharingLevel: true },
    });

    if (settings === undefined) return;

    const today = getJstDateString();

    // Check if a check-in already exists for today
    const existing = await db.query.wellnessCheckins.findFirst({
      where: and(
        eq(wellnessCheckins.creatorId, creatorId),
        eq(wellnessCheckins.date, today),
      ),
      columns: { id: true, hadConversation: true },
    });

    if (existing !== undefined && existing.hadConversation) {
      // Already recorded a conversation for today — no-op
      return;
    }

    const summary =
      settings.sharingLevel === "activity_and_summary" ? oneLinerSummary : null;

    if (existing !== undefined) {
      // Row exists but hadConversation is false (defensive case)
      await db
        .update(wellnessCheckins)
        .set({
          hadConversation: true,
          conversationId,
          summary,
          updatedAt: new Date(),
        })
        .where(eq(wellnessCheckins.id, existing.id));
    } else {
      // Create new check-in row
      await db.insert(wellnessCheckins).values({
        creatorId,
        date: today,
        hadConversation: true,
        conversationId,
        summary,
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to record wellness check-in", {
      creatorId,
      conversationId,
      error: msg,
    });
  }
}
