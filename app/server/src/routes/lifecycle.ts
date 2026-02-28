import { Hono } from "hono";
import { eq, and } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  noteLifecycle,
  familyMembers,
  consentRecords,
  deletionConsentRecords,
  users,
  conversations,
} from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { getUserRole } from "../middleware/role.js";
import { logger } from "../lib/logger.js";
import {
  getCreatorName,
  getActiveFamilyMembers,
  hasActiveRepresentative,
  notifyFamilyMembers,
  logLifecycleAction,
} from "../lib/lifecycle-helpers.js";
import { deleteUserAudioFiles } from "../lib/r2-cleanup.js";

import type { Context } from "hono";

// --- Route ---

const lifecycleRoute = new Hono();

/** GET /api/lifecycle/:creatorId — Get lifecycle state (family member or creator). */
lifecycleRoute.get("/api/lifecycle/:creatorId", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");

    // Check caller is the creator or a registered family member
    const role = await getUserRole(userId, creatorId);

    if (role === "none") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const record = await db.query.noteLifecycle.findFirst({
      where: eq(noteLifecycle.creatorId, creatorId),
    });

    const hasRep = await hasActiveRepresentative(creatorId);

    // If no record exists, return implicit default
    if (!record) {
      return c.json({ status: "active", hasRepresentative: hasRep });
    }

    return c.json({
      id: record.id,
      status: record.status,
      deathReportedAt: record.deathReportedAt
        ? record.deathReportedAt.toISOString()
        : null,
      openedAt: record.openedAt ? record.openedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      hasRepresentative: hasRep,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get lifecycle state", { error: message });
    return c.json(
      { error: "ライフサイクル情報の取得に失敗しました", code: "GET_FAILED" },
      500,
    );
  }
});

/** POST /api/lifecycle/:creatorId/report-death — Report death of a creator. */
lifecycleRoute.post(
  "/api/lifecycle/:creatorId/report-death",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      // Auth: any registered family member (representative or member)
      const role = await getUserRole(userId, creatorId);

      if (role !== "representative" && role !== "member") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      // Check lifecycle status is "active" (or no record = implicit active)
      const existing = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
      });

      if (existing && existing.status !== "active") {
        // If already death_reported, return existing state (idempotent)
        if (existing.status === "death_reported") {
          return c.json({
            id: existing.id,
            status: existing.status,
            deathReportedAt: existing.deathReportedAt
              ? existing.deathReportedAt.toISOString()
              : null,
            deathReportedBy: existing.deathReportedBy,
            openedAt: existing.openedAt
              ? existing.openedAt.toISOString()
              : null,
            createdAt: existing.createdAt.toISOString(),
            alreadyReported: true,
          });
        }
        return c.json(
          {
            error: "現在のステータスではこの操作を行えません",
            code: "INVALID_STATUS",
          },
          409,
        );
      }

      const now = new Date();
      let record;

      if (existing) {
        // Update existing record
        const [updated] = await db
          .update(noteLifecycle)
          .set({
            status: "death_reported",
            deathReportedAt: now,
            deathReportedBy: userId,
            updatedAt: now,
          })
          .where(eq(noteLifecycle.id, existing.id))
          .returning();
        record = updated;
      } else {
        // Create new record
        const [created] = await db
          .insert(noteLifecycle)
          .values({
            creatorId,
            status: "death_reported",
            deathReportedAt: now,
            deathReportedBy: userId,
          })
          .returning();
        record = created;
      }

      if (!record) {
        return c.json(
          {
            error: "ライフサイクルの更新に失敗しました",
            code: "UPDATE_FAILED",
          },
          500,
        );
      }

      // Log action
      await logLifecycleAction(record.id, "death_reported", userId);

      // Create notifications for ALL family members
      const creatorName = await getCreatorName(creatorId);
      const members = await getActiveFamilyMembers(creatorId);
      const memberUserIds = members.map((m) => m.memberId);

      await notifyFamilyMembers(
        memberUserIds,
        "death_reported",
        "逝去のご報告",
        `${creatorName}さんの逝去が報告されました`,
        creatorId,
      );

      return c.json({
        id: record.id,
        status: record.status,
        deathReportedAt: record.deathReportedAt
          ? record.deathReportedAt.toISOString()
          : null,
        deathReportedBy: record.deathReportedBy,
        openedAt: record.openedAt ? record.openedAt.toISOString() : null,
        createdAt: record.createdAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to report death", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        { error: "逝去報告の登録に失敗しました", code: "REPORT_FAILED" },
        500,
      );
    }
  },
);

