import { eq } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations } from "../db/schema.js";
import { r2 } from "./r2.js";
import { logger } from "./logger.js";

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
  }
}
