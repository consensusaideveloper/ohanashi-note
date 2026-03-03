import { Hono } from "hono";
import { eq, and, count } from "drizzle-orm";

import { db } from "../db/connection.js";
import { familyMembers, wellnessSettings } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { getUserRole } from "../middleware/role.js";
import { getCreatorLifecycleStatus } from "../lib/lifecycle-helpers.js";
import { logActivity } from "../lib/activity-logger.js";
import {
  VALID_FREQUENCIES,
  VALID_SHARING_LEVELS,
  FREQUENCY_DAYS,
  getJstDateString,
  getLastConversationDate,
  getRecentCheckins,
  buildActivityTrend,
  calculateStreak,
  daysBetween,
  getWellnessSettingsForCreator,
} from "../lib/wellness-helpers.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

// --- Constants ---

/** Number of days to show in activity trend. */
const ACTIVITY_TREND_DAYS = 14;

/** Default pagination limit for history. */
const DEFAULT_HISTORY_LIMIT = 30;

/** Maximum pagination limit for history. */
const MAX_HISTORY_LIMIT = 100;

function parseNonNegativeInt(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function buildDisabledDashboard(lifecycleNotActive = false): {
  enabled: boolean;
  lastConversationDate: string | null;
  currentStreak: number;
  isInactive: boolean;
  inactiveDays: number;
  frequency: string;
  activityTrend: Array<{
    date: string;
    hadConversation: boolean;
    summary: string | null;
  }>;
  lifecycleNotActive?: boolean;
} {
  return {
    enabled: false,
    lastConversationDate: null,
    currentStreak: 0,
    isInactive: false,
    inactiveDays: 0,
    frequency: "daily",
    activityTrend: [],
    ...(lifecycleNotActive ? { lifecycleNotActive: true } : {}),
  };
}

// --- Route ---

const wellnessRoute = new Hono();

// --- Creator Endpoints ---

/** GET /api/wellness/settings — Creator reads own wellness settings. */
wellnessRoute.get("/api/wellness/settings", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const settings = await getWellnessSettingsForCreator(userId);

    // Check if creator has any active family members
    const [memberCount] = await db
      .select({ value: count() })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.creatorId, userId),
          eq(familyMembers.isActive, true),
        ),
      );

    const hasFamilyMembers = (memberCount?.value ?? 0) > 0;

    if (settings === null) {
      return c.json({
        enabled: false,
        frequency: "daily",
        sharingLevel: "activity_only",
        enabledAt: null,
        hasFamilyMembers,
      });
    }

    return c.json({
      enabled: settings.enabled,
      frequency: settings.frequency,
      sharingLevel: settings.sharingLevel,
      enabledAt: settings.enabledAt?.toISOString() ?? null,
      hasFamilyMembers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get wellness settings", { error: message });
    return c.json(
      {
        error: "見守り設定の取得に失敗しました",
        code: "WELLNESS_SETTINGS_GET_FAILED",
      },
      500,
    );
  }
});

/** PUT /api/wellness/settings — Creator updates own wellness settings. */
wellnessRoute.put("/api/wellness/settings", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const body = await c.req.json<Record<string, unknown>>();
    const enabled = body["enabled"];
    const frequency = body["frequency"];
    const sharingLevel = body["sharingLevel"];

    // Validate inputs
    if (typeof enabled !== "boolean") {
      return c.json(
        { error: "設定の値が正しくありません", code: "INVALID_SETTINGS" },
        400,
      );
    }

    if (typeof frequency !== "string" || !VALID_FREQUENCIES.has(frequency)) {
      return c.json(
        { error: "設定の値が正しくありません", code: "INVALID_SETTINGS" },
        400,
      );
    }

    if (
      typeof sharingLevel !== "string" ||
      !VALID_SHARING_LEVELS.has(sharingLevel)
    ) {
      return c.json(
        { error: "設定の値が正しくありません", code: "INVALID_SETTINGS" },
        400,
      );
    }

    const now = new Date();
    const existing = await db.query.wellnessSettings.findFirst({
      where: eq(wellnessSettings.creatorId, userId),
      columns: { id: true, enabled: true, enabledAt: true },
    });

    if (existing !== undefined) {
      // Update existing settings
      const updateData: Record<string, unknown> = {
        enabled,
        frequency,
        sharingLevel,
        updatedAt: now,
      };

      // Set enabledAt on first enable
      if (enabled && !existing.enabled) {
        updateData["enabledAt"] =
          existing.enabledAt !== null ? existing.enabledAt : now;
      }

      // Clear lastNotifiedAt when disabling
      if (!enabled && existing.enabled) {
        updateData["lastNotifiedAt"] = null;
      }

      await db
        .update(wellnessSettings)
        .set(updateData)
        .where(eq(wellnessSettings.id, existing.id));
    } else {
      // Create new settings row
      await db.insert(wellnessSettings).values({
        creatorId: userId,
        enabled,
        frequency,
        sharingLevel,
        enabledAt: enabled ? now : null,
      });
    }

    // Log activity
    const action = enabled ? "wellness_enabled" : "wellness_disabled";
    void logActivity({
      creatorId: userId,
      actorId: userId,
      actorRole: "creator",
      action,
      resourceType: "wellness",
      metadata: { frequency, sharingLevel },
    });

    // Return updated settings
    const [memberCount] = await db
      .select({ value: count() })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.creatorId, userId),
          eq(familyMembers.isActive, true),
        ),
      );

    const updatedSettings = await getWellnessSettingsForCreator(userId);

    return c.json({
      enabled: updatedSettings?.enabled ?? false,
      frequency: updatedSettings?.frequency ?? "daily",
      sharingLevel: updatedSettings?.sharingLevel ?? "activity_only",
      enabledAt: updatedSettings?.enabledAt?.toISOString() ?? null,
      hasFamilyMembers: (memberCount?.value ?? 0) > 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to update wellness settings", { error: message });
    return c.json(
      {
        error: "見守り設定の保存に失敗しました",
        code: "WELLNESS_SETTINGS_UPDATE_FAILED",
      },
      500,
    );
  }
});