/** POST /api/lifecycle/:creatorId/cancel-death-report — Cancel a death report (representative only). */
lifecycleRoute.post(
  "/api/lifecycle/:creatorId/cancel-death-report",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      // Auth: representative required, fallback to member when no representative exists
      const role = await getUserRole(userId, creatorId);

      if (role !== "representative") {
        if (role !== "member") {
          return c.json(
            { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
            403,
          );
        }
        const hasRep = await hasActiveRepresentative(creatorId);
        if (hasRep) {
          return c.json(
            { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
            403,
          );
        }
        logger.info(
          "Member performing representative action (no representative exists)",
          { userId, creatorId, action: "cancel-death-report" },
        );
      }

      // Check lifecycle status is "death_reported"
      const existing = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
      });

      if (!existing || existing.status !== "death_reported") {
        return c.json(
          {
            error: "現在のステータスではこの操作を行えません",
            code: "INVALID_STATUS",
          },
          409,
        );
      }

      // Delete any consent_records for this lifecycle
      await db
        .delete(consentRecords)
        .where(eq(consentRecords.lifecycleId, existing.id));

      // Reset status to "active"
      const now = new Date();
      const [updated] = await db
        .update(noteLifecycle)
        .set({
          status: "active",
          deathReportedAt: null,
          deathReportedBy: null,
          updatedAt: now,
        })
        .where(eq(noteLifecycle.id, existing.id))
        .returning();

      if (!updated) {
        return c.json(
          {
            error: "ライフサイクルの更新に失敗しました",
            code: "UPDATE_FAILED",
          },
          500,
        );
      }

      // Log action
      await logLifecycleAction(existing.id, "death_report_cancelled", userId);

      // Create notifications for all family members
      const creatorName = await getCreatorName(creatorId);
      const members = await getActiveFamilyMembers(creatorId);
      const memberUserIds = members.map((m) => m.memberId);

      await notifyFamilyMembers(
        memberUserIds,
        "death_report_cancelled",
        "逝去報告の取り消し",
        `${creatorName}さんの逝去報告が取り消されました`,
        creatorId,
      );

      return c.json({
        id: updated.id,
        status: updated.status,
        deathReportedAt: null,
        deathReportedBy: null,
        openedAt: updated.openedAt ? updated.openedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to cancel death report", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "逝去報告の取り消しに失敗しました",
          code: "CANCEL_FAILED",
        },
        500,
      );
    }
  },
);

