// Ephemeral token endpoint for WebRTC-based OpenAI Realtime API access.
// Replaces the WebSocket relay: the server only handles authentication,
// quota enforcement, and session tracking. Audio flows directly between
// the client and OpenAI via WebRTC.

import { Hono } from "hono";

import { and, eq, or } from "drizzle-orm";

import { getFirebaseUid } from "../middleware/auth.js";
import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { resolveUserId } from "../lib/users.js";
import { trackSessionStart, trackSessionEnd } from "../lib/session-tracker.js";
import { getSessionQuota } from "../lib/session-quota.js";
import { sanitizeText } from "../services/sanitizer.js";
import {
  MAX_SESSION_DURATION_MS,
  SESSION_GRACE_PERIOD_MS,
} from "../lib/session-limits.js";
import { db } from "../db/connection.js";
import { activityLog, noteLifecycle, users } from "../db/schema.js";
import { normalizeStoredProfile } from "../lib/profile-validation.js";
import {
  validateRealtimeSessionConfig,
  type ToolDefinition,
  type TurnDetection,
} from "../lib/realtime-session-config.js";

// --- Constants ---

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

const REALTIME_MODEL = "gpt-realtime-mini";
const REALTIME_SESSION_RESOURCE_TYPE = "realtime_session";
const REALTIME_SESSION_STARTED_ACTION = "realtime_session_started";
const REALTIME_SESSION_ENDED_ACTION = "realtime_session_ended";
const REALTIME_SESSION_ACTIVATED_ACTION = "realtime_session_activated";
const REALTIME_ONBOARDING_SESSION_STARTED_ACTION =
  "realtime_onboarding_started";
const REALTIME_ONBOARDING_SESSION_ENDED_ACTION = "realtime_onboarding_ended";
const MAX_INSTRUCTIONS_LENGTH = 50_000;
const MAX_SDP_LENGTH = 200_000;

/** Transcription model for GA Realtime API (replaces whisper-1 from beta). */
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

interface SessionEndRequestBody {
  sessionKey: string;
}

interface SessionActivateRequestBody {
  sessionKey: string;
}

// --- Route ---

export const realtimeRoute = new Hono();

/**
 * POST /api/realtime/connect
 *
 * Authenticates the user, checks quota and lifecycle status,
 * then exchanges SDP with OpenAI via the unified /v1/realtime/calls
 * endpoint using FormData (sdp + session). Returns the answer SDP
 * and a session key for tracking.
 */
