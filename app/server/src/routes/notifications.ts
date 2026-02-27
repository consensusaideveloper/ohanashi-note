import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";

import { db } from "../db/connection.js";
import { notifications } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

// --- Route ---

const notificationsRoute = new Hono();

/** GET /api/notifications — Get unread notifications for authenticated user. */
notificationsRoute.get("/api/notifications", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
      )
      .orderBy(desc(notifications.createdAt));

    const result = rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      relatedCreatorId: row.relatedCreatorId,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    }));

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get notifications", { error: message });
    return c.json(
      { error: "通知の取得に失敗しました", code: "GET_FAILED" },
      500,
    );
  }
});

/** PATCH /api/notifications/:id/read — Mark a single notification as read. */
notificationsRoute.patch("/api/notifications/:id/read", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const notificationId = c.req.param("id");

    // Update only if the notification belongs to this user
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json({ error: "通知が見つかりません", code: "NOT_FOUND" }, 404);
    }

    return c.json({
      id: updated.id,
      type: updated.type,
      title: updated.title,
      message: updated.message,
      relatedCreatorId: updated.relatedCreatorId,
      isRead: updated.isRead,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to mark notification as read", {
      error: message,
      notificationId: c.req.param("id"),
    });
    return c.json(
      { error: "通知の更新に失敗しました", code: "UPDATE_FAILED" },
      500,
    );
  }
});

/** POST /api/notifications/read-all — Mark all notifications as read. */
notificationsRoute.post("/api/notifications/read-all", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const result = await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
      )
      .returning({ id: notifications.id });

    return c.json({ count: result.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to mark all notifications as read", {
      error: message,
    });
    return c.json(
      {
        error: "通知の一括既読に失敗しました",
        code: "READ_ALL_FAILED",
      },
      500,
    );
  }
});

export { notificationsRoute };
