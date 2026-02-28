import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/connection.js";
import { noteLifecycle } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { getUserRole } from "../middleware/role.js";
import { logger } from "../lib/logger.js";
import { logActivity } from "../lib/activity-logger.js";

import type { Context } from "hono";

const activityRoute = new Hono();

/** POST /api/activity/:creatorId/print-event — Log a print/export event. */
activityRoute.post(
  "/api/activity/:creatorId/print-event",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      const role = await getUserRole(userId, creatorId);

      if (
        role !== "creator" &&
        role !== "representative" &&
        role !== "member"
      ) {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      // Verify lifecycle exists
      const lifecycle = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
        columns: { id: true },
      });

      if (!lifecycle) {
        return c.json(
          { error: "ライフサイクルが見つかりません", code: "NOT_FOUND" },
          404,
        );
      }

      const body = await c.req.json<Record<string, unknown>>();
      const resourceType = body["resourceType"];
      const resourceId = body["resourceId"];

      if (
        typeof resourceType !== "string" ||
        (resourceType !== "note" && resourceType !== "conversation")
      ) {
        return c.json(
          {
            error:
              "resourceType は 'note' または 'conversation' である必要があります",
            code: "INVALID_BODY",
          },
          400,
        );
      }

      await logActivity({
        creatorId,
        actorId: userId,
        actorRole: role,
        action: "printed",
        resourceType,
        resourceId: typeof resourceId === "string" ? resourceId : undefined,
      });

      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to log print event", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "印刷イベントの記録に失敗しました",
          code: "PRINT_EVENT_FAILED",
        },
        500,
      );
    }
  },
);

export { activityRoute };
