import archiver from "archiver";
import { Readable } from "node:stream";
import { and, eq, desc, count, gte, lt } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations, users } from "../db/schema.js";
import { r2 } from "./r2.js";
import { logger } from "./logger.js";
import { buildConversationPdf, buildEndingNotePdf } from "./data-export-pdf.js";
import {
  buildAudioLinkageCsv,
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

  const endingNotePdf = await buildEndingNotePdf(rows, userName);
  archive.append(endingNotePdf, { name: `${rootDir}/エンディングノート.pdf` });

  const endingNoteText = buildEndingNoteText(rows, userName);
  archive.append(endingNoteText, { name: `${rootDir}/エンディングノート.txt` });

  const audioFailures: string[] = [];
  const audioLinkageRows: Array<{
    index: number;
    conversationId: string;
    categoryLabel: string;
    startedAt: Date;
    folderName: string;
    conversationPdfFileName: string;
    audioFileName: string | null;
  }> = [];

  for (const [i, row] of rows.entries()) {
    const folderName = buildConversationFolderName(i + 1, row);
    const convDir = `${rootDir}/会話/${folderName}`;
    const conversationPdfFileName = "会話記録.pdf";

    const transcript = parseTranscript(row.transcript);
    const transcriptText = formatTranscript(transcript);
    archive.append(transcriptText, { name: `${convDir}/会話内容.txt` });

    const summaryText = buildConversationSummaryText(row);
    archive.append(summaryText, { name: `${convDir}/要約.txt` });

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
        audioFailures.push(folderName);
      }
    }

    const conversationPdf = await buildConversationPdf(row, {
      conversationIndex: i + 1,
      audioFileName: exportedAudioFileName,
    });
    archive.append(conversationPdf, {
      name: `${convDir}/${conversationPdfFileName}`,
    });

    audioLinkageRows.push({
      index: i + 1,
      conversationId: row.id,
      categoryLabel: getCategoryLabel(row.category),
      startedAt: row.startedAt,
      folderName,
      conversationPdfFileName,
      audioFileName: exportedAudioFileName,
    });
  }

  if (includeAudio) {
    archive.append(buildAudioLinkageCsv(audioLinkageRows), {
      name: `${rootDir}/音源対応表.csv`,
    });
  }

  const metadata = {
    exportedAt: new Date().toISOString(),
    userName,
    includeAudio,
    totalConversations: rows.length,
    conversations: rows.map((row, i) => {
      const linkage = audioLinkageRows.find(
        (item) => item.conversationId === row.id,
      );
      return {
        index: i + 1,
        id: row.id,
        category: row.category,
        categoryLabel: getCategoryLabel(row.category),
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        summaryStatus: row.summaryStatus,
        audioAvailable: row.audioAvailable,
        discussedCategories: row.discussedCategories,
        conversationPdfFileName: "会話記録.pdf",
        audioFileName: linkage?.audioFileName ?? null,
      };
    }),
  };
  archive.append(JSON.stringify(metadata, null, 2), {
    name: `${rootDir}/メタデータ.json`,
  });

  const readmeText = buildReadmeText(audioFailures, {
    includesPdf: true,
    includesAudioLinkage: includeAudio,
    includesAudio: includeAudio,
  });
  archive.append(readmeText, { name: `${rootDir}/README.txt` });

  await archive.finalize();

  return archive;
}
