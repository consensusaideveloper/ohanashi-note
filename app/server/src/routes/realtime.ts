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

const OPENAI_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";

const REALTIME_MODEL = "gpt-realtime-mini";

// --- Types ---

interface TurnDetection {
  type: "server_vad";
  threshold: number;
  prefix_padding_ms: number;
  silence_duration_ms: number;
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
  input_audio_transcription: { model: string; language: string };
  temperature: number;
}

interface TokenRequestBody {
  sessionConfig: SessionConfig;
  onboarding?: boolean;
}

interface SessionEndRequestBody {
  sessionKey: string;
}

interface OpenAIClientSecretResponse {
  value: string;
  expires_at: number;
}

// --- Route ---

export const realtimeRoute = new Hono();

/**
 * POST /api/realtime/token
 *
 * Authenticates the user, checks quota and lifecycle status,
 * then creates an ephemeral token via the OpenAI client_secrets API.
 * Returns the token and a session key for tracking.
 */
realtimeRoute.post("/api/realtime/token", async (c) => {
  const config = loadConfig();

  try {
    const body = (await c.req.json()) as TokenRequestBody;
    const { sessionConfig, onboarding } = body;

    if (!sessionConfig || typeof sessionConfig.instructions !== "string") {
      return c.json(
        { error: "セッション設定が不正です", code: "INVALID_REQUEST" },
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
          logger.warn("Daily session quota exceeded (realtime token)", {
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

    // --- Create ephemeral token via OpenAI ---
    const openaiResponse = await fetch(OPENAI_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          model: REALTIME_MODEL,
          modalities: ["text", "audio"],
          instructions: sanitizedInstructions,
          voice: sessionConfig.voice,
          tools: sessionConfig.tools,
          tool_choice: "auto",
          turn_detection: sessionConfig.turn_detection,
          input_audio_transcription: sessionConfig.input_audio_transcription,
          temperature: sessionConfig.temperature,
        },
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text().catch(() => "");
      logger.error("Failed to create OpenAI ephemeral token", {
        status: openaiResponse.status,
        error: errorText.slice(0, 500),
      });
      return c.json(
        {
          error: "AIサービスへの接続に失敗しました",
          code: "OPENAI_TOKEN_FAILED",
        },
        502,
      );
    }

    const tokenResponse =
      (await openaiResponse.json()) as OpenAIClientSecretResponse;

    // --- Track session ---
    let sessionKey = "";

    if (userId !== null && !isOnboarding) {
      const totalTimeoutMs = MAX_SESSION_DURATION_MS + SESSION_GRACE_PERIOD_MS;
      const timeoutId = setTimeout(() => {
        // Server-side safety net: auto-end session tracking after timeout.
        // WebRTC connection itself cannot be closed server-side; client
        // handles its own session timer.
        logger.info("Session timeout reached (realtime token), cleaning up", {
          userId,
          sessionKey,
        });
        trackSessionEnd(sessionKey);
      }, totalTimeoutMs);

      sessionKey = trackSessionStart(userId, timeoutId);
    }

    logger.info("Ephemeral token created", {
      userId: userId ?? "anonymous",
      onboarding: isOnboarding,
      sessionKey: sessionKey || undefined,
    });

    return c.json({
      token: tokenResponse.value,
      sessionKey,
    });
  } catch (err: unknown) {
    logger.error("Failed to create realtime token", {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      {
        error: "トークンの作成に失敗しました",
        code: "TOKEN_CREATE_FAILED",
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
    const body = (await c.req.json()) as SessionEndRequestBody;
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
