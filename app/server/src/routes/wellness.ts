import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db/connection.js";
import {
  activityLog,
  wellnessCheckins,
  wellnessSettings,
} from "../db/schema.js";
import { getCreatorLifecycleStatus } from "../lib/lifecycle-helpers.js";
import {
  runDailyEvaluation,
  runWeeklySummaryDispatch,
} from "../lib/wellness-jobs.js";
import { loadConfig } from "../lib/config.js";
import {
  buildFamilySummary,
  buildOwnerStatus,
  getWellnessSettingsOrNull,
  mergeWellnessSettings,
  toWellnessSettingsResponse,
} from "../lib/wellness.js";
import { logger } from "../lib/logger.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { getUserRole } from "../middleware/role.js";
import { resolveUserId } from "../lib/users.js";

import type { Context } from "hono";

const WELLNESS_RESOURCE_TYPE = "wellness_settings";

export const wellnessRoute = new Hono();

async function logWellnessAction(
  creatorId: string,
  actorId: string,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(activityLog).values({
    creatorId,
    actorId,
    actorRole: creatorId === actorId ? "creator" : "member",
    action,
    resourceType: WELLNESS_RESOURCE_TYPE,
    resourceId: creatorId,
    metadata: metadata ?? null,
  });
}

wellnessRoute.get("/api/wellness/settings", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const settingsRow = await getWellnessSettingsOrNull(userId);

    if (!settingsRow) {
      return c.json(
        { error: "見守り設定が見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(toWellnessSettingsResponse(settingsRow));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get wellness settings", { error: message });
    return c.json(
      { error: "見守り設定の取得に失敗しました", code: "GET_FAILED" },
      500,
    );
  }
});

wellnessRoute.put("/api/wellness/settings", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const lifecycleStatus = await getCreatorLifecycleStatus(userId);

    if (lifecycleStatus !== "active") {
      return c.json(
        {
          error: "現在、この設定は変更できません",
          code: "LIFECYCLE_BLOCKED",
        },
        403,
      );
    }

    const body = await c.req.json<Record<string, unknown>>();
    const current = await getWellnessSettingsOrNull(userId);
    const values = mergeWellnessSettings(current, {
      ...body,
      creatorId: userId,
    });

    if (current) {
      await db
        .update(wellnessSettings)
        .set(values)
        .where(eq(wellnessSettings.creatorId, userId));
    } else {
      await db.insert(wellnessSettings).values(values);
    }

    const saved = await getWellnessSettingsOrNull(userId);
    if (!saved) {
      throw new Error("wellness settings not persisted");
    }

    await logWellnessAction(
      userId,
      userId,
      current ? "wellness_settings_updated" : "wellness_settings_created",
      {
        enabled: saved.enabled,
        shareLevel: saved.shareLevel,
        weeklySummaryDay: saved.weeklySummaryDay,
      },
    );

    return c.json(toWellnessSettingsResponse(saved));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to save wellness settings", { error: message });
    return c.json(
      { error: "見守り設定の保存に失敗しました", code: "SAVE_FAILED" },
      500,
    );
  }
});