/** GET /api/wellness/preview — Creator previews what family sees. */
wellnessRoute.get("/api/wellness/preview", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const settings = await getWellnessSettingsForCreator(userId);

    if (settings === null || !settings.enabled) {
      return c.json(buildDisabledDashboard());
    }

    const lastConversationDate = await getLastConversationDate(userId);
    const { records } = await getRecentCheckins(userId, ACTIVITY_TREND_DAYS, 0);
    const streak = calculateStreak(records);

    const today = getJstDateString();
    const inactiveDaysRaw =
      lastConversationDate !== null
        ? daysBetween(lastConversationDate, today)
        : 0;
    const inactiveDays = Math.max(0, inactiveDaysRaw);
    const frequencyDays = FREQUENCY_DAYS[settings.frequency] ?? 1;
    const isInactive = inactiveDays >= frequencyDays;

    const activityTrend = await buildActivityTrend(
      userId,
      settings.sharingLevel,
      ACTIVITY_TREND_DAYS,
    );

    return c.json({
      enabled: true,
      lastConversationDate,
      currentStreak: streak,
      isInactive,
      inactiveDays,
      frequency: settings.frequency,
      activityTrend,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get wellness preview", { error: message });
    return c.json(
      {
        error: "見守り情報の取得に失敗しました",
        code: "WELLNESS_PREVIEW_FAILED",
      },
      500,
    );
  }
});

// --- Family Endpoints ---

/** GET /api/wellness/:creatorId/dashboard — Family member reads wellness dashboard. */
wellnessRoute.get("/api/wellness/:creatorId/dashboard", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");

    // Verify caller is a family member
    const role = await getUserRole(userId, creatorId);
    if (role === "none") {
      return c.json(
        {
          error: "この情報にアクセスする権限がありません",
          code: "ACCESS_DENIED",
        },
        403,
      );
    }

    // Check lifecycle status
    const lifecycleStatus = await getCreatorLifecycleStatus(creatorId);
    if (lifecycleStatus !== "active") {
      return c.json(buildDisabledDashboard(true));
    }

    // Check if wellness is enabled
    const settings = await getWellnessSettingsForCreator(creatorId);
    if (settings === null || !settings.enabled) {
      return c.json(buildDisabledDashboard());
    }

    const lastConversationDate = await getLastConversationDate(creatorId);
    const { records } = await getRecentCheckins(
      creatorId,
      ACTIVITY_TREND_DAYS,
      0,
    );
    const streak = calculateStreak(records);

    const today = getJstDateString();
    const inactiveDaysRaw =
      lastConversationDate !== null
        ? daysBetween(lastConversationDate, today)
        : 0;
    const inactiveDays = Math.max(0, inactiveDaysRaw);
    const frequencyDays = FREQUENCY_DAYS[settings.frequency] ?? 1;
    const isInactive = inactiveDays >= frequencyDays;

    const activityTrend = await buildActivityTrend(
      creatorId,
      settings.sharingLevel,
      ACTIVITY_TREND_DAYS,
    );

    return c.json({
      enabled: true,
      lastConversationDate,
      currentStreak: streak,
      isInactive,
      inactiveDays,
      frequency: settings.frequency,
      activityTrend,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get wellness dashboard", {
      error: message,
      creatorId: c.req.param("creatorId"),
    });
    return c.json(
      {
        error: "見守り情報の取得に失敗しました",
        code: "WELLNESS_DASHBOARD_FAILED",
      },
      500,
    );
  }
});

/** GET /api/wellness/:creatorId/history — Family member reads activity history. */
wellnessRoute.get("/api/wellness/:creatorId/history", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");

    // Verify caller is a family member
    const role = await getUserRole(userId, creatorId);
    if (role === "none") {
      return c.json(
        {
          error: "この情報にアクセスする権限がありません",
          code: "ACCESS_DENIED",
        },
        403,
      );
    }

    // Check lifecycle status
    const lifecycleStatus = await getCreatorLifecycleStatus(creatorId);
    if (lifecycleStatus !== "active") {
      return c.json({ records: [], total: 0 });
    }

    // Check if wellness is enabled
    const settings = await getWellnessSettingsForCreator(creatorId);
    if (settings === null || !settings.enabled) {
      return c.json({ records: [], total: 0 });
    }

    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const requestedLimit = parseNonNegativeInt(
      limitParam,
      DEFAULT_HISTORY_LIMIT,
    );
    const limit = Math.min(requestedLimit, MAX_HISTORY_LIMIT);
    const offset = parseNonNegativeInt(offsetParam, 0);

    const { records, total } = await getRecentCheckins(
      creatorId,
      limit,
      offset,
    );

    // Filter summaries based on sharing level
    const filteredRecords = records.map((r) => ({
      date: r.date,
      hadConversation: r.hadConversation,
      summary:
        settings.sharingLevel === "activity_and_summary" ? r.summary : null,
    }));

    return c.json({ records: filteredRecords, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get wellness history", {
      error: message,
      creatorId: c.req.param("creatorId"),
    });
    return c.json(
      {
        error: "見守り記録の取得に失敗しました",
        code: "WELLNESS_HISTORY_FAILED",
      },
      500,
    );
  }
});

export { wellnessRoute };