/** POST /api/lifecycle/:creatorId/initiate-consent — Start consent gathering (representative only). */
lifecycleRoute.post(
  "/api/lifecycle/:creatorId/initiate-consent",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      // Auth: representative required, fallback to member when no representative exists
      const role = await getUserRole(userId, creatorId);

      if (role !== "representative") {
        if (role !== "member") {
          return c.json(
            { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
            403,
          );
        }
        const hasRep = await hasActiveRepresentative(creatorId);
        if (hasRep) {
          return c.json(
            { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
            403,
          );
        }
        logger.info(
          "Member performing representative action (no representative exists)",
          { userId, creatorId, action: "initiate-consent" },
        );
      }

      // Check lifecycle status is "death_reported"
      const existing = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
      });

      if (!existing || existing.status !== "death_reported") {
        // Differentiated error for consent already started
        if (existing && existing.status === "consent_gathering") {
          return c.json(
            {
              error: "すでに同意の収集が開始されています",
              code: "CONSENT_ALREADY_INITIATED",
            },
            409,
          );
        }
        return c.json(
          {
            error: "現在のステータスではこの操作を行えません",
            code: "INVALID_STATUS",
          },
          409,
        );
      }

      // Check for active family members before transitioning status
      const members = await getActiveFamilyMembers(creatorId);

      if (members.length === 0) {
        return c.json(
          {
            error:
              "家族メンバーが登録されていないため、同意収集を開始できません",
            code: "NO_FAMILY_MEMBERS",
          },
          403,
        );
      }

      // Update status to "consent_gathering" with initiator tracking
      const now = new Date();
      const [updated] = await db
        .update(noteLifecycle)
        .set({
          status: "consent_gathering",
          consentInitiatedBy: userId,
          updatedAt: now,
        })
        .where(eq(noteLifecycle.id, existing.id))
        .returning();

      if (!updated) {
        return c.json(
          {
            error: "ライフサイクルの更新に失敗しました",
            code: "UPDATE_FAILED",
          },
          500,
        );
      }

      // Create consent_records for all active family members
      const consentValues = members.map((m) => ({
        lifecycleId: existing.id,
        familyMemberId: m.familyMemberId,
        consented: null as boolean | null,
      }));

      await db.insert(consentRecords).values(consentValues);

      // Log action
      await logLifecycleAction(existing.id, "consent_initiated", userId, {
        memberCount: members.length,
      });

      // Create notifications
      const creatorName = await getCreatorName(creatorId);
      const memberUserIds = members.map((m) => m.memberId);

      await notifyFamilyMembers(
        memberUserIds,
        "consent_requested",
        "ノート開封への同意のお願い",
        `${creatorName}さんのノート開封について同意をお願いします`,
        creatorId,
      );

      return c.json({
        id: updated.id,
        status: updated.status,
        deathReportedAt: updated.deathReportedAt
          ? updated.deathReportedAt.toISOString()
          : null,
        openedAt: updated.openedAt ? updated.openedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        consentRecordsCount: members.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to initiate consent", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "同意収集の開始に失敗しました",
          code: "INITIATE_CONSENT_FAILED",
        },
        500,
      );
    }
  },
);

/** POST /api/lifecycle/:creatorId/consent — Submit consent decision (any family member). */
lifecycleRoute.post("/api/lifecycle/:creatorId/consent", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");

    // Auth: any family member
    const role = await getUserRole(userId, creatorId);

    if (role !== "representative" && role !== "member") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    // Check lifecycle status is "consent_gathering"
    const lifecycle = await db.query.noteLifecycle.findFirst({
      where: eq(noteLifecycle.creatorId, creatorId),
    });

    if (!lifecycle || lifecycle.status !== "consent_gathering") {
      return c.json(
        {
          error: "現在のステータスではこの操作を行えません",
          code: "INVALID_STATUS",
        },
        409,
      );
    }

    // Parse request body
    const body = await c.req.json<Record<string, unknown>>();
    const consented = body["consented"];

    if (typeof consented !== "boolean") {
      return c.json(
        {
          error: "consented は true または false を指定してください",
          code: "INVALID_BODY",
        },
        400,
      );
    }

    // Find the caller's family member record
    const membership = await db.query.familyMembers.findFirst({
      where: and(
        eq(familyMembers.creatorId, creatorId),
        eq(familyMembers.memberId, userId),
        eq(familyMembers.isActive, true),
      ),
      columns: { id: true },
    });

    if (!membership) {
      return c.json(
        { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
        404,
      );
    }

    // Use a transaction to atomically update consent + check for auto-open
    const now = new Date();
    const txResult = await db.transaction(async (tx) => {
      // Update the caller's consent_record
      const [updatedConsent] = await tx
        .update(consentRecords)
        .set({
          consented,
          consentedAt: now,
        })
        .where(
          and(
            eq(consentRecords.lifecycleId, lifecycle.id),
            eq(consentRecords.familyMemberId, membership.id),
          ),
        )
        .returning();

      if (!updatedConsent) {
        return { type: "not_found" as const };
      }

      // Check if ALL active family members have consented=true
      const allRecords = await tx
        .select({
          consented: consentRecords.consented,
        })
        .from(consentRecords)
        .where(eq(consentRecords.lifecycleId, lifecycle.id));

      const allConsented =
        allRecords.length > 0 && allRecords.every((r) => r.consented === true);

      let autoOpened = false;

      if (allConsented) {
        // Auto-transition to "opened" with status guard to prevent double transition
        const [openedRecord] = await tx
          .update(noteLifecycle)
          .set({
            status: "opened",
            openedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(noteLifecycle.id, lifecycle.id),
              eq(noteLifecycle.status, "consent_gathering"),
            ),
          )
          .returning();

        autoOpened = !!openedRecord;
      }

      return {
        type: "success" as const,
        updatedConsent,
        autoOpened,
      };
    });

    if (txResult.type === "not_found") {
      return c.json(
        {
          error: "同意記録が見つかりません",
          code: "CONSENT_RECORD_NOT_FOUND",
        },
        404,
      );
    }

    // Log consent action
    await logLifecycleAction(lifecycle.id, "consent_submitted", userId, {
      consented,
    });

    // Send notifications outside the transaction (non-critical)
    if (txResult.autoOpened) {
      await logLifecycleAction(lifecycle.id, "note_opened", userId);

      const creatorName = await getCreatorName(creatorId);
      const members = await getActiveFamilyMembers(creatorId);
      const memberUserIds = members.map((m) => m.memberId);

      await notifyFamilyMembers(
        memberUserIds,
        "note_opened",
        "ノートが開封されました",
        `${creatorName}さんのノートが開封されました`,
        creatorId,
      );
    }

    return c.json({
      consented: txResult.updatedConsent.consented,
      consentedAt: txResult.updatedConsent.consentedAt
        ? txResult.updatedConsent.consentedAt.toISOString()
        : null,
      autoOpened: txResult.autoOpened,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to submit consent", {
      error: message,
      creatorId: c.req.param("creatorId"),
    });
    return c.json(
      { error: "同意の登録に失敗しました", code: "CONSENT_FAILED" },
      500,
    );
  }
});

