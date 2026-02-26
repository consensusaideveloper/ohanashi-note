import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { r2 } from "../lib/r2.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
};

const DEFAULT_EXT = "webm";

function getExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? DEFAULT_EXT;
}

const audioRoute = new Hono();

/** POST /api/conversations/:id/audio-url — Get a signed upload URL. */
audioRoute.post("/api/conversations/:id/audio-url", async (c: Context) => {
  try {
    if (r2 === null) {
      return c.json(
        {
          error: "音声ストレージが設定されていません",
          code: "R2_NOT_CONFIGURED",
        },
        503,
      );
    }

    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const conversationId = c.req.param("id");

    // Verify the conversation belongs to this user
    const row = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
      columns: { id: true },
    });

    if (!row) {
      return c.json({ error: "会話が見つかりません", code: "NOT_FOUND" }, 404);
    }

    const body = await c.req.json<Record<string, unknown>>();
    const mimeType =
      typeof body["mimeType"] === "string" ? body["mimeType"] : "audio/webm";

    const ext = getExtension(mimeType);
    const storageKey = `audio/${userId}/${conversationId}.${ext}`;

    const uploadUrl = await r2.generateUploadUrl(storageKey, mimeType);

    return c.json({ uploadUrl, storageKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to generate upload URL", { error: message });
    return c.json(
      {
        error: "アップロードURLの生成に失敗しました",
        code: "UPLOAD_URL_FAILED",
      },
      500,
    );
  }
});

/** GET /api/conversations/:id/audio-url — Get a signed download URL. */
audioRoute.get("/api/conversations/:id/audio-url", async (c: Context) => {
  try {
    if (r2 === null) {
      return c.json(
        {
          error: "音声ストレージが設定されていません",
          code: "R2_NOT_CONFIGURED",
        },
        503,
      );
    }

    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const conversationId = c.req.param("id");

    const row = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
      columns: { audioStorageKey: true, audioAvailable: true },
    });

    if (!row) {
      return c.json({ error: "会話が見つかりません", code: "NOT_FOUND" }, 404);
    }

    if (!row.audioAvailable || !row.audioStorageKey) {
      return c.json({ error: "音声データがありません", code: "NO_AUDIO" }, 404);
    }

    const downloadUrl = await r2.generateDownloadUrl(row.audioStorageKey);

    return c.json({ downloadUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to generate download URL", { error: message });
    return c.json(
      {
        error: "ダウンロードURLの生成に失敗しました",
        code: "DOWNLOAD_URL_FAILED",
      },
      500,
    );
  }
});

export { audioRoute };