realtimeRoute.post("/api/realtime/connect", async (c) => {
  const config = loadConfig();

  try {
    const body = await c.req.json<unknown>();
    if (typeof body !== "object" || body === null) {
      return c.json(
        { error: "リクエストが不正です", code: "INVALID_REQUEST" },
        400,
      );
    }
    const rawBody = body as Record<string, unknown>;
    const sessionConfig = rawBody["sessionConfig"];
    const sdp = rawBody["sdp"];
    const onboarding = rawBody["onboarding"];

    if (
      typeof sessionConfig !== "object" ||
      sessionConfig === null ||
      typeof (sessionConfig as Record<string, unknown>)["instructions"] !==
        "string"
    ) {
      return c.json(
        { error: "セッション設定が不正です", code: "INVALID_REQUEST" },
        400,
      );
    }

    if (typeof sdp !== "string" || sdp.length === 0) {
      return c.json(
        { error: "SDP offerが不正です", code: "INVALID_REQUEST" },
        400,
      );
    }
    if (sdp.length > MAX_SDP_LENGTH) {
      return c.json(
        { error: "SDP offerが大きすぎます", code: "INVALID_REQUEST" },
        400,
      );
    }

    // --- User identification ---
    let userId: string | null = null;
    let isOnboarding = false;
    let approvedSessionConfig: {
      voice: string;
      tools: readonly ToolDefinition[];
      turnDetection: TurnDetection;
    } | null = null;

    // In development without auth middleware, firebaseUid may not be set
    try {
      const firebaseUid = getFirebaseUid(c);
      userId = await resolveUserId(firebaseUid);

      // Check onboarding eligibility
      if (onboarding === true) {
        const userRow = await db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: {
            name: true,
            characterId: true,
            fontSize: true,
            speakingSpeed: true,
            silenceDuration: true,
            confirmationLevel: true,
          },
        });
        if (userRow !== undefined) {
          const normalizedProfile = normalizeStoredProfile(userRow);
          const priorSession = await db.query.activityLog.findFirst({
            where: and(
              eq(activityLog.creatorId, userId),
              eq(activityLog.actorId, userId),
              eq(activityLog.resourceType, REALTIME_SESSION_RESOURCE_TYPE),
              or(
                eq(activityLog.action, REALTIME_SESSION_STARTED_ACTION),
                eq(
                  activityLog.action,
                  REALTIME_ONBOARDING_SESSION_STARTED_ACTION,
                ),
              ),
            ),
            columns: { id: true },
          });
          isOnboarding =
            normalizedProfile.name === "" && priorSession === undefined;
        }
      }

      // Quota check (skip for onboarding)
      if (!isOnboarding) {
        const quota = await getSessionQuota(userId);
        if (!quota.canStart) {
          logger.warn("Daily session quota exceeded (realtime connect)", {
            userId,
            usedToday: quota.usedToday,
          });
          return c.json(
            {
              error: "本日の会話回数の上限に達しました",
              code: "DAILY_QUOTA_EXCEEDED",
            },
            429,
          );
        }
      }

      // Lifecycle check
      const lifecycle = await db.query.noteLifecycle.findFirst({
        where: eq(noteLifecycle.creatorId, userId),
        columns: { status: true },
      });
      if (lifecycle !== undefined && lifecycle.status !== "active") {
        logger.warn("Conversation blocked by lifecycle status (realtime)", {
          userId,
          lifecycleStatus: lifecycle.status,
        });
        return c.json(
          {
            error: "現在、新しい会話を始めることはできません",
            code: "LIFECYCLE_BLOCKED",
          },
          403,
        );
      }
    } catch {
      // In development mode without auth, proceed without user validation
      if (config.nodeEnv !== "development") {
        return c.json(
          { error: "認証に失敗しました", code: "AUTH_REQUIRED" },
          401,
        );
      }
    }

    approvedSessionConfig = validateRealtimeSessionConfig(
      sessionConfig,
      isOnboarding,
    );
    if (approvedSessionConfig === null) {
      return c.json(
        { error: "セッション設定が不正です", code: "INVALID_REQUEST" },
        400,
      );
    }

    // --- Sanitize instructions ---
    const sanitizedInstructions = sanitizeText(
      (sessionConfig as Record<string, unknown>)["instructions"] as string,
    );
    if (sanitizedInstructions.trim().length === 0) {
      return c.json(
        { error: "instructions が不正です", code: "INVALID_REQUEST" },
        400,
      );
    }
    if (sanitizedInstructions.length > MAX_INSTRUCTIONS_LENGTH) {
      return c.json(
        { error: "instructions が長すぎます", code: "INVALID_REQUEST" },
        400,
      );
    }

    // --- Build session config for OpenAI ---
    const openaiSession = {
      type: "realtime",
      model: REALTIME_MODEL,
      output_modalities: ["audio"],
      instructions: sanitizedInstructions,
      tools: approvedSessionConfig.tools,
      tool_choice: "auto",
      audio: {
        input: {
          transcription: { model: TRANSCRIPTION_MODEL },
          turn_detection: approvedSessionConfig.turnDetection,
          noise_reduction: { type: "far_field" },
        },
        output: {
          voice: approvedSessionConfig.voice,
        },
      },
    };

    // --- Exchange SDP with OpenAI via unified /v1/realtime/calls ---
    const formData = new FormData();
    formData.set("sdp", sdp);
    formData.set("session", JSON.stringify(openaiSession));

    const openaiResponse = await fetch(OPENAI_REALTIME_CALLS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: formData,
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text().catch(() => "");
      logger.error("Failed to exchange SDP with OpenAI", {
        status: openaiResponse.status,
        error: errorText.slice(0, 500),
      });
      return c.json(
        {
          error: "AIサービスへの接続に失敗しました",
          code: "OPENAI_SDP_EXCHANGE_FAILED",
        },
        502,
      );
    }

    const answerSdp = await openaiResponse.text();

    // --- Track session ---
    let sessionKey = "";

    if (userId !== null) {
      const totalTimeoutMs = MAX_SESSION_DURATION_MS + SESSION_GRACE_PERIOD_MS;
      const timeoutId = setTimeout(() => {
        logger.info("Session timeout reached (realtime), cleaning up", {
          userId,
          sessionKey,
        });
        trackSessionEnd(sessionKey);
      }, totalTimeoutMs);

      sessionKey = trackSessionStart(userId, timeoutId);

      try {
        await db.insert(activityLog).values({
          creatorId: userId,
          actorId: userId,
          actorRole: "creator",
          action: isOnboarding
            ? REALTIME_ONBOARDING_SESSION_STARTED_ACTION
            : REALTIME_SESSION_STARTED_ACTION,
          resourceType: REALTIME_SESSION_RESOURCE_TYPE,
          resourceId: sessionKey,
          metadata: { onboarding: isOnboarding },
        });
      } catch (logError: unknown) {
        trackSessionEnd(sessionKey);
        throw logError;
      }
    }

    logger.info("Realtime SDP exchange completed", {
      userId: userId ?? "anonymous",
      onboarding: isOnboarding,
      sessionKey: sessionKey || undefined,
    });

    return c.json({
      answerSdp,
      sessionKey,
    });
  } catch (err: unknown) {
    logger.error("Failed to connect realtime session", {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      {
        error: "接続に失敗しました",
        code: "CONNECT_FAILED",
      },
      500,
    );
  }
});

