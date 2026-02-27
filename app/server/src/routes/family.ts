import crypto from "node:crypto";

import { Hono } from "hono";
import { eq, and, count } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  consentRecords,
  familyInvitations,
  familyMembers,
  noteLifecycle,
  users,
} from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";

// --- Constants ---

/** Invitation token validity: 7 days in milliseconds. */
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum number of representatives per creator. */
const MAX_REPRESENTATIVES = 3;

// --- Route ---

const familyRoute = new Hono();

/** GET /api/family — List creator's family members (creator only). */
familyRoute.get("/api/family", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const rows = await db
      .select({
        id: familyMembers.id,
        memberId: familyMembers.memberId,
        name: users.name,
        relationship: familyMembers.relationship,
        relationshipLabel: familyMembers.relationshipLabel,
        role: familyMembers.role,
        isActive: familyMembers.isActive,
        createdAt: familyMembers.createdAt,
      })
      .from(familyMembers)
      .innerJoin(users, eq(users.id, familyMembers.memberId))
      .where(eq(familyMembers.creatorId, userId));

    const result = rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      name: row.name,
      relationship: row.relationship,
      relationshipLabel: row.relationshipLabel,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    }));

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to list family members", { error: message });
    return c.json(
      { error: "家族一覧の取得に失敗しました", code: "LIST_FAILED" },
      500,
    );
  }
});

/** POST /api/family/invite — Create invitation link (creator only). */
familyRoute.post("/api/family/invite", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const body = await c.req.json<Record<string, unknown>>();
    const relationship = body["relationship"];
    const relationshipLabel = body["relationshipLabel"];
    const role = body["role"] ?? "member";

    if (
      typeof relationship !== "string" ||
      typeof relationshipLabel !== "string"
    ) {
      return c.json(
        {
          error: "relationship と relationshipLabel は必須です",
          code: "INVALID_BODY",
        },
        400,
      );
    }

    if (role !== "representative" && role !== "member") {
      return c.json(
        {
          error: "role は representative または member を指定してください",
          code: "INVALID_ROLE",
        },
        400,
      );
    }

    // If assigning representative, check count does not exceed maximum
    if (role === "representative") {
      const [repCount] = await db
        .select({ value: count() })
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.creatorId, userId),
            eq(familyMembers.role, "representative"),
            eq(familyMembers.isActive, true),
          ),
        );

      if (repCount && repCount.value >= MAX_REPRESENTATIVES) {
        return c.json(
          {
            error: `代表者は最大${String(MAX_REPRESENTATIVES)}名まで指定できます`,
            code: "MAX_REPRESENTATIVES_REACHED",
          },
          409,
        );
      }
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

    const [created] = await db
      .insert(familyInvitations)
      .values({
        creatorId: userId,
        token,
        relationship,
        relationshipLabel,
        role,
        expiresAt,
      })
      .returning();

    if (!created) {
      return c.json(
        { error: "招待リンクの作成に失敗しました", code: "CREATE_FAILED" },
        500,
      );
    }

    // Auto-create noteLifecycle record if it doesn't exist
    const existingLifecycle = await db.query.noteLifecycle.findFirst({
      where: eq(noteLifecycle.creatorId, userId),
      columns: { id: true },
    });

    if (!existingLifecycle) {
      await db.insert(noteLifecycle).values({
        creatorId: userId,
        status: "active",
      });
    }

    return c.json(
      {
        id: created.id,
        token: created.token,
        relationship: created.relationship,
        relationshipLabel: created.relationshipLabel,
        role: created.role,
        expiresAt: created.expiresAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to create invitation", { error: message });
    return c.json(
      { error: "招待リンクの作成に失敗しました", code: "CREATE_FAILED" },
      500,
    );
  }
});

