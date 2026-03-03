import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import { pushSubscriptions, notificationPreferences } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logActivity } from "../lib/activity-logger.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

// --- Route ---

const pushRoute = new Hono();

/** POST /api/push/subscribe — Register or update an FCM token. */
pushRoute.post("/api/push/subscribe", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const body = await c.req.json<Record<string, unknown>>();
    const fcmToken = body["fcmToken"];
    const deviceType = body["deviceType"];

    if (typeof fcmToken !== "string" || fcmToken.length === 0) {
      return c.json(
        { error: "FCMトークンが正しくありません", code: "INVALID_TOKEN" },
        400,
      );
    }

    const deviceTypeValue =
      typeof deviceType === "string" && deviceType.length > 0
        ? deviceType
        : "web";
    const now = new Date();

    // Check if token already exists
    const existing = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.fcmToken, fcmToken),
      columns: { id: true, userId: true },
    });

    if (existing !== undefined) {
      // Token exists — update ownership, activate, and refresh timestamp
      await db
        .update(pushSubscriptions)
        .set({
          userId,
          deviceType: deviceTypeValue,
          isActive: true,
          updatedAt: now,
        })
        .where(eq(pushSubscriptions.id, existing.id));

      void logActivity({
        creatorId: userId,
        actorId: userId,
        actorRole: "creator",
        action: "push_token_updated",
        resourceType: "push_subscription",
        resourceId: existing.id,
      });

      return c.json({ id: existing.id, fcmToken });
    }

    // New token — insert
    const [created] = await db
      .insert(pushSubscriptions)
      .values({
        userId,
        fcmToken,
        deviceType: deviceTypeValue,
      })
      .returning({ id: pushSubscriptions.id });

    if (!created) {
      throw new Error("プッシュ通知の登録に失敗しました");
    }

    void logActivity({
      creatorId: userId,
      actorId: userId,
      actorRole: "creator",
      action: "push_token_registered",
      resourceType: "push_subscription",
      resourceId: created.id,
    });

    return c.json({ id: created.id, fcmToken }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to subscribe push token", { error: message });
    return c.json(
      {
        error: "プッシュ通知の登録に失敗しました",
        code: "PUSH_SUBSCRIBE_FAILED",
      },
      500,
    );
  }
});

/** DELETE /api/push/subscribe — Deactivate an FCM token. */
pushRoute.delete("/api/push/subscribe", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const body = await c.req.json<Record<string, unknown>>();
    const fcmToken = body["fcmToken"];

    if (typeof fcmToken !== "string" || fcmToken.length === 0) {
      return c.json(
        { error: "FCMトークンが正しくありません", code: "INVALID_TOKEN" },
        400,
      );
    }

    await db
      .update(pushSubscriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(pushSubscriptions.fcmToken, fcmToken),
          eq(pushSubscriptions.userId, userId),
        ),
      );

    void logActivity({
      creatorId: userId,
      actorId: userId,
      actorRole: "creator",
      action: "push_token_deactivated",
      resourceType: "push_subscription",
    });

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to unsubscribe push token", { error: message });
    return c.json(
      {
        error: "プッシュ通知の解除に失敗しました",
        code: "PUSH_UNSUBSCRIBE_FAILED",
      },
      500,
    );
  }
});

/** GET /api/push/preferences — Get notification preferences. */
pushRoute.get("/api/push/preferences", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const prefs = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, userId),
    });

    if (prefs === undefined) {
      // No row — return defaults (all enabled)
      return c.json({
        pushEnabled: true,
        pushWellness: true,
        pushMilestones: true,
        pushFamily: true,
      });
    }

    return c.json({
      pushEnabled: prefs.pushEnabled,
      pushWellness: prefs.pushWellness,
      pushMilestones: prefs.pushMilestones,
      pushFamily: prefs.pushFamily,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get notification preferences", {
      error: message,
    });
    return c.json(
      {
        error: "通知設定の取得に失敗しました",
        code: "PREFERENCES_GET_FAILED",
      },
      500,
    );
  }
});

/** PUT /api/push/preferences — Update notification preferences (upsert). */
pushRoute.put("/api/push/preferences", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const body = await c.req.json<Record<string, unknown>>();
    const pushEnabled = body["pushEnabled"];
    const pushWellness = body["pushWellness"];
    const pushMilestones = body["pushMilestones"];
    const pushFamily = body["pushFamily"];

    if (
      typeof pushEnabled !== "boolean" ||
      typeof pushWellness !== "boolean" ||
      typeof pushMilestones !== "boolean" ||
      typeof pushFamily !== "boolean"
    ) {
      return c.json(
        { error: "設定の値が正しくありません", code: "INVALID_PREFERENCES" },
        400,
      );
    }

    const now = new Date();

    const existing = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, userId),
      columns: { id: true },
    });

    if (existing !== undefined) {
      await db
        .update(notificationPreferences)
        .set({
          pushEnabled,
          pushWellness,
          pushMilestones,
          pushFamily,
          updatedAt: now,
        })
        .where(eq(notificationPreferences.id, existing.id));
    } else {
      await db.insert(notificationPreferences).values({
        userId,
        pushEnabled,
        pushWellness,
        pushMilestones,
        pushFamily,
      });
    }

    void logActivity({
      creatorId: userId,
      actorId: userId,
      actorRole: "creator",
      action: "notification_preferences_updated",
      resourceType: "notification_preferences",
      metadata: { pushEnabled, pushWellness, pushMilestones, pushFamily },
    });

    return c.json({ pushEnabled, pushWellness, pushMilestones, pushFamily });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to update notification preferences", {
      error: message,
    });
    return c.json(
      {
        error: "通知設定の保存に失敗しました",
        code: "PREFERENCES_UPDATE_FAILED",
      },
      500,
    );
  }
});

export { pushRoute };