wellnessRoute.post("/api/wellness/pause", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const settingsRow = await getWellnessSettingsOrNull(userId);

    if (!settingsRow) {
      return c.json(
        { error: "見守り設定が見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    const body = await c.req.json<Record<string, unknown>>();
    const pausedUntilRaw = body["pausedUntil"];
    if (typeof pausedUntilRaw !== "string" || pausedUntilRaw === "") {
      return c.json(
        { error: "pausedUntil は必須です", code: "INVALID_BODY" },
        400,
      );
    }

    const pausedUntil = new Date(pausedUntilRaw);
    if (Number.isNaN(pausedUntil.getTime())) {
      return c.json(
        { error: "pausedUntil が不正です", code: "INVALID_BODY" },
        400,
      );
    }

    await db
      .update(wellnessSettings)
      .set({ pausedUntil, updatedAt: new Date() })
      .where(eq(wellnessSettings.creatorId, userId));

    await logWellnessAction(userId, userId, "wellness_paused", {
      pausedUntil: pausedUntil.toISOString(),
    });

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to pause wellness", { error: message });
    return c.json(
      { error: "見守りの一時停止に失敗しました", code: "PAUSE_FAILED" },
      500,
    );
  }
});

wellnessRoute.post("/api/wellness/resume", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const settingsRow = await getWellnessSettingsOrNull(userId);

    if (!settingsRow) {
      return c.json(
        { error: "見守り設定が見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    await db
      .update(wellnessSettings)
      .set({ pausedUntil: null, updatedAt: new Date() })
      .where(eq(wellnessSettings.creatorId, userId));

    await logWellnessAction(userId, userId, "wellness_resumed");

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to resume wellness", { error: message });
    return c.json(
      { error: "見守りの再開に失敗しました", code: "RESUME_FAILED" },
      500,
    );
  }
});

wellnessRoute.get("/api/wellness/status", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const settingsRow = await getWellnessSettingsOrNull(userId);

    if (!settingsRow) {
      return c.json(
        { error: "見守り設定が見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json(await buildOwnerStatus(userId, settingsRow));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get wellness status", { error: message });
    return c.json(
      { error: "見守り状況の取得に失敗しました", code: "GET_FAILED" },
      500,
    );
  }
});

wellnessRoute.get("/api/wellness/checkins", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const settingsRow = await getWellnessSettingsOrNull(userId);

    if (!settingsRow) {
      return c.json(
        { error: "見守り設定が見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    const requestedDays = Number.parseInt(c.req.query("days") ?? "30", 10);
    const days =
      Number.isInteger(requestedDays) &&
      requestedDays >= 1 &&
      requestedDays <= 90
        ? requestedDays
        : 30;

    const rows = await db
      .select({
        checkinDate: wellnessCheckins.checkinDate,
        status: wellnessCheckins.status,
        conversationId: wellnessCheckins.conversationId,
        signals: wellnessCheckins.signals,
        summaryForFamily: wellnessCheckins.summaryForFamily,
        createdAt: wellnessCheckins.createdAt,
        updatedAt: wellnessCheckins.updatedAt,
      })
      .from(wellnessCheckins)
      .where(eq(wellnessCheckins.creatorId, userId))
      .orderBy(desc(wellnessCheckins.checkinDate))
      .limit(days);

    return c.json(
      rows.map((row) => ({
        checkinDate: row.checkinDate,
        status: row.status,
        conversationId: row.conversationId,
        signals: row.signals ?? {},
        summaryForFamily: row.summaryForFamily,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get wellness checkins", { error: message });
    return c.json(
      { error: "見守り記録の取得に失敗しました", code: "GET_FAILED" },
      500,
    );
  }
});

wellnessRoute.get(
  "/api/wellness/:creatorId/weekly-summary",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");
      const role = await getUserRole(userId, creatorId);

      if (role === "none") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const settingsRow = await db.query.wellnessSettings.findFirst({
        where: and(
          eq(wellnessSettings.creatorId, creatorId),
          eq(wellnessSettings.enabled, true),
        ),
      });

      if (!settingsRow) {
        return c.json(
          { error: "見守りデータが見つかりません", code: "NOT_FOUND" },
          404,
        );
      }

      const summary = await buildFamilySummary(creatorId, settingsRow);
      if (!summary) {
        return c.json(
          { error: "見守りデータが見つかりません", code: "NOT_FOUND" },
          404,
        );
      }

      return c.json(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get family wellness summary", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        { error: "見守りサマリーの取得に失敗しました", code: "GET_FAILED" },
        500,
      );
    }
  },
);

wellnessRoute.post(
  "/api/wellness/internal/daily-evaluate",
  async (c: Context) => {
    try {
      const config = loadConfig();
      if (config.nodeEnv !== "development") {
        return c.json(
          { error: "この環境では利用できません", code: "NOT_FOUND" },
          404,
        );
      }

      await runDailyEvaluation();
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to run daily wellness evaluation manually", {
        error: message,
      });
      return c.json(
        { error: "手動実行に失敗しました", code: "RUN_FAILED" },
        500,
      );
    }
  },
);

wellnessRoute.post(
  "/api/wellness/internal/weekly-summary",
  async (c: Context) => {
    try {
      const config = loadConfig();
      if (config.nodeEnv !== "development") {
        return c.json(
          { error: "この環境では利用できません", code: "NOT_FOUND" },
          404,
        );
      }

      await runWeeklySummaryDispatch();
      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to run weekly wellness dispatch manually", {
        error: message,
      });
      return c.json(
        { error: "手動実行に失敗しました", code: "RUN_FAILED" },
        500,
      );
    }
  },
);
