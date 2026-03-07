// Periodic recovery for conversations stuck in "pending" summary status.
// If a client disappears (browser closed, network lost) before summarization
// completes, the conversation record remains with summaryStatus = "pending".
// This module periodically finds such stale records and re-runs summarization.
//
// Follows the same setInterval pattern as session-tracker.ts.

import { eq, and, lt } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations } from "../db/schema.js";
import { summarizeConversation } from "../services/summarizer.js";
import {
  transcribeFromR2,
  buildHybridTranscript,
} from "../services/transcriber.js";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";

import type { QuestionCategory } from "../types/conversation.js";

// --- Constants ---

/** How often to check for stuck pending summaries. */
const RECOVERY_INTERVAL_MS = 30 * 1000; // 30 seconds

/** Minimum age before a pending record is considered stale.
 *  Prevents racing with a still-running client Promise chain. */
const PENDING_STALENESS_THRESHOLD_MS = 60 * 1000; // 1 minute

/** Maximum records to process per sweep (avoid overloading the OpenAI API). */
const MAX_RECOVERY_BATCH_SIZE = 3;

/** Delay before the first recovery run after startup. */
const STARTUP_DELAY_MS = 10_000;

// --- Types ---

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
}

// --- Recovery logic ---

async function recoverPendingSummaries(): Promise<void> {
  try {
    const config = loadConfig();
    const cutoff = new Date(Date.now() - PENDING_STALENESS_THRESHOLD_MS);

    const pendingRows = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.summaryStatus, "pending"),
          lt(conversations.createdAt, cutoff),
        ),
      )
      .limit(MAX_RECOVERY_BATCH_SIZE);

    if (pendingRows.length === 0) {
      return;
    }

    logger.info("Recovering pending summaries", {
      count: pendingRows.length,
    });

    for (const row of pendingRows) {
      try {
        const transcript = row.transcript;

        if (!Array.isArray(transcript) || transcript.length === 0) {
          // No transcript to summarize — mark as failed
          await db
            .update(conversations)
            .set({ summaryStatus: "failed" })
            .where(eq(conversations.id, row.id));
          logger.warn("Skipped recovery: empty transcript", {
            conversationId: row.id,
          });
          continue;
        }

        let typedTranscript = transcript as TranscriptEntry[];
        const category = row.category as QuestionCategory | null;
        let transcriptionModel: string | null = null;

        // Attempt re-transcription if audio is available
        if (row.audioAvailable && row.audioStorageKey !== null) {
          const retranscription = await transcribeFromR2(row.audioStorageKey);
          if (
            retranscription !== null &&
            retranscription.text.trim().length > 0
          ) {
            typedTranscript = buildHybridTranscript(
              typedTranscript,
              retranscription,
            );
            transcriptionModel = config.openaiModels.retranscription;
            logger.info("Recovery: using re-transcribed audio", {
              conversationId: row.id,
            });
          }
        }

        let summaryTranscript = typedTranscript;
        let summaryTranscriptionModel = transcriptionModel;
        let result;
        try {
          result = await summarizeConversation({
            category,
            transcript: summaryTranscript,
            // previousNoteEntries omitted: recovery context is limited,
            // but having a summary without prior context is far better
            // than no summary at all.
          });
        } catch (error: unknown) {
          if (transcriptionModel === null) {
            throw error;
          }

          const message =
            error instanceof Error ? error.message : "Unknown error";
          logger.warn(
            "Recovery summarization failed with re-transcribed transcript; retrying with original transcript",
            {
              conversationId: row.id,
              error: message,
            },
          );

          summaryTranscript = transcript as TranscriptEntry[];
          summaryTranscriptionModel = null;
          result = await summarizeConversation({
            category,
            transcript: summaryTranscript,
          });
        }

        // Only update if still pending (avoid overwriting a concurrent client update)
        const shouldKeepAsPending =
          category === null && result.noteUpdateProposals.length > 0;
        const updateData: Record<string, unknown> = {
          summary: result.summary,
          summaryStatus: "completed",
          coveredQuestionIds: shouldKeepAsPending
            ? []
            : result.coveredQuestionIds,
          noteEntries: shouldKeepAsPending ? [] : result.noteEntries,
          pendingNoteEntries: shouldKeepAsPending ? result.noteEntries : [],
          noteUpdateProposals: shouldKeepAsPending
            ? result.noteUpdateProposals
            : [],
          oneLinerSummary: result.oneLinerSummary,
          discussedCategories: result.discussedCategories,
          keyPoints: result.keyPoints,
          topicAdherence: result.topicAdherence,
          offTopicSummary: result.offTopicSummary,
        };

        if (summaryTranscriptionModel !== null) {
          updateData["improvedTranscript"] = summaryTranscript;
          updateData["transcriptionModel"] = summaryTranscriptionModel;
        }

        await db
          .update(conversations)
          .set(updateData)
          .where(
            and(
              eq(conversations.id, row.id),
              eq(conversations.summaryStatus, "pending"),
            ),
          );

        logger.info("Recovered pending summary", {
          conversationId: row.id,
          transcriptionModel:
            summaryTranscriptionModel ?? "original transcript",
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to recover pending summary", {
          conversationId: row.id,
          error: message,
        });

        // Mark as failed so it won't be retried indefinitely
        try {
          await db
            .update(conversations)
            .set({ summaryStatus: "failed" })
            .where(
              and(
                eq(conversations.id, row.id),
                eq(conversations.summaryStatus, "pending"),
              ),
            );
        } catch {
          // Best-effort — if this also fails, the next sweep will retry
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Pending summary recovery sweep failed", {
      error: message,
    });
  }
}

// --- Start periodic recovery ---

setInterval(() => {
  void recoverPendingSummaries();
}, RECOVERY_INTERVAL_MS);

// Run once on startup after a short delay (let DB connections settle)
setTimeout(() => {
  void recoverPendingSummaries();
}, STARTUP_DELAY_MS);

logger.info("Pending summary recovery initialized", {
  intervalMs: RECOVERY_INTERVAL_MS,
  stalenessThresholdMs: PENDING_STALENESS_THRESHOLD_MS,
});
