import { eq } from "drizzle-orm";

import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { getFirebaseUid } from "./auth.js";

import type { Context, Next } from "hono";

/** Account status value for deactivated (soft-deleted) accounts. */
const DEACTIVATED_STATUS = "deactivated";

/**
 * Paths that deactivated users are allowed to access.
 * These support the reactivation flow and account status checks.
 */
const DEACTIVATED_ALLOWED_PATHS = new Set([
  "/api/account/status",
  "/api/account/reactivate",
  "/api/data-export",
]);

/**
 * Middleware that checks the user's account status.
 * Deactivated users are blocked from all API endpoints except the
 * reactivation and status-check endpoints.
 *
 * Must be applied AFTER authMiddleware.
 */
export async function accountStatusMiddleware(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const path = new URL(c.req.url).pathname;

  // Allow deactivation-related endpoints through
  if (DEACTIVATED_ALLOWED_PATHS.has(path)) {
    await next();
    return;
  }

  let firebaseUid: string;
  try {
    firebaseUid = getFirebaseUid(c);
  } catch {
    // Public endpoints such as share links do not run auth middleware.
    await next();
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.firebaseUid, firebaseUid),
    columns: { accountStatus: true },
  });

  // If user not found, let downstream handlers deal with it
  if (!user) {
    await next();
    return;
  }

  if (user.accountStatus === DEACTIVATED_STATUS) {
    return c.json(
      {
        error:
          "アカウントは退会手続き中です。復元するにはアカウントの復元画面をご利用ください。",
        code: "ACCOUNT_DEACTIVATED",
      },
      403,
    );
  }

  await next();
}
