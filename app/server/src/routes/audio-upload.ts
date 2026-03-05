import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { r2 } from "../lib/r2.js";
import { logger } from "../lib/logger.js";
import { hasPersistableUserUtterance } from "../lib/conversation-persistence.js";

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
const FILE_TOO_LARGE_ERROR = "FILE_TOO_LARGE";

function getExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? DEFAULT_EXT;
}

function normalizeMimeType(
  contentType: string | null | undefined,
): string | null {
  if (contentType == null) {
    return "audio/webm";
  }
  const normalized = contentType.trim().toLowerCase();
  return MIME_TO_EXT[normalized] ? normalized : null;
}

async function readRequestBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<Buffer> {
  if (request.body === null) {
    return Buffer.alloc(0);
  }

  const reader: ReadableStreamDefaultReader<Uint8Array> =
    request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(FILE_TOO_LARGE_ERROR);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
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
      columns: { id: true, transcript: true },
    });

    if (!row) {
      return c.json({ error: "会話が見つかりません", code: "NOT_FOUND" }, 404);
    }

    if (!hasPersistableUserUtterance(row.transcript)) {
      return c.json(
        {
          error: "ユーザー発話がない会話の録音データは保存されません",
          code: "NO_USER_UTTERANCE",
        },
        409,
      );
    }

    // Get the uploaded file
    const contentType = c.req.header("content-type");
    const mimeType = normalizeMimeType(contentType);
    if (mimeType === null) {
      return c.json(
        {
          error: "音声形式がサポートされていません",
          code: "INVALID_CONTENT_TYPE",
        },
        415,
      );
    }

    // Check content length
    const contentLength = c.req.header("content-length");
    if (contentLength) {
      const parsedContentLength = Number.parseInt(contentLength, 10);
      if (
        Number.isNaN(parsedContentLength) ||
        parsedContentLength < 0 ||
        parsedContentLength > MAX_FILE_SIZE
      ) {
        return c.json(
          { error: "ファイルサイズが大きすぎます", code: "FILE_TOO_LARGE" },
          413,
        );
      }
    }

    // Stream the request body with a hard limit instead of buffering blindly.
    const audioData = await readRequestBodyWithLimit(c.req.raw, MAX_FILE_SIZE);

    if (audioData.byteLength > MAX_FILE_SIZE) {
      return c.json(
        { error: "ファイルサイズが大きすぎます", code: "FILE_TOO_LARGE" },
        413,
      );
    }

    if (audioData.byteLength === 0) {
      return c.json({ error: "音声データが空です", code: "EMPTY_FILE" }, 400);
    }

    const ext = getExtension(mimeType);
    const storageKey = `audio/${userId}/${conversationId}.${ext}`;

    // Upload directly to R2 using the server-side client
    await r2.uploadObject(storageKey, audioData, mimeType);

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
    if (error instanceof Error && error.message === FILE_TOO_LARGE_ERROR) {
      return c.json(
        { error: "ファイルサイズが大きすぎます", code: "FILE_TOO_LARGE" },
        413,
      );
    }
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