/** GET /api/lifecycle/:creatorId/consent-status — Get consent status. */
lifecycleRoute.get(
  "/api/lifecycle/:creatorId/consent-status",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      // Auth: any family member
      const role = await getUserRole(userId, creatorId);

      if (role !== "representative" && role !== "member") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      // Get lifecycle
      const lifecycle = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
      });

      if (!lifecycle) {
        return c.json({
          status: "active",
          consentRecords: [],
          totalCount: 0,
          consentedCount: 0,
          pendingCount: 0,
        });
      }

      // Find the caller's family member record
      const membership = await db.query.familyMembers.findFirst({
        where: and(
          eq(familyMembers.creatorId, creatorId),
          eq(familyMembers.memberId, userId),
          eq(familyMembers.isActive, true),
        ),
        columns: { id: true },
      });

      if (!membership) {
        return c.json(
          { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
          404,
        );
      }

      // Representatives see all records; members also see all when no representative exists
      const showAllRecords =
        role === "representative" ||
        !(await hasActiveRepresentative(creatorId));

      if (showAllRecords) {
        // Return ALL consent records with member names
        const records = await db
          .select({
            id: consentRecords.id,
            familyMemberId: consentRecords.familyMemberId,
            memberName: users.name,
            consented: consentRecords.consented,
            consentedAt: consentRecords.consentedAt,
            createdAt: consentRecords.createdAt,
          })
          .from(consentRecords)
          .innerJoin(
            familyMembers,
            eq(familyMembers.id, consentRecords.familyMemberId),
          )
          .innerJoin(users, eq(users.id, familyMembers.memberId))
          .where(eq(consentRecords.lifecycleId, lifecycle.id));

        const formatted = records.map((r) => ({
          id: r.id,
          familyMemberId: r.familyMemberId,
          memberName: r.memberName,
          consented: r.consented,
          consentedAt: r.consentedAt ? r.consentedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        }));

        const consentedCount = records.filter(
          (r) => r.consented === true,
        ).length;
        const pendingCount = records.filter((r) => r.consented === null).length;

        return c.json({
          status: lifecycle.status,
          consentRecords: formatted,
          totalCount: records.length,
          consentedCount,
          pendingCount,
        });
      }

      // Role is "member": return only own consent record
      const ownRecord = await db
        .select({
          id: consentRecords.id,
          familyMemberId: consentRecords.familyMemberId,
          consented: consentRecords.consented,
          consentedAt: consentRecords.consentedAt,
          createdAt: consentRecords.createdAt,
        })
        .from(consentRecords)
        .where(
          and(
            eq(consentRecords.lifecycleId, lifecycle.id),
            eq(consentRecords.familyMemberId, membership.id),
          ),
        );

      const own = ownRecord[0];

      const formatted = own
        ? [
            {
              id: own.id,
              familyMemberId: own.familyMemberId,
              consented: own.consented,
              consentedAt: own.consentedAt
                ? own.consentedAt.toISOString()
                : null,
              createdAt: own.createdAt.toISOString(),
            },
          ]
        : [];

      return c.json({
        status: lifecycle.status,
        consentRecords: formatted,
        totalCount: formatted.length,
        consentedCount: formatted.filter((r) => r.consented === true).length,
        pendingCount: formatted.filter((r) => r.consented === null).length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get consent status", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "同意状況の取得に失敗しました",
          code: "CONSENT_STATUS_FAILED",
        },
        500,
      );
    }
  },
);

