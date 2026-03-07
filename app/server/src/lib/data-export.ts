import archiver from "archiver";
import { Readable } from "node:stream";
import { and, eq, desc, count, gte, lt } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations, users } from "../db/schema.js";
import { r2 } from "./r2.js";
import { logger } from "./logger.js";
import { buildConversationPdf, buildEndingNotePdf } from "./data-export-pdf.js";
import {
  buildConversationFolderName,
  formatDate,
  getAudioExtension,
} from "./data-export-formatters.js";

export { formatDate } from "./data-export-formatters.js";

interface DataExportScopeOptions {
  startedAtFrom?: Date;
  startedAtToExclusive?: Date;
}

export async function countDataExportConversations(
  userId: string,
  options: DataExportScopeOptions = {},
): Promise<number> {
  const whereClause = and(
    eq(conversations.userId, userId),
    options.startedAtFrom !== undefined
      ? gte(conversations.startedAt, options.startedAtFrom)
      : undefined,
    options.startedAtToExclusive !== undefined
      ? lt(conversations.startedAt, options.startedAtToExclusive)
      : undefined,
  );

  const [result] = await db
    .select({ value: count() })
    .from(conversations)
    .where(whereClause);
  return result?.value ?? 0;
}

interface GenerateDataExportOptions extends DataExportScopeOptions {
  includeAudio?: boolean;
}

export async function generateDataExportZip(
  userId: string,
  options: GenerateDataExportOptions = {},
): Promise<Readable> {
  const includeAudio = options.includeAudio === true;
  const whereClause = and(
    eq(conversations.userId, userId),
    options.startedAtFrom !== undefined
      ? gte(conversations.startedAt, options.startedAtFrom)
      : undefined,
    options.startedAtToExclusive !== undefined
      ? lt(conversations.startedAt, options.startedAtToExclusive)
      : undefined,
  );

  const rows = await db
    .select()
    .from(conversations)
    .where(whereClause)
    .orderBy(desc(conversations.startedAt));

  const userRow = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true },
  });
  const userName = userRow?.name ?? "";

  const archive = archiver("zip", { zlib: { level: 5 } });
  const rootDir = `エンディングノート_${formatDate(new Date())}`;

  // Ending note PDF (structured layout with all categories, Q&A, insights)
  const endingNotePdf = await buildEndingNotePdf(rows, userName);
  archive.append(endingNotePdf, { name: `${rootDir}/エンディングノート.pdf` });

  // Per-conversation PDFs and audio
  for (const [i, row] of rows.entries()) {
    const folderName = buildConversationFolderName(i + 1, row);
    const convDir = `${rootDir}/会話の記録/${folderName}`;

    let exportedAudioFileName: string | null = null;
    if (
      includeAudio &&
      row.audioAvailable &&
      row.audioStorageKey !== null &&
      r2 !== null
    ) {
      try {
        const result = await r2.downloadObject(row.audioStorageKey);
        const ext = getAudioExtension(row.audioMimeType);
        exportedAudioFileName = `録音${ext}`;
        archive.append(result.data, {
          name: `${convDir}/${exportedAudioFileName}`,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to download audio for export", {
          conversationId: row.id,
          storageKey: row.audioStorageKey,
          error: message,
        });
      }
    }

    const conversationPdf = await buildConversationPdf(row, {
      hasAudio: exportedAudioFileName !== null,
      audioFileName: exportedAudioFileName,
    });
    archive.append(conversationPdf, {
      name: `${convDir}/会話の記録.pdf`,
    });
  }

  await archive.finalize();

  return archive;
}
