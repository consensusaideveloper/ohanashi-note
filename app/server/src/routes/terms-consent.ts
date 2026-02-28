import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";

import { db } from "../db/connection.js";
import { termsConsent } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";
import {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
  needsReconsent,
} from "../lib/legal-versions.js";

import type { Context } from "hono";

const termsConsentRoute = new Hono();

/** GET /api/terms-consent/status — Check whether the user has consented to current terms. */
termsConsentRoute.get("/api/terms-consent/status", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const latest = await db.query.termsConsent.findFirst({
      where: eq(termsConsent.userId, userId),
      orderBy: [desc(termsConsent.consentedAt)],
    });

    if (!latest) {
      return c.json({
        hasConsented: false,
        currentTermsVersion: CURRENT_TERMS_VERSION,
        currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
      });
    }

    const requiresReconsent = needsReconsent(
      latest.termsVersion,
      latest.privacyVersion,
    );

    if (requiresReconsent) {
      return c.json({
        hasConsented: false,
        currentTermsVersion: CURRENT_TERMS_VERSION,
        currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
        needsReconsent: true,
        previousTermsVersion: latest.termsVersion,
        previousPrivacyVersion: latest.privacyVersion,
      });
    }

    return c.json({
      hasConsented: true,
      currentTermsVersion: CURRENT_TERMS_VERSION,
      currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
      consentedAt: latest.consentedAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to check terms consent status", {
      error: message,
    });
    return c.json(
      {
        error: "同意状態の確認に失敗しました",
        code: "CONSENT_STATUS_FAILED",
      },
      500,
    );
  }
});

/** POST /api/terms-consent — Record the user's consent to terms and privacy policy. */
termsConsentRoute.post("/api/terms-consent", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const body = await c.req.json<Record<string, unknown>>();
    const termsVersion =
      typeof body["termsVersion"] === "string" ? body["termsVersion"] : "";
    const privacyVersion =
      typeof body["privacyVersion"] === "string" ? body["privacyVersion"] : "";

    // Validate versions match current active versions
    if (
      termsVersion !== CURRENT_TERMS_VERSION ||
      privacyVersion !== CURRENT_PRIVACY_VERSION
    ) {
      return c.json(
        {
          error:
            "利用規約のバージョンが最新ではありません。画面を更新してください。",
          code: "VERSION_MISMATCH",
        },
        400,
      );
    }

    const forwarded = c.req.header("x-forwarded-for");
    const ipAddress = forwarded
      ? (forwarded.split(",")[0]?.trim() ?? null)
      : (c.req.header("x-real-ip") ?? null);
    const userAgent = c.req.header("user-agent") ?? null;

    const now = new Date();

    await db.insert(termsConsent).values({
      userId,
      termsVersion,
      privacyVersion,
      consentedAt: now,
      ipAddress,
      userAgent,
    });

    return c.json({
      success: true,
      consentedAt: now.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to save terms consent", { error: message });
    return c.json(
      {
        error: "同意の記録に失敗しました。もう一度お試しください。",
        code: "CONSENT_SAVE_FAILED",
      },
      500,
    );
  }
});

export { termsConsentRoute };
