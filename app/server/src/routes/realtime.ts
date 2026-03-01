// Ephemeral token endpoint for WebRTC-based OpenAI Realtime API access.
// Replaces the WebSocket relay: the server only handles authentication,
// quota enforcement, and session tracking. Audio flows directly between
// the client and OpenAI via WebRTC.

import { Hono } from "hono";

import { eq } from "drizzle-orm";

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
import { noteLifecycle, users } from "../db/schema.js";

// --- Constants ---

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

const REALTIME_MODEL = "gpt-realtime-mini";

/** Transcription model for GA Realtime API (replaces whisper-1 from beta). */
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

// --- Types ---

interface TurnDetection {
  type: "server_vad";
  threshold: number;
  prefix_padding_ms: number;
  silence_duration_ms: number;
  create_response?: boolean;
}

interface ToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface SessionConfig {
  instructions: string;
  voice: string;
  tools: ToolDefinition[];
  turn_detection: TurnDetection;
}

interface ConnectRequestBody {
  sessionConfig: SessionConfig;
  sdp: string;
  onboarding?: boolean;
}

interface SessionEndRequestBody {
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
    const body: ConnectRequestBody = await c.req.json();
    const { sessionConfig, sdp, onboarding } = body;

    if (typeof sessionConfig.instructions !== "string") {
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

    // --- User identification ---
    let userId: string | null = null;
    let isOnboarding = false;

    // In development without auth middleware, firebaseUid may not be set
    try {
      const firebaseUid = getFirebaseUid(c);
      userId = await resolveUserId(firebaseUid);

      // Check onboarding eligibility
      if (onboarding === true) {
        const userRow = await db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { name: true },
        });
        isOnboarding = userRow !== undefined && userRow.name === "";
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

    // --- Sanitize instructions ---
    const sanitizedInstructions = sanitizeText(sessionConfig.instructions);

    // --- Build session config for OpenAI ---
    const openaiSession = {
      type: "realtime",
      model: REALTIME_MODEL,
      output_modalities: ["audio"],
      instructions: sanitizedInstructions,
      tools: sessionConfig.tools,
      tool_choice: "auto",
      audio: {
        input: {
          transcription: { model: TRANSCRIPTION_MODEL },
          turn_detection: sessionConfig.turn_detection,
          noise_reduction: { type: "far_field" },
        },
        output: {
          voice: sessionConfig.voice,
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

    if (userId !== null && !isOnboarding) {
      const totalTimeoutMs = MAX_SESSION_DURATION_MS + SESSION_GRACE_PERIOD_MS;
      const timeoutId = setTimeout(() => {
        logger.info("Session timeout reached (realtime), cleaning up", {
          userId,
          sessionKey,
        });
        trackSessionEnd(sessionKey);
      }, totalTimeoutMs);

      sessionKey = trackSessionStart(userId, timeoutId);
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
    const body: SessionEndRequestBody = await c.req.json();
    const { sessionKey } = body;

    if (!sessionKey || typeof sessionKey !== "string") {
      return c.json(
        { error: "セッションキーが不正です", code: "INVALID_REQUEST" },
        400,
      );
    }

    trackSessionEnd(sessionKey);

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