/** POST /api/lifecycle/:creatorId/reset-consent — Reset consent gathering (representative only). */
lifecycleRoute.post(
  "/api/lifecycle/:creatorId/reset-consent",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      // Auth: representative required, fallback to member when no representative exists
      const role = await getUserRole(userId, creatorId);

      if (role !== "representative") {
        if (role !== "member") {
          return c.json(
            { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
            403,
          );
        }
        const hasRep = await hasActiveRepresentative(creatorId);
        if (hasRep) {
          return c.json(
            { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
            403,
          );
        }
        logger.info(
          "Member performing representative action (no representative exists)",
          { userId, creatorId, action: "reset-consent" },
        );
      }

      // Check lifecycle status is "consent_gathering"
      const existing = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
      });

      if (!existing || existing.status !== "consent_gathering") {
        return c.json(
          {
            error: "現在のステータスではこの操作を行えません",
            code: "INVALID_STATUS",
          },
          409,
        );
      }

      // Delete all consent records and reset status to "death_reported"
      const now = new Date();

      await db
        .delete(consentRecords)
        .where(eq(consentRecords.lifecycleId, existing.id));

      const [updated] = await db
        .update(noteLifecycle)
        .set({
          status: "death_reported",
          updatedAt: now,
        })
        .where(eq(noteLifecycle.id, existing.id))
        .returning();

      if (!updated) {
        return c.json(
          {
            error: "ライフサイクルの更新に失敗しました",
            code: "UPDATE_FAILED",
          },
          500,
        );
      }

      // Log action
      await logLifecycleAction(existing.id, "consent_reset", userId);

      // Notify all family members
      const creatorName = await getCreatorName(creatorId);
      const members = await getActiveFamilyMembers(creatorId);
      const memberUserIds = members.map((m) => m.memberId);

      await notifyFamilyMembers(
        memberUserIds,
        "consent_reset",
        "同意の収集がリセットされました",
        `${creatorName}さんのノート開封の同意収集がリセットされました。改めてご案内いたします`,
        creatorId,
      );

      return c.json({
        id: updated.id,
        status: updated.status,
        deathReportedAt: updated.deathReportedAt
          ? updated.deathReportedAt.toISOString()
          : null,
        openedAt: updated.openedAt ? updated.openedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to reset consent", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "同意のリセットに失敗しました",
          code: "RESET_CONSENT_FAILED",
        },
        500,
      );
    }
  },
);

// =============================================================================
// Data Deletion Consent Flow (post-opening, unanimous consent required)
// =============================================================================

