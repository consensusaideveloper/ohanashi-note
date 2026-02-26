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
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function getExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? DEFAULT_EXT;
}

const audioUploadRoute = new Hono();

/** POST /api/conversations/:id/audio — Upload audio directly to server. */
audioUploadRoute.post("/api/conversations/:id/audio", async (c: Context) => {
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

    // Get the uploaded file
    const contentType = c.req.header("content-type");
    const mimeType = contentType ?? "audio/webm";

    // Check content length
    const contentLength = c.req.header("content-length");
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return c.json(
        { error: "ファイルサイズが大きすぎます", code: "FILE_TOO_LARGE" },
        413,
      );
    }

    // Get the audio data
    const audioData = await c.req.arrayBuffer();

    if (audioData.byteLength === 0) {
      return c.json({ error: "音声データが空です", code: "EMPTY_FILE" }, 400);
    }

    const ext = getExtension(mimeType);
    const storageKey = `audio/${userId}/${conversationId}.${ext}`;

    // Upload directly to R2 using the server-side client
    await r2.uploadObject(storageKey, Buffer.from(audioData), mimeType);

    logger.info("Audio uploaded successfully", {
      conversationId,
      storageKey,
      size: audioData.byteLength,
    });

    return c.json({
      success: true,
      storageKey,
      size: audioData.byteLength,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to upload audio", { error: message });
    return c.json(
      {
        error: "音声のアップロードに失敗しました",
        code: "UPLOAD_FAILED",
      },
      500,
    );
  }
});

/** GET /api/conversations/:id/audio-url — Get a signed download URL for audio. */
audioUploadRoute.get("/api/conversations/:id/audio-url", async (c: Context) => {
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

    // Verify the conversation belongs to this user and has audio
    const row = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
      columns: {
        id: true,
        audioAvailable: true,
        audioStorageKey: true,
      },
    });

    if (!row) {
      return c.json({ error: "会話が見つかりません", code: "NOT_FOUND" }, 404);
    }

    if (!row.audioAvailable || row.audioStorageKey === null) {
      return c.json(
        { error: "この会話には録音データがありません", code: "NO_AUDIO" },
        404,
      );
    }

    const downloadUrl = await r2.generateDownloadUrl(row.audioStorageKey);

    return c.json({ downloadUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to generate audio download URL", {
      error: message,
    });
    return c.json(
      {
        error: "録音データの取得に失敗しました",
        code: "DOWNLOAD_URL_FAILED",
      },
      500,
    );
  }
});

export { audioUploadRoute };
