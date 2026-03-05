import { Readable } from "node:stream";

import { Hono } from "hono";
import { stream } from "hono/streaming";

import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import {
  countDataExportConversations,
  generateDataExportZip,
  formatDate,
} from "../lib/data-export.js";
import { tryStartDataExport } from "../lib/data-export-guard.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

const dataExportRoute = new Hono();
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value: string): Date | null {
  if (!DATE_PARAM_RE.test(value)) return null;
  const [yStr, mStr, dStr] = value.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return null;
  }
  return parsed;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** GET /api/data-export — Stream a ZIP archive of all user data. */
dataExportRoute.get("/api/data-export", async (c: Context) => {
  let releaseExportLease: (() => void) | null = null;
  try {
    const includeAudio = c.req.query("includeAudio") === "true";
    const fromDateRaw = c.req.query("fromDate");
    const toDateRaw = c.req.query("toDate");

    let startedAtFrom: Date | undefined;
    let startedAtToExclusive: Date | undefined;

    if (typeof fromDateRaw === "string") {
      const parsed = parseDateOnly(fromDateRaw);
      if (parsed === null) {
        return c.json(
          {
            error: "対象期間の開始日が不正です。",
            code: "EXPORT_INVALID_DATE_RANGE",
          },
          400,
        );
      }
      startedAtFrom = parsed;
    }

    if (typeof toDateRaw === "string") {
      const parsed = parseDateOnly(toDateRaw);
      if (parsed === null) {
        return c.json(
          {
            error: "対象期間の終了日が不正です。",
            code: "EXPORT_INVALID_DATE_RANGE",
          },
          400,
        );
      }
      startedAtToExclusive = addUtcDays(parsed, 1);
    }

    if (
      startedAtFrom !== undefined &&
      startedAtToExclusive !== undefined &&
      startedAtFrom >= startedAtToExclusive
    ) {
      return c.json(
        {
          error: "対象期間の指定が不正です。",
          code: "EXPORT_INVALID_DATE_RANGE",
        },
        400,
      );
    }

    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const conversationCount = await countDataExportConversations(userId, {
      startedAtFrom,
      startedAtToExclusive,
    });

    const startResult = tryStartDataExport({
      userId,
      includeAudio,
      conversationCount,
    });
    if (!startResult.allowed) {
      if (startResult.retryAfterSeconds !== undefined) {
        c.header("Retry-After", String(startResult.retryAfterSeconds));
      }
      return c.json(
        {
          error: startResult.error,
          code: startResult.code,
        },
        startResult.status,
      );
    }
    releaseExportLease = startResult.lease.release;

    const dateStr = formatDate(new Date());
    const filename = `エンディングノート_${dateStr}.zip`;
    const encodedFilename = encodeURIComponent(filename);

    c.header("Content-Type", "application/zip");
    c.header(
      "Content-Disposition",
      `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
    );

    const archive = await generateDataExportZip(userId, {
      includeAudio,
      startedAtFrom,
      startedAtToExclusive,
    });
    const webStream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;

    return stream(c, async (s) => {
      try {
        await s.pipe(webStream);
      } finally {
        releaseExportLease?.();
        releaseExportLease = null;
      }
    });
  } catch (error) {
    releaseExportLease?.();
    releaseExportLease = null;
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