/** POST /api/lifecycle/:creatorId/initiate-data-deletion — Start data deletion consent (representative only). */
lifecycleRoute.post(
  "/api/lifecycle/:creatorId/initiate-data-deletion",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      // Auth: representative only
      const role = await getUserRole(userId, creatorId);
      if (role !== "representative") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      // Check lifecycle status is "opened" and no deletion already in progress
      const lifecycle = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
      });

      if (!lifecycle || lifecycle.status !== "opened") {
        return c.json(
          {
            error: "ノートが開封されていないため、この操作を行えません",
            code: "INVALID_STATUS",
          },
          409,
        );
      }

      if (lifecycle.deletionStatus === "deletion_consent_gathering") {
        return c.json(
          {
            error: "データ削除の同意収集はすでに開始されています",
            code: "ALREADY_IN_PROGRESS",
          },
          409,
        );
      }

      // Get all active family members
      const members = await getActiveFamilyMembers(creatorId);
      if (members.length === 0) {
        return c.json(
          {
            error: "家族メンバーが登録されていません",
            code: "NO_FAMILY_MEMBERS",
          },
          400,
        );
      }

      // Create deletion consent records and update status in a transaction
      await db.transaction(async (tx) => {
        await tx
          .update(noteLifecycle)
          .set({
            deletionStatus: "deletion_consent_gathering",
            updatedAt: new Date(),
          })
          .where(eq(noteLifecycle.id, lifecycle.id));

        const consentValues = members.map((m) => ({
          lifecycleId: lifecycle.id,
          familyMemberId: m.familyMemberId,
        }));

        await tx.insert(deletionConsentRecords).values(consentValues);
      });

      // Log and notify
      await logLifecycleAction(
        lifecycle.id,
        "data_deletion_initiated",
        userId,
        { memberCount: members.length },
      );

      const creatorName = await getCreatorName(creatorId);
      const memberUserIds = members.map((m) => m.memberId);
      await notifyFamilyMembers(
        memberUserIds,
        "deletion_consent_requested",
        "データ削除への同意のお願い",
        `${creatorName}さんのノートデータの削除について、同意のお願いが届いています`,
        creatorId,
      );

      return c.json({
        success: true,
        deletionStatus: "deletion_consent_gathering",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to initiate data deletion", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "データ削除の開始に失敗しました",
          code: "INITIATE_DELETION_FAILED",
        },
        500,
      );
    }
  },
);

