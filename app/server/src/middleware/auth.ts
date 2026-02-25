import { verifyIdToken } from "../lib/firebase-admin.js";
import { logger } from "../lib/logger.js";

import type { Context, Next } from "hono";

/** Key used to store the authenticated Firebase UID in the Hono context. */
const AUTH_CONTEXT_KEY = "firebaseUid";

/**
 * Extract the Bearer token from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
function extractBearerToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (!header) return null;

  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) return null;

  return parts[1];
}

/**
 * Hono middleware that verifies a Firebase ID token from the Authorization
 * header and sets the authenticated user's UID in the context.
 *
 * Usage:
 *   app.use("/api/*", authMiddleware);
 *   // In route handler: const uid = getFirebaseUid(c);
 */
export async function authMiddleware(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const token = extractBearerToken(c);

  if (!token) {
    return c.json({ error: "認証が必要です", code: "AUTH_REQUIRED" }, 401);
  }

  try {
    const decoded = await verifyIdToken(token);
    c.set(AUTH_CONTEXT_KEY, decoded.uid);
    await next();
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Token verification failed";
    logger.warn("Auth token verification failed", { error: message });
    return c.json(
      { error: "認証に失敗しました", code: "AUTH_INVALID_TOKEN" },
      401,
    );
  }
}

/**
 * Retrieve the authenticated Firebase UID from the Hono context.
 * Must be called after authMiddleware has run.
 */
export function getFirebaseUid(c: Context): string {
  const uid = c.get(AUTH_CONTEXT_KEY) as string | undefined;
  if (!uid) {
    throw new Error(
      "Firebase UID not found in context. Ensure authMiddleware is applied.",
    );
  }
  return uid;
}
