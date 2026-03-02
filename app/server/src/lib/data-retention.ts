// Periodic cleanup of internal intermediate data.
//
// POLICY: User-visible data (audio, transcript, metadata) is NEVER
// automatically deleted. This is an ending-note service — the data's
// long-term preservation IS the core value. Cost management is handled
// through pricing-plan storage limits, not automatic deletion.
// Users delete their own data explicitly via the conversation delete API.
//
// The ONLY automatic cleanup is for `improvedTranscript`, an internal
// intermediate artifact from the enhanced-summarize pipeline that is
// never served to any client API endpoint.
//
// Follows the same setInterval pattern as pending-summary-recovery.ts.

import { eq, and, lt, isNotNull } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations } from "../db/schema.js";
import { logger } from "./logger.js";

// --- Constants ---

/** How often to run the cleanup sweep. */
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Delay before the first cleanup run after startup. */
const STARTUP_DELAY_MS = 30_000; // 30 seconds

/**
 * Days after creation before improvedTranscript is cleared.
 * 7-day grace period allows re-running enhanced summarization if needed.
 */
const IMPROVED_TRANSCRIPT_RETENTION_DAYS = 7;

/** Maximum records to process per sweep. */
const MAX_CLEANUP_BATCH = 50;

// --- Cleanup ---

/** Clear improvedTranscript and transcriptionModel for completed conversations. */
async function cleanupImprovedTranscripts(): Promise<number> {
  const cutoff = new Date(
    Date.now() - IMPROVED_TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.summaryStatus, "completed"),
        isNotNull(conversations.improvedTranscript),
        lt(conversations.createdAt, cutoff),
      ),
    )
    .limit(MAX_CLEANUP_BATCH);

  if (rows.length === 0) {
    return 0;
  }

  let cleaned = 0;
  for (const row of rows) {
    try {
      await db
        .update(conversations)
        .set({
          improvedTranscript: null,
          transcriptionModel: null,
        })
        .where(eq(conversations.id, row.id));
      cleaned++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to clear improvedTranscript", {
        conversationId: row.id,
        error: message,
      });
    }
  }

  return cleaned;
}

// --- Main sweep ---

async function runCleanupSweep(): Promise<void> {
  try {
    const cleaned = await cleanupImprovedTranscripts();
    if (cleaned > 0) {
      logger.info("Internal data cleanup completed", {
        improvedTranscriptsCleaned: cleaned,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Internal data cleanup sweep failed", { error: message });
  }
}

// --- Start periodic cleanup ---

setInterval(() => {
  void runCleanupSweep();
}, CLEANUP_INTERVAL_MS);

// Run once on startup after a short delay (let DB connections settle)
setTimeout(() => {
  void runCleanupSweep();
}, STARTUP_DELAY_MS);

logger.info("Internal data cleanup initialized", {
  intervalMs: CLEANUP_INTERVAL_MS,
  improvedTranscriptRetentionDays: IMPROVED_TRANSCRIPT_RETENTION_DAYS,
});