/** POST /api/lifecycle/:creatorId/deletion-consent — Submit deletion consent decision (any family member). */
lifecycleRoute.post(
  "/api/lifecycle/:creatorId/deletion-consent",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      // Auth: any family member
      const role = await getUserRole(userId, creatorId);
      if (role !== "representative" && role !== "member") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      // Check lifecycle and deletion status
      const lifecycle = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
      });

      if (
        !lifecycle ||
        lifecycle.status !== "opened" ||
        lifecycle.deletionStatus !== "deletion_consent_gathering"
      ) {
        return c.json(
          {
            error: "現在のステータスではこの操作を行えません",
            code: "INVALID_STATUS",
          },
          409,
        );
      }

      // Parse request body
      const body = await c.req.json<Record<string, unknown>>();
      const consented = body["consented"];

      if (typeof consented !== "boolean") {
        return c.json(
          {
            error: "consented は true または false を指定してください",
            code: "INVALID_BODY",
          },
          400,
        );
      }

      // Find the caller's family member record
      const membership = await db.query.familyMembers.findFirst({
        where: and(
          eq(familyMembers.creatorId, creatorId),
          eq(familyMembers.memberId, userId),
          eq(familyMembers.isActive, true),
        ),
        columns: { id: true },
      });

      if (!membership) {
        return c.json(
          { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
          404,
        );
      }

      const now = new Date();

      // If consented = false, reset the deletion process
      if (!consented) {
        await db
          .update(deletionConsentRecords)
          .set({ consented: false, consentedAt: now })
          .where(
            and(
              eq(deletionConsentRecords.lifecycleId, lifecycle.id),
              eq(deletionConsentRecords.familyMemberId, membership.id),
            ),
          );

        // Reset deletion status since someone declined
        await db
          .update(noteLifecycle)
          .set({ deletionStatus: null, updatedAt: now })
          .where(eq(noteLifecycle.id, lifecycle.id));

        // Clean up all deletion consent records
        await db
          .delete(deletionConsentRecords)
          .where(eq(deletionConsentRecords.lifecycleId, lifecycle.id));

        await logLifecycleAction(
          lifecycle.id,
          "deletion_consent_declined",
          userId,
        );

        // Notify all family members
        const creatorName = await getCreatorName(creatorId);
        const members = await getActiveFamilyMembers(creatorId);
        const memberUserIds = members.map((m) => m.memberId);
        await notifyFamilyMembers(
          memberUserIds,
          "deletion_consent_declined",
          "データ削除が中止されました",
          `${creatorName}さんのデータ削除は、家族メンバーの判断により中止されました`,
          creatorId,
        );

        return c.json({ consented: false, deletionExecuted: false });
      }

      // Consent = true: update and check for unanimous consent
      const txResult = await db.transaction(async (tx) => {
        const [updatedConsent] = await tx
          .update(deletionConsentRecords)
          .set({ consented: true, consentedAt: now })
          .where(
            and(
              eq(deletionConsentRecords.lifecycleId, lifecycle.id),
              eq(deletionConsentRecords.familyMemberId, membership.id),
            ),
          )
          .returning();

        if (!updatedConsent) {
          return { type: "not_found" as const };
        }

        // Check if ALL records have consented=true
        const allRecords = await tx
          .select({ consented: deletionConsentRecords.consented })
          .from(deletionConsentRecords)
          .where(eq(deletionConsentRecords.lifecycleId, lifecycle.id));

        const allConsented =
          allRecords.length > 0 &&
          allRecords.every((r) => r.consented === true);

        return { type: "success" as const, allConsented };
      });

      if (txResult.type === "not_found") {
        return c.json(
          {
            error: "同意記録が見つかりません",
            code: "CONSENT_RECORD_NOT_FOUND",
          },
          404,
        );
      }

      await logLifecycleAction(
        lifecycle.id,
        "deletion_consent_submitted",
        userId,
        { consented: true },
      );

      if (txResult.allConsented) {
        // All consented: execute data deletion
        await logLifecycleAction(
          lifecycle.id,
          "data_deletion_executed",
          userId,
        );

        // Notify before deletion (notifications will be cascade-deleted)
        const creatorName = await getCreatorName(creatorId);
        const members = await getActiveFamilyMembers(creatorId);
        const memberUserIds = members.map((m) => m.memberId);
        await notifyFamilyMembers(
          memberUserIds,
          "data_deleted",
          "ノートデータが削除されました",
          `${creatorName}さんのノートデータは、全員の同意により削除されました`,
          creatorId,
        );

        // Clean up R2 audio files (best-effort)
        await deleteUserAudioFiles(creatorId);

        // Delete all conversations for the creator
        await db
          .delete(conversations)
          .where(eq(conversations.userId, creatorId));

        // Clean up lifecycle-related records and reset
        await db
          .delete(deletionConsentRecords)
          .where(eq(deletionConsentRecords.lifecycleId, lifecycle.id));

        await db
          .delete(consentRecords)
          .where(eq(consentRecords.lifecycleId, lifecycle.id));

        await db
          .delete(noteLifecycle)
          .where(eq(noteLifecycle.id, lifecycle.id));

        return c.json({ consented: true, deletionExecuted: true });
      }

      return c.json({ consented: true, deletionExecuted: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to process deletion consent", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "削除同意の処理に失敗しました",
          code: "DELETION_CONSENT_FAILED",
        },
        500,
      );
    }
  },
);

