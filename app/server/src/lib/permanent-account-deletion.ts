import { createHash } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  conversations,
  deletedAuthIdentities,
  deletionAuditLog,
  pendingAuthDeletions,
} from "../db/schema.js";
import { deleteConversationAudioFile } from "./r2-cleanup.js";
import { deleteFirebaseUser } from "./firebase-admin.js";
import { logger } from "./logger.js";

const FIREBASE_PROVIDER = "firebase";
const AUTH_RETRY_INTERVAL_MS = 60 * 60 * 1000;
const AUTH_RETRY_BATCH_SIZE = 50;

function hashIdentity(identity: string): string {
  return createHash("sha256").update(identity).digest("hex");
}

export async function listUserAudioKeys(userId: string): Promise<string[]> {
  const rows = await db
    .select({ audioStorageKey: conversations.audioStorageKey })
    .from(conversations)
    .where(eq(conversations.userId, userId));

  return rows
    .map((row) => row.audioStorageKey)
    .filter((key): key is string => key !== null);
}

export async function completeDeletedUserCleanup(params: {
  userId: string;
  firebaseUid: string;
  deletionReason: string;
  audioKeys: string[];
  auditMetadata?: Record<string, unknown>;
}): Promise<void> {
  await db
    .insert(deletedAuthIdentities)
    .values({
      provider: FIREBASE_PROVIDER,
      identityHash: hashIdentity(params.firebaseUid),
      deletionReason: params.deletionReason,
    })
    .onConflictDoNothing();

  await db.insert(deletionAuditLog).values({
    deletedUserId: params.userId,
    firebaseUidHash: hashIdentity(params.firebaseUid),
    deletionReason: params.deletionReason,
    metadata: params.auditMetadata ?? null,
  });

  for (const key of params.audioKeys) {
    await deleteConversationAudioFile(key);
  }

  try {
    await deleteFirebaseUser(params.firebaseUid);
  } catch (firebaseError: unknown) {
    const msg =
      firebaseError instanceof Error
        ? firebaseError.message
        : String(firebaseError);
    logger.error("Failed to delete Firebase user during permanent deletion", {
      userId: params.userId,
      firebaseUid: params.firebaseUid,
      error: msg,
    });
    await enqueuePendingAuthDeletion(
      FIREBASE_PROVIDER,
      params.firebaseUid,
      params.deletionReason,
    );
  }
}

async function enqueuePendingAuthDeletion(
  provider: string,
  externalId: string,
  reason: string,
): Promise<void> {
  const now = new Date();
  const existing = await db.query.pendingAuthDeletions.findFirst({
    where: and(
      eq(pendingAuthDeletions.provider, provider),
      eq(pendingAuthDeletions.externalId, externalId),
    ),
    columns: { id: true, retryCount: true },
  });

  if (existing) {
    await db
      .update(pendingAuthDeletions)
      .set({
        reason,
        lastFailedAt: now,
        retryCount: existing.retryCount + 1,
        updatedAt: now,
      })
      .where(eq(pendingAuthDeletions.id, existing.id));
    return;
  }

  await db.insert(pendingAuthDeletions).values({
    provider,
    externalId,
    reason,
    firstFailedAt: now,
    lastFailedAt: now,
    retryCount: 1,
    updatedAt: now,
  });
}

export async function retryPendingAuthDeletions(): Promise<void> {
  const rows = await db
    .select({
      id: pendingAuthDeletions.id,
      provider: pendingAuthDeletions.provider,
      externalId: pendingAuthDeletions.externalId,
      retryCount: pendingAuthDeletions.retryCount,
    })
    .from(pendingAuthDeletions)
    .orderBy(asc(pendingAuthDeletions.lastFailedAt))
    .limit(AUTH_RETRY_BATCH_SIZE);

  for (const row of rows) {
    if (row.provider !== FIREBASE_PROVIDER) {
      continue;
    }

    try {
      await deleteFirebaseUser(row.externalId);
      await db
        .delete(pendingAuthDeletions)
        .where(eq(pendingAuthDeletions.id, row.id));
      logger.info("Retried auth deletion succeeded", {
        provider: row.provider,
        externalId: row.externalId,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await db
        .update(pendingAuthDeletions)
        .set({
          lastFailedAt: new Date(),
          retryCount: row.retryCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(pendingAuthDeletions.id, row.id));
      logger.error("Retried auth deletion failed", {
        provider: row.provider,
        externalId: row.externalId,
        error: message,
      });
    }
  }
}

setInterval(() => {
  void retryPendingAuthDeletions();
}, AUTH_RETRY_INTERVAL_MS);

logger.info("Auth deletion retry job initialized", {
  intervalMs: AUTH_RETRY_INTERVAL_MS,
});
