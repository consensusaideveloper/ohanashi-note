import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";
import {
  normalizeStoredProfile,
  validateProfileUpdateValue,
} from "../lib/profile-validation.js";

import type { Context } from "hono";

/** Client-facing profile shape matching the UserProfile type. */
interface ClientProfile {
  id: string;
  name: string;
  assistantName: string | null;
  characterId: string | null;
  fontSize: string;
  speakingSpeed: string;
  silenceDuration: string;
  confirmationLevel: string;
  onboardingCompletedAt: number | null;
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

    const normalized = normalizeStoredProfile(row);

    const profile: ClientProfile = {
      id: userId,
      name: normalized.name,
      assistantName: normalized.assistantName,
      characterId: normalized.characterId,
      fontSize: normalized.fontSize,
      speakingSpeed: normalized.speakingSpeed,
      silenceDuration: normalized.silenceDuration,
      confirmationLevel: normalized.confirmationLevel,
      onboardingCompletedAt: normalized.onboardingCompletedAt,
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
    const allowedFields = new Set([
      "name",
      "assistantName",
      "characterId",
      "fontSize",
      "speakingSpeed",
      "silenceDuration",
      "confirmationLevel",
    ]);
    for (const field of Object.keys(body)) {
      if (!allowedFields.has(field)) {
        return c.json(
          {
            error: "更新できないプロフィール項目です",
            code: "INVALID_PROFILE_FIELD",
          },
          400,
        );
      }
    }
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    for (const field of [
      "name",
      "assistantName",
      "characterId",
      "fontSize",
      "speakingSpeed",
      "silenceDuration",
      "confirmationLevel",
    ] as const) {
      if (!(field in body)) continue;
      const validation = validateProfileUpdateValue(field, body[field]);
      if ("error" in validation) {
        return c.json(
          { error: validation.error.message, code: validation.error.code },
          400,
        );
      }
      updates[field] = validation.normalized;
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

    const normalized = normalizeStoredProfile(row);

    const profile: ClientProfile = {
      id: userId,
      name: normalized.name,
      assistantName: normalized.assistantName,
      characterId: normalized.characterId,
      fontSize: normalized.fontSize,
      speakingSpeed: normalized.speakingSpeed,
      silenceDuration: normalized.silenceDuration,
      confirmationLevel: normalized.confirmationLevel,
      onboardingCompletedAt: normalized.onboardingCompletedAt,
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