/**
 * POST /api/realtime/session-end
 *
 * Called by the client when a WebRTC conversation ends.
 * Releases the in-memory session tracking entry.
 */
realtimeRoute.post("/api/realtime/session-end", async (c) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const body: SessionEndRequestBody = await c.req.json();
    const { sessionKey } = body;

    if (!sessionKey || typeof sessionKey !== "string") {
      return c.json(
        { error: "セッションキーが不正です", code: "INVALID_REQUEST" },
        400,
      );
    }

    const sessionStart = await db.query.activityLog.findFirst({
      where: and(
        eq(activityLog.creatorId, userId),
        eq(activityLog.actorId, userId),
        or(
          eq(activityLog.action, REALTIME_SESSION_STARTED_ACTION),
          eq(activityLog.action, REALTIME_ONBOARDING_SESSION_STARTED_ACTION),
        ),
        eq(activityLog.resourceType, REALTIME_SESSION_RESOURCE_TYPE),
        eq(activityLog.resourceId, sessionKey),
      ),
      columns: { id: true, action: true },
    });

    if (!sessionStart) {
      return c.json(
        { error: "セッションが見つかりません", code: "SESSION_NOT_FOUND" },
        404,
      );
    }

    trackSessionEnd(sessionKey);

    void db.insert(activityLog).values({
      creatorId: userId,
      actorId: userId,
      actorRole: "creator",
      action:
        sessionStart.action === REALTIME_ONBOARDING_SESSION_STARTED_ACTION
          ? REALTIME_ONBOARDING_SESSION_ENDED_ACTION
          : REALTIME_SESSION_ENDED_ACTION,
      resourceType: REALTIME_SESSION_RESOURCE_TYPE,
      resourceId: sessionKey,
      metadata: null,
    });

    logger.info("Realtime session ended", { sessionKey });
    return c.json({ success: true });
  } catch (err: unknown) {
    logger.error("Failed to end realtime session", {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      { error: "セッション終了に失敗しました", code: "SESSION_END_FAILED" },
      500,
    );
  }
});

realtimeRoute.post("/api/realtime/session-activate", async (c) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const body: SessionActivateRequestBody = await c.req.json();
    const { sessionKey } = body;

    if (!sessionKey || typeof sessionKey !== "string") {
      return c.json(
        { error: "セッションキーが不正です", code: "INVALID_REQUEST" },
        400,
      );
    }

    const sessionStart = await db.query.activityLog.findFirst({
      where: and(
        eq(activityLog.creatorId, userId),
        eq(activityLog.actorId, userId),
        or(
          eq(activityLog.action, REALTIME_SESSION_STARTED_ACTION),
          eq(activityLog.action, REALTIME_ONBOARDING_SESSION_STARTED_ACTION),
        ),
        eq(activityLog.resourceType, REALTIME_SESSION_RESOURCE_TYPE),
        eq(activityLog.resourceId, sessionKey),
      ),
      columns: { id: true, action: true },
    });

    if (!sessionStart) {
      return c.json(
        { error: "セッションが見つかりません", code: "SESSION_NOT_FOUND" },
        404,
      );
    }

    if (sessionStart.action === REALTIME_ONBOARDING_SESSION_STARTED_ACTION) {
      return c.json({ success: true, counted: false });
    }

    const existingActivation = await db.query.activityLog.findFirst({
      where: and(
        eq(activityLog.creatorId, userId),
        eq(activityLog.actorId, userId),
        eq(activityLog.action, REALTIME_SESSION_ACTIVATED_ACTION),
        eq(activityLog.resourceType, REALTIME_SESSION_RESOURCE_TYPE),
        eq(activityLog.resourceId, sessionKey),
      ),
      columns: { id: true },
    });

    if (!existingActivation) {
      await db.insert(activityLog).values({
        creatorId: userId,
        actorId: userId,
        actorRole: "creator",
        action: REALTIME_SESSION_ACTIVATED_ACTION,
        resourceType: REALTIME_SESSION_RESOURCE_TYPE,
        resourceId: sessionKey,
        metadata: null,
      });
    }

    return c.json({ success: true, counted: true });
  } catch (err: unknown) {
    logger.error("Failed to activate realtime session", {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      {
        error: "セッション開始の記録に失敗しました",
        code: "SESSION_ACTIVATE_FAILED",
      },
      500,
    );
  }
});
