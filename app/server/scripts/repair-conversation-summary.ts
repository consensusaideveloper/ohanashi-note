import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";

import type { QuestionCategory } from "../src/types/conversation.js";

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
}

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../.env") });

async function main(): Promise<void> {
  const conversationId = getArgValue("--conversation-id");
  if (conversationId === null) {
    throw new Error("--conversation-id is required");
  }

  const [{ db }, { conversations }, { summarizeConversation }, transcriber] =
    await Promise.all([
      import("../src/db/connection.js"),
      import("../src/db/schema.js"),
      import("../src/services/summarizer.js"),
      import("../src/services/transcriber.js"),
    ]);
  const { buildHybridTranscript, transcribeFromR2 } = transcriber;

  const row = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });

  if (!row) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const transcript = row.transcript as TranscriptEntry[];
  if (!Array.isArray(transcript) || transcript.length === 0) {
    throw new Error(`Conversation has no transcript: ${conversationId}`);
  }

  let transcriptForSummary = transcript;
  let transcriptionModel: string | null = null;

  if (row.audioAvailable && row.audioStorageKey !== null) {
    const retranscription = await transcribeFromR2(row.audioStorageKey);
    if (retranscription !== null && retranscription.text.trim().length > 0) {
      transcriptForSummary = buildHybridTranscript(transcript, retranscription);
      transcriptionModel = "re-transcribed";
    }
  }

  const result = await summarizeConversation({
    category: row.category as QuestionCategory | null,
    transcript: transcriptForSummary.map((entry) => ({
      role: entry.role,
      text: entry.text,
    })),
  });

  const shouldKeepAsPending =
    row.category === null && result.noteUpdateProposals.length > 0;
  const updateData: Record<string, unknown> = {
    summary: result.summary,
    summaryStatus: "completed",
    coveredQuestionIds: shouldKeepAsPending ? [] : result.coveredQuestionIds,
    noteEntries: shouldKeepAsPending ? [] : result.noteEntries,
    pendingNoteEntries: shouldKeepAsPending ? result.noteEntries : [],
    noteUpdateProposals: shouldKeepAsPending ? result.noteUpdateProposals : [],
    oneLinerSummary: result.oneLinerSummary,
    discussedCategories: result.discussedCategories,
    keyPoints: result.keyPoints,
    topicAdherence: result.topicAdherence,
    offTopicSummary: result.offTopicSummary,
  };

  if (transcriptionModel !== null) {
    updateData["improvedTranscript"] = transcriptForSummary;
    updateData["transcriptionModel"] = transcriptionModel;
  }

  await db
    .update(conversations)
    .set(updateData)
    .where(eq(conversations.id, conversationId));

  console.log(
    JSON.stringify({
      conversationId,
      summaryStatus: "completed",
      coveredQuestionIds: result.coveredQuestionIds.length,
      noteEntries: result.noteEntries.length,
      noteUpdateProposals: result.noteUpdateProposals.length,
      usedRetranscription: transcriptionModel !== null,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
