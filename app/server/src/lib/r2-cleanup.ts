import { eq, asc } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations, pendingR2Deletions } from "../db/schema.js";
import { r2 } from "./r2.js";
import { logger } from "./logger.js";

const RETRY_INTERVAL_MS = 60 * 60 * 1000;
const RETRY_BATCH_SIZE = 50;

async function enqueuePendingR2Deletion(
  storageKey: string,
  reason: string,
): Promise<void> {
  const now = new Date();
  const existing = await db.query.pendingR2Deletions.findFirst({
    where: eq(pendingR2Deletions.storageKey, storageKey),
    columns: { id: true, retryCount: true },
  });

  if (existing) {
    await db
      .update(pendingR2Deletions)
      .set({
        reason,
        lastFailedAt: now,
        retryCount: existing.retryCount + 1,
        updatedAt: now,
      })
      .where(eq(pendingR2Deletions.id, existing.id));
    return;
  }

  await db.insert(pendingR2Deletions).values({
    storageKey,
    reason,
    firstFailedAt: now,
    lastFailedAt: now,
    retryCount: 1,
    updatedAt: now,
  });
}

/**
 * Delete all R2 audio objects associated with a user's conversations.
 * Best-effort: logs errors but does not throw.
 */
export async function deleteUserAudioFiles(userId: string): Promise<void> {
  if (r2 === null) {
    return;
  }

  const rows = await db
    .select({ audioStorageKey: conversations.audioStorageKey })
    .from(conversations)
    .where(eq(conversations.userId, userId));

  const keys = rows
    .map((row) => row.audioStorageKey)
    .filter((key): key is string => key !== null);

  if (keys.length === 0) {
    return;
  }

  let deletedCount = 0;
  for (const key of keys) {
    try {
      await r2.deleteObject(key);
      deletedCount++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to delete R2 audio file", { key, error: message });
      await enqueuePendingR2Deletion(key, "user_audio_cleanup");
    }
  }

  logger.info("R2 audio cleanup completed", {
    userId,
    total: keys.length,
    deleted: deletedCount,
  });
}

/**
 * Delete a single R2 audio object by its storage key.
 * Best-effort: logs errors but does not throw.
 */
export async function deleteConversationAudioFile(
  audioStorageKey: string,
): Promise<void> {
  if (r2 === null) {
    return;
  }

  try {
    await r2.deleteObject(audioStorageKey);
    logger.info("R2 audio file deleted", { key: audioStorageKey });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to delete R2 audio file", {
      key: audioStorageKey,
      error: message,
    });
    await enqueuePendingR2Deletion(audioStorageKey, "single_audio_cleanup");
  }
}

export async function retryPendingR2Deletions(): Promise<void> {
  if (r2 === null) {
    return;
  }

  const rows = await db
    .select({
      id: pendingR2Deletions.id,
      storageKey: pendingR2Deletions.storageKey,
      retryCount: pendingR2Deletions.retryCount,
    })
    .from(pendingR2Deletions)
    .orderBy(asc(pendingR2Deletions.lastFailedAt))
    .limit(RETRY_BATCH_SIZE);

  for (const row of rows) {
    try {
      await r2.deleteObject(row.storageKey);
      await db
        .delete(pendingR2Deletions)
        .where(eq(pendingR2Deletions.id, row.id));
      logger.info("Retried R2 deletion succeeded", { key: row.storageKey });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await db
        .update(pendingR2Deletions)
        .set({
          lastFailedAt: new Date(),
          retryCount: row.retryCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(pendingR2Deletions.id, row.id));
      logger.error("Retried R2 deletion failed", {
        key: row.storageKey,
        error: message,
      });
    }
  }
}

setInterval(() => {
  void retryPendingR2Deletions();
}, RETRY_INTERVAL_MS);

logger.info("R2 deletion retry job initialized", {
  intervalMs: RETRY_INTERVAL_MS,
});