/** GET /api/family/invite/:token — Get invitation info (any authenticated user). */
familyRoute.get("/api/family/invite/:token", async (c: Context) => {
  try {
    const token = c.req.param("token");

    const rows = await db
      .select({
        creatorName: users.name,
        relationship: familyInvitations.relationship,
        relationshipLabel: familyInvitations.relationshipLabel,
        role: familyInvitations.role,
        expiresAt: familyInvitations.expiresAt,
        acceptedAt: familyInvitations.acceptedAt,
      })
      .from(familyInvitations)
      .innerJoin(users, eq(users.id, familyInvitations.creatorId))
      .where(eq(familyInvitations.token, token));

    const invitation = rows[0];

    if (!invitation) {
      return c.json({ error: "招待が見つかりません", code: "NOT_FOUND" }, 404);
    }

    if (invitation.acceptedAt) {
      return c.json(
        { error: "この招待はすでに使用されています", code: "ALREADY_ACCEPTED" },
        410,
      );
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      return c.json(
        { error: "招待の有効期限が切れています", code: "EXPIRED" },
        410,
      );
    }

    return c.json({
      creatorName: invitation.creatorName,
      relationship: invitation.relationship,
      relationshipLabel: invitation.relationshipLabel,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get invitation", { error: message });
    return c.json(
      { error: "招待情報の取得に失敗しました", code: "GET_FAILED" },
      500,
    );
  }
});

/** POST /api/family/invite/:token/accept — Accept invitation (any authenticated user). */
familyRoute.post("/api/family/invite/:token/accept", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const token = c.req.param("token");

    // Look up invitation
    const invitation = await db.query.familyInvitations.findFirst({
      where: eq(familyInvitations.token, token),
    });

    if (!invitation) {
      return c.json({ error: "招待が見つかりません", code: "NOT_FOUND" }, 404);
    }

    if (invitation.acceptedAt) {
      return c.json(
        { error: "この招待はすでに使用されています", code: "ALREADY_ACCEPTED" },
        410,
      );
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      return c.json(
        { error: "招待の有効期限が切れています", code: "EXPIRED" },
        410,
      );
    }

    // Prevent self-invitation
    if (invitation.creatorId === userId) {
      return c.json(
        {
          error: "ご自身を家族として登録することはできません",
          code: "SELF_INVITE",
        },
        400,
      );
    }

    // Check for duplicate membership
    const existingMember = await db.query.familyMembers.findFirst({
      where: and(
        eq(familyMembers.creatorId, invitation.creatorId),
        eq(familyMembers.memberId, userId),
      ),
      columns: { id: true },
    });

    if (existingMember) {
      return c.json(
        { error: "すでに家族として登録されています", code: "ALREADY_MEMBER" },
        409,
      );
    }

    // Create family member record
    const [member] = await db
      .insert(familyMembers)
      .values({
        creatorId: invitation.creatorId,
        memberId: userId,
        relationship: invitation.relationship,
        relationshipLabel: invitation.relationshipLabel,
        role: invitation.role,
      })
      .returning();

    if (!member) {
      return c.json(
        { error: "家族の登録に失敗しました", code: "CREATE_FAILED" },
        500,
      );
    }

    // Mark invitation as accepted
    await db
      .update(familyInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(familyInvitations.id, invitation.id));

    return c.json({
      id: member.id,
      creatorId: member.creatorId,
      relationship: member.relationship,
      role: member.role,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to accept invitation", { error: message });
    return c.json(
      { error: "招待の承認に失敗しました", code: "ACCEPT_FAILED" },
      500,
    );
  }
});

/** PATCH /api/family/:id — Update family member (creator only). */
familyRoute.patch("/api/family/:id", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const memberId = c.req.param("id");

    // Verify the caller is the creator of this family member record
    const existing = await db.query.familyMembers.findFirst({
      where: and(
        eq(familyMembers.id, memberId),
        eq(familyMembers.creatorId, userId),
      ),
    });

    if (!existing) {
      return c.json(
        { error: "家族メンバーが見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    const body = await c.req.json<Record<string, unknown>>();
    const updates: Record<string, unknown> = {};

    if ("relationship" in body && typeof body["relationship"] === "string") {
      updates["relationship"] = body["relationship"];
    }
    if (
      "relationshipLabel" in body &&
      typeof body["relationshipLabel"] === "string"
    ) {
      updates["relationshipLabel"] = body["relationshipLabel"];
    }
    if ("role" in body) {
      const newRole = body["role"];
      if (newRole !== "representative" && newRole !== "member") {
        return c.json(
          {
            error: "role は representative または member を指定してください",
            code: "INVALID_ROLE",
          },
          400,
        );
      }

      // If changing to representative, check count does not exceed maximum
      if (newRole === "representative" && existing.role !== "representative") {
        const [repCount] = await db
          .select({ value: count() })
          .from(familyMembers)
          .where(
            and(
              eq(familyMembers.creatorId, userId),
              eq(familyMembers.role, "representative"),
              eq(familyMembers.isActive, true),
            ),
          );

        if (repCount && repCount.value >= MAX_REPRESENTATIVES) {
          return c.json(
            {
              error: `代表者は最大${String(MAX_REPRESENTATIVES)}名まで指定できます`,
              code: "MAX_REPRESENTATIVES_REACHED",
            },
            409,
          );
        }
      }

      updates["role"] = newRole;
    }

    if (Object.keys(updates).length === 0) {
      return c.json(
        { error: "更新するフィールドがありません", code: "NO_UPDATES" },
        400,
      );
    }

    updates["updatedAt"] = new Date();

    const [updated] = await db
      .update(familyMembers)
      .set(updates)
      .where(eq(familyMembers.id, memberId))
      .returning();

    if (!updated) {
      return c.json(
        { error: "家族メンバーの更新に失敗しました", code: "UPDATE_FAILED" },
        500,
      );
    }

    return c.json({
      id: updated.id,
      memberId: updated.memberId,
      relationship: updated.relationship,
      relationshipLabel: updated.relationshipLabel,
      role: updated.role,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to update family member", { error: message });
    return c.json(
      { error: "家族メンバーの更新に失敗しました", code: "UPDATE_FAILED" },
      500,
    );
  }
});

/** DELETE /api/family/:id — Remove family member (creator only). */
familyRoute.delete("/api/family/:id", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const memberId = c.req.param("id");

    // Prevent deletion during consent gathering
    const lifecycle = await db.query.noteLifecycle.findFirst({
      where: eq(noteLifecycle.creatorId, userId),
      columns: { status: true },
    });

    if (lifecycle && lifecycle.status === "consent_gathering") {
      return c.json(
        {
          error:
            "同意収集中は家族メンバーを削除できません。先に同意収集をキャンセルしてください",
          code: "CONSENT_GATHERING_ACTIVE",
        },
        409,
      );
    }

    const result = await db
      .delete(familyMembers)
      .where(
        and(
          eq(familyMembers.id, memberId),
          eq(familyMembers.creatorId, userId),
        ),
      )
      .returning({ id: familyMembers.id });

    if (result.length === 0) {
      return c.json(
        { error: "家族メンバーが見つかりません", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to delete family member", { error: message });
    return c.json(
      { error: "家族メンバーの削除に失敗しました", code: "DELETE_FAILED" },
      500,
    );
  }
});

/** GET /api/family/my-connections — List creators I'm connected to (any authenticated user). */
familyRoute.get("/api/family/my-connections", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    const rows = await db
      .select({
        id: familyMembers.id,
        creatorId: familyMembers.creatorId,
        creatorName: users.name,
        relationship: familyMembers.relationship,
        relationshipLabel: familyMembers.relationshipLabel,
        role: familyMembers.role,
        lifecycleStatus: noteLifecycle.status,
        consentValue: consentRecords.consented,
      })
      .from(familyMembers)
      .innerJoin(users, eq(users.id, familyMembers.creatorId))
      .leftJoin(
        noteLifecycle,
        eq(noteLifecycle.creatorId, familyMembers.creatorId),
      )
      .leftJoin(
        consentRecords,
        and(
          eq(consentRecords.familyMemberId, familyMembers.id),
          eq(consentRecords.lifecycleId, noteLifecycle.id),
        ),
      )
      .where(
        and(
          eq(familyMembers.memberId, userId),
          eq(familyMembers.isActive, true),
        ),
      );

    const result = rows.map((row) => {
      const lifecycleStatus = row.lifecycleStatus ?? "active";
      const hasPendingConsent =
        lifecycleStatus === "consent_gathering" && row.consentValue === null;
      return {
        id: row.id,
        creatorId: row.creatorId,
        creatorName: row.creatorName,
        relationship: row.relationship,
        relationshipLabel: row.relationshipLabel,
        role: row.role,
        lifecycleStatus,
        hasPendingConsent,
      };
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to list my connections", { error: message });
    return c.json(
      { error: "接続先一覧の取得に失敗しました", code: "LIST_FAILED" },
      500,
    );
  }
});

export { familyRoute };
