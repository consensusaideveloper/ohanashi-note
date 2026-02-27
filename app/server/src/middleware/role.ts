import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import { familyMembers } from "../db/schema.js";
import { getFirebaseUid } from "./auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";

import type { Context, Next } from "hono";

// --- Types ---

type FamilyRole = "creator" | "representative" | "member" | "none";

// --- Helpers ---

/**
 * Resolve the internal userId from the Hono context (Firebase UID -> DB UUID).
 * Stores the resolved userId in context for downstream handlers.
 */
async function resolveAndSetUserId(c: Context): Promise<string> {
  const firebaseUid = getFirebaseUid(c);
  const userId = await resolveUserId(firebaseUid);
  c.set("userId", userId);
  return userId;
}

/**
 * Extract the creatorId from a route parameter.
 * Defaults to "creatorId" if no param name is specified.
 */
function extractCreatorIdParam(c: Context, paramName?: string): string {
  return c.req.param(paramName ?? "creatorId");
}

// --- Public API ---

/**
 * Get a user's role relative to a given creator.
 *
 * - "creator" if userId === creatorId
 * - "representative" if a familyMembers row exists with role = "representative"
 * - "member" if a familyMembers row exists with role = "member"
 * - "none" if no relationship found
 */
export async function getUserRole(
  userId: string,
  creatorId: string,
): Promise<FamilyRole> {
  if (userId === creatorId) {
    return "creator";
  }

  const membership = await db.query.familyMembers.findFirst({
    where: and(
      eq(familyMembers.creatorId, creatorId),
      eq(familyMembers.memberId, userId),
      eq(familyMembers.isActive, true),
    ),
    columns: { role: true },
  });

  if (!membership) {
    return "none";
  }

  if (membership.role === "representative") {
    return "representative";
  }

  return "member";
}

/** Standard 403 response for unauthorized access. */
function forbidden(c: Context): Response {
  return c.json(
    { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
    403,
  );
}

/**
 * Middleware factory: require the caller to be the creator.
 * The creatorId is read from the route param specified by `creatorIdParam`
 * (defaults to "creatorId").
 */
export function requireCreator(
  creatorIdParam?: string,
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next): Promise<Response | void> => {
    try {
      const userId = await resolveAndSetUserId(c);
      const creatorId = extractCreatorIdParam(c, creatorIdParam);

      if (userId !== creatorId) {
        return forbidden(c);
      }

      await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Role check failed (requireCreator)", { error: message });
      return forbidden(c);
    }
  };
}

/**
 * Middleware factory: require the caller to be a family member (or the creator).
 * The creatorId is read from the route param specified by `creatorIdParam`
 * (defaults to "creatorId").
 */
export function requireFamilyMember(
  creatorIdParam?: string,
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next): Promise<Response | void> => {
    try {
      const userId = await resolveAndSetUserId(c);
      const creatorId = extractCreatorIdParam(c, creatorIdParam);
      const role = await getUserRole(userId, creatorId);

      if (role === "none") {
        return forbidden(c);
      }

      await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Role check failed (requireFamilyMember)", {
        error: message,
      });
      return forbidden(c);
    }
  };
}

/**
 * Middleware factory: require the caller to be the representative.
 * The creatorId is read from the route param specified by `creatorIdParam`
 * (defaults to "creatorId").
 */
export function requireRepresentative(
  creatorIdParam?: string,
): (c: Context, next: Next) => Promise<Response | void> {
  return async (c: Context, next: Next): Promise<Response | void> => {
    try {
      const userId = await resolveAndSetUserId(c);
      const creatorId = extractCreatorIdParam(c, creatorIdParam);
      const role = await getUserRole(userId, creatorId);

      if (role !== "representative") {
        return forbidden(c);
      }

      await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Role check failed (requireRepresentative)", {
        error: message,
      });
      return forbidden(c);
    }
  };
}
