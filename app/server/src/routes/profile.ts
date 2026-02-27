import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

/** Client-facing profile shape matching the UserProfile type. */
interface ClientProfile {
  id: string;
  name: string;
  characterId: string | null;
  fontSize: string;
  speakingSpeed: string;
  silenceDuration: string;
  confirmationLevel: string;
  updatedAt: number;
}

const profileRoute = new Hono();

/** GET /api/profile — Get the authenticated user's profile. */
profileRoute.get("/api/profile", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const row = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!row) {
      return c.json(
        { error: "プロフィールが見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    const profile: ClientProfile = {
      id: userId,
      name: row.name,
      characterId: row.characterId,
      fontSize: row.fontSize,
      speakingSpeed: row.speakingSpeed,
      silenceDuration: row.silenceDuration,
      confirmationLevel: row.confirmationLevel,
      updatedAt: row.updatedAt.getTime(),
    };

    return c.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get profile", { error: message });
    return c.json(
      { error: "プロフィールの取得に失敗しました", code: "GET_FAILED" },
      500,
    );
  }
});

/** PUT /api/profile — Update the authenticated user's profile. */
profileRoute.put("/api/profile", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const body = await c.req.json<Record<string, unknown>>();
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if ("name" in body && typeof body["name"] === "string") {
      updates["name"] = body["name"];
    }
    if ("characterId" in body) {
      updates["characterId"] =
        typeof body["characterId"] === "string" ? body["characterId"] : null;
    }
    if ("fontSize" in body && typeof body["fontSize"] === "string") {
      updates["fontSize"] = body["fontSize"];
    }
    if ("speakingSpeed" in body && typeof body["speakingSpeed"] === "string") {
      updates["speakingSpeed"] = body["speakingSpeed"];
    }
    if (
      "silenceDuration" in body &&
      typeof body["silenceDuration"] === "string"
    ) {
      updates["silenceDuration"] = body["silenceDuration"];
    }
    if (
      "confirmationLevel" in body &&
      typeof body["confirmationLevel"] === "string"
    ) {
      updates["confirmationLevel"] = body["confirmationLevel"];
    }

    await db.update(users).set(updates).where(eq(users.id, userId));

    // Return the updated profile
    const row = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!row) {
      return c.json(
        { error: "プロフィールが見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    const profile: ClientProfile = {
      id: userId,
      name: row.name,
      characterId: row.characterId,
      fontSize: row.fontSize,
      speakingSpeed: row.speakingSpeed,
      silenceDuration: row.silenceDuration,
      confirmationLevel: row.confirmationLevel,
      updatedAt: row.updatedAt.getTime(),
    };

    return c.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to update profile", { error: message });
    return c.json(
      { error: "プロフィールの更新に失敗しました", code: "UPDATE_FAILED" },
      500,
    );
  }
});

export { profileRoute };