/** POST /api/lifecycle/:creatorId/cancel-data-deletion — Cancel data deletion process (representative only). */
lifecycleRoute.post(
  "/api/lifecycle/:creatorId/cancel-data-deletion",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      // Auth: representative only
      const role = await getUserRole(userId, creatorId);
      if (role !== "representative") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      // Check lifecycle and deletion status
      const lifecycle = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
      });

      if (
        !lifecycle ||
        lifecycle.deletionStatus !== "deletion_consent_gathering"
      ) {
        return c.json(
          {
            error: "データ削除の同意収集が行われていません",
            code: "INVALID_STATUS",
          },
          409,
        );
      }

      // Delete all deletion consent records and reset status
      await db
        .delete(deletionConsentRecords)
        .where(eq(deletionConsentRecords.lifecycleId, lifecycle.id));

      await db
        .update(noteLifecycle)
        .set({ deletionStatus: null, updatedAt: new Date() })
        .where(eq(noteLifecycle.id, lifecycle.id));

      await logLifecycleAction(lifecycle.id, "data_deletion_cancelled", userId);

      // Notify family members
      const creatorName = await getCreatorName(creatorId);
      const members = await getActiveFamilyMembers(creatorId);
      const memberUserIds = members.map((m) => m.memberId);
      await notifyFamilyMembers(
        memberUserIds,
        "deletion_consent_cancelled",
        "データ削除が取り消されました",
        `${creatorName}さんのデータ削除プロセスが代表者により取り消されました`,
        creatorId,
      );

      return c.json({ success: true, deletionStatus: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to cancel data deletion", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "データ削除の取り消しに失敗しました",
          code: "CANCEL_DELETION_FAILED",
        },
        500,
      );
    }
  },
);

/** GET /api/lifecycle/:creatorId/deletion-consent-status — Get deletion consent progress. */
lifecycleRoute.get(
  "/api/lifecycle/:creatorId/deletion-consent-status",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");

      // Auth: any family member
      const role = await getUserRole(userId, creatorId);
      if (role !== "representative" && role !== "member") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const lifecycle = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, creatorId),
        columns: { id: true, deletionStatus: true },
      });

      if (!lifecycle || lifecycle.deletionStatus === null) {
        return c.json({
          deletionStatus: null,
          records: [],
          totalCount: 0,
          consentedCount: 0,
          allConsented: false,
        });
      }

      // Get deletion consent records with member names
      const records = await db
        .select({
          familyMemberId: deletionConsentRecords.familyMemberId,
          consented: deletionConsentRecords.consented,
          consentedAt: deletionConsentRecords.consentedAt,
          memberName: users.name,
        })
        .from(deletionConsentRecords)
        .innerJoin(
          familyMembers,
          eq(deletionConsentRecords.familyMemberId, familyMembers.id),
        )
        .innerJoin(users, eq(familyMembers.memberId, users.id))
        .where(eq(deletionConsentRecords.lifecycleId, lifecycle.id));

      const totalCount = records.length;
      const consentedCount = records.filter((r) => r.consented === true).length;
      const allConsented = totalCount > 0 && consentedCount === totalCount;

      // For regular members, only show their own record
      const visibleRecords =
        role === "representative"
          ? records.map((r) => ({
              memberName: r.memberName,
              consented: r.consented,
              consentedAt: r.consentedAt ? r.consentedAt.toISOString() : null,
            }))
          : [];

      // Find the caller's own consent status
      const membership = await db.query.familyMembers.findFirst({
        where: and(
          eq(familyMembers.creatorId, creatorId),
          eq(familyMembers.memberId, userId),
          eq(familyMembers.isActive, true),
        ),
        columns: { id: true },
      });

      const myRecord = membership
        ? records.find((r) => r.familyMemberId === membership.id)
        : undefined;

      return c.json({
        deletionStatus: lifecycle.deletionStatus,
        records: visibleRecords,
        myConsent: myRecord
          ? {
              consented: myRecord.consented,
              consentedAt: myRecord.consentedAt
                ? myRecord.consentedAt.toISOString()
                : null,
            }
          : null,
        totalCount,
        consentedCount,
        allConsented,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get deletion consent status", {
        error: message,
        creatorId: c.req.param("creatorId"),
      });
      return c.json(
        {
          error: "削除同意の状態取得に失敗しました",
          code: "GET_DELETION_STATUS_FAILED",
        },
        500,
      );
    }
  },
);

export { lifecycleRoute };
