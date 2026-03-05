import archiver from "archiver";
import { Readable } from "node:stream";
import { eq, desc } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations, users } from "../db/schema.js";
import { r2 } from "./r2.js";
import { logger } from "./logger.js";
import {
  formatDate,
  getCategoryLabel,
  parseTranscript,
  formatTranscript,
  buildConversationSummaryText,
  buildEndingNoteText,
  buildConversationFolderName,
  getAudioExtension,
  buildReadmeText,
} from "./data-export-formatters.js";

export { formatDate } from "./data-export-formatters.js";

export async function generateDataExportZip(userId: string): Promise<Readable> {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.startedAt));

  const userRow = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true },
  });
  const userName = userRow?.name ?? "";

  const archive = archiver("zip", { zlib: { level: 5 } });
  const rootDir = `エンディングノート_${formatDate(new Date())}`;

  const endingNoteText = buildEndingNoteText(rows, userName);
  archive.append(endingNoteText, { name: `${rootDir}/エンディングノート.txt` });

  const audioFailures: string[] = [];

  for (const [i, row] of rows.entries()) {
    const folderName = buildConversationFolderName(i + 1, row);
    const convDir = `${rootDir}/会話/${folderName}`;

    const transcript = parseTranscript(row.transcript);
    const transcriptText = formatTranscript(transcript);
    archive.append(transcriptText, { name: `${convDir}/会話内容.txt` });

    const summaryText = buildConversationSummaryText(row);
    archive.append(summaryText, { name: `${convDir}/要約.txt` });

    if (row.audioAvailable && row.audioStorageKey !== null && r2 !== null) {
      try {
        const result = await r2.downloadObject(row.audioStorageKey);
        const ext = getAudioExtension(row.audioMimeType);
        archive.append(result.data, { name: `${convDir}/録音${ext}` });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to download audio for export", {
          conversationId: row.id,
          storageKey: row.audioStorageKey,
          error: message,
        });
        audioFailures.push(folderName);
      }
    }
  }

  const metadata = {
    exportedAt: new Date().toISOString(),
    userName,
    totalConversations: rows.length,
    conversations: rows.map((row, i) => ({
      index: i + 1,
      id: row.id,
      category: row.category,
      categoryLabel: getCategoryLabel(row.category),
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      summaryStatus: row.summaryStatus,
      audioAvailable: row.audioAvailable,
      discussedCategories: row.discussedCategories,
    })),
  };
  archive.append(JSON.stringify(metadata, null, 2), {
    name: `${rootDir}/メタデータ.json`,
  });

  const readmeText = buildReadmeText(audioFailures);
  archive.append(readmeText, { name: `${rootDir}/README.txt` });

  await archive.finalize();

  return archive;
}
