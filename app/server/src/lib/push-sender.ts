import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import { pushSubscriptions } from "../db/schema.js";
import { adminMessaging } from "./firebase-admin.js";
import { logActivity } from "./activity-logger.js";
import { logger } from "./logger.js";

// --- Constants ---

/** FCM error codes indicating the token is no longer valid. */
const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

// --- Helpers ---

/**
 * Deactivate a push subscription token that is no longer valid.
 * Best-effort: logs errors but does not throw.
 */
async function deactivateToken(fcmToken: string): Promise<void> {
  try {
    await db
      .update(pushSubscriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pushSubscriptions.fcmToken, fcmToken));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to deactivate push token", {
      fcmToken: fcmToken.slice(0, 20),
      error: msg,
    });
  }
}

/**
 * Extract the FCM error code from a Firebase messaging error.
 * Returns null if the code cannot be determined.
 */
function getFcmErrorCode(error: unknown): string | null {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as Record<string, unknown>)["code"] === "string"
  ) {
    return (error as Record<string, unknown>)["code"] as string;
  }
  return null;
}

// --- Public API ---

/**
 * Send a push notification to all active devices for a single user.
 * Best-effort: errors are logged but never thrown.
 * Invalid tokens are automatically deactivated.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    const tokens = await db
      .select({ fcmToken: pushSubscriptions.fcmToken })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.isActive, true),
        ),
      );

    if (tokens.length === 0) return;

    for (const { fcmToken } of tokens) {
      try {
        await adminMessaging.send({
          token: fcmToken,
          notification: { title, body },
          data: data ?? undefined,
        });
      } catch (error: unknown) {
        const code = getFcmErrorCode(error);
        if (code !== null && INVALID_TOKEN_CODES.has(code)) {
          await deactivateToken(fcmToken);
        }
        const msg = error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to send push notification", {
          userId,
          errorCode: code,
          error: msg,
        });
      }
    }

    void logActivity({
      creatorId: userId,
      actorId: null,
      actorRole: "system",
      action: "push_notification_sent",
      resourceType: "push",
      metadata: { title, tokenCount: tokens.length },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to send push to user", {
      userId,
      error: msg,
    });
  }
}

/**
 * Send a push notification to all active devices for multiple users.
 * Best-effort: errors for individual users do not affect others.
 */
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  for (const userId of userIds) {
    await sendPushToUser(userId, title, body, data);
  }
}
