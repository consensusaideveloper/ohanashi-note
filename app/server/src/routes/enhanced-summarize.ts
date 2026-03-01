// Enhanced summarization endpoint.
// Downloads audio from R2, re-transcribes with gpt-4o-mini-transcribe,
// builds a hybrid transcript, and runs summarization for higher accuracy.

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";
import { summarizeConversation } from "../services/summarizer.js";
import {
  transcribeFromR2,
  buildHybridTranscript,
} from "../services/transcriber.js";

import type { Context } from "hono";
import type { QuestionCategory } from "../types/conversation.js";

// --- Constants ---

const VALID_CATEGORIES = new Set([
  "memories",
  "people",
  "house",
  "medical",
  "funeral",
  "money",
  "work",
  "digital",
  "legal",
  "trust",
  "support",
]);

const TRANSCRIPTION_MODEL_NAME = "gpt-4o-mini-transcribe";

// --- Types ---

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
}

interface PreviousNoteEntry {
  questionId: string;
  questionTitle: string;
  answer: string;
}

// --- Route ---

const enhancedSummarizeRoute = new Hono();

enhancedSummarizeRoute.post(
  "/api/conversations/:id/enhanced-summarize",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const conversationId = c.req.param("id");

      // Parse request body
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(
          {
            error: "リクエストの形式が正しくありません",
            code: "INVALID_JSON",
          },
          400,
        );
      }

      if (typeof body !== "object" || body === null) {
        return c.json(
          {
            error: "リクエストの形式が正しくありません",
            code: "INVALID_BODY",
          },
          400,
        );
      }

      const { category, previousNoteEntries } = body as Record<string, unknown>;

      // Validate category
      if (
        category !== null &&
        category !== undefined &&
        (typeof category !== "string" || !VALID_CATEGORIES.has(category))
      ) {
        return c.json(
          {
            error: "カテゴリが正しくありません",
            code: "INVALID_CATEGORY",
          },
          400,
        );
      }

      const validatedCategory = (category as QuestionCategory | null) ?? null;

      // Validate previousNoteEntries
      let validatedPreviousEntries: PreviousNoteEntry[] | undefined;
      if (previousNoteEntries !== undefined && previousNoteEntries !== null) {
        if (!Array.isArray(previousNoteEntries)) {
          return c.json(
            {
              error: "以前のノート情報の形式が正しくありません",
              code: "INVALID_PREVIOUS_ENTRIES",
            },
            400,
          );
        }
        validatedPreviousEntries = previousNoteEntries as PreviousNoteEntry[];
      }

      // Fetch conversation from DB
      const row = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      });

      if (!row) {
        return c.json(
          { error: "会話が見つかりません", code: "NOT_FOUND" },
          404,
        );
      }

      // Get the original transcript
      const originalTranscript = row.transcript as TranscriptEntry[];
      if (
        !Array.isArray(originalTranscript) ||
        originalTranscript.length === 0
      ) {
        return c.json(
          { error: "会話の内容がありません", code: "EMPTY_TRANSCRIPT" },
          400,
        );
      }

      // Attempt re-transcription if audio is available
      let transcriptForSummary: TranscriptEntry[] = originalTranscript;
      let usedModel: string | null = null;

      if (row.audioAvailable && row.audioStorageKey !== null) {
        logger.info("Attempting re-transcription for enhanced summarization", {
          conversationId,
          audioStorageKey: row.audioStorageKey,
        });

        const retranscription = await transcribeFromR2(row.audioStorageKey);

        if (
          retranscription !== null &&
          retranscription.text.trim().length > 0
        ) {
          transcriptForSummary = buildHybridTranscript(
            originalTranscript,
            retranscription,
          );
          usedModel = TRANSCRIPTION_MODEL_NAME;

          logger.info("Using re-transcribed transcript for summarization", {
            conversationId,
            originalUserChars: originalTranscript
              .filter((t) => t.role === "user")
              .reduce((sum, t) => sum + t.text.length, 0),
            improvedUserChars: transcriptForSummary
              .filter((t) => t.role === "user")
              .reduce((sum, t) => sum + t.text.length, 0),
          });
        } else {
          logger.warn(
            "Re-transcription failed or empty, falling back to original",
            { conversationId },
          );
        }
      } else {
        logger.info(
          "No audio available, using original transcript for summarization",
          { conversationId },
        );
      }

      // Run summarization
      const result = await summarizeConversation({
        category: validatedCategory,
        transcript: transcriptForSummary.map((t) => ({
          role: t.role,
          text: t.text,
        })),
        previousNoteEntries: validatedPreviousEntries,
      });

      // Update conversation with summary results and improved transcript
      const updateData: Record<string, unknown> = {
        summary: result.summary,
        summaryStatus: "completed",
        coveredQuestionIds: result.coveredQuestionIds,
        noteEntries: result.noteEntries,
        oneLinerSummary: result.oneLinerSummary,
        discussedCategories: result.discussedCategories,
        keyPoints: result.keyPoints,
        topicAdherence: result.topicAdherence,
        offTopicSummary: result.offTopicSummary,
      };

      if (usedModel !== null) {
        updateData["improvedTranscript"] = transcriptForSummary;
        updateData["transcriptionModel"] = usedModel;
      }

      await db
        .update(conversations)
        .set(updateData)
        .where(eq(conversations.id, conversationId));

      logger.info("Enhanced summarization completed", {
        conversationId,
        transcriptionModel: usedModel ?? "whisper-1 (original)",
        coveredQuestions: result.coveredQuestionIds.length,
        noteEntries: result.noteEntries.length,
      });

      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Enhanced summarization failed", { error: message });
      return c.json(
        {
          error: "お話のまとめに失敗しました",
          code: "SUMMARIZATION_FAILED",
        },
        500,
      );
    }
  },
);

export { enhancedSummarizeRoute };
