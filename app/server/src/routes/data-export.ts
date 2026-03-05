import { Readable } from "node:stream";

import { Hono } from "hono";
import { stream } from "hono/streaming";

import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { generateDataExportZip, formatDate } from "../lib/data-export.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

const dataExportRoute = new Hono();

/** GET /api/data-export — Stream a ZIP archive of all user data. */
dataExportRoute.get("/api/data-export", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const dateStr = formatDate(new Date());
    const filename = `エンディングノート_${dateStr}.zip`;
    const encodedFilename = encodeURIComponent(filename);

    c.header("Content-Type", "application/zip");
    c.header(
      "Content-Disposition",
      `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
    );

    const archive = await generateDataExportZip(userId);
    const webStream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;

    return stream(c, async (s) => {
      await s.pipe(webStream);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to generate data export", { error: message });
    return c.json(
      {
        error: "データのエクスポートに失敗しました。もう一度お試しください。",
        code: "EXPORT_FAILED",
      },
      500,
    );
  }
});

export { dataExportRoute };
