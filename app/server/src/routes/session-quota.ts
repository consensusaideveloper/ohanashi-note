import { Hono } from "hono";

import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { getSessionQuota } from "../lib/session-quota.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

const sessionQuotaRoute = new Hono();

/** GET /api/session-quota — Check remaining session quota for the day. */
sessionQuotaRoute.get("/api/session-quota", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const quota = await getSessionQuota(userId);
    return c.json(quota);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to check session quota", { error: message });
    return c.json(
      { error: "利用状況の確認に失敗しました", code: "QUOTA_CHECK_FAILED" },
      500,
    );
  }
});

export { sessionQuotaRoute };
