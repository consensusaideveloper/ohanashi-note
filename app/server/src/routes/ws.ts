// WebSocket route that bridges browser clients to the OpenAI Realtime API
// via the relay service, with per-user session quota enforcement.

import { Hono } from "hono";

import { createRelay } from "../services/openai-relay.js";
import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { verifyIdToken } from "../lib/firebase-admin.js";
import { resolveUserId } from "../lib/users.js";
import { trackConnect, trackDisconnect } from "../lib/rate-limiter.js";
import { trackSessionStart, trackSessionEnd } from "../lib/session-tracker.js";
import { getSessionQuota } from "../lib/session-quota.js";
import {
  MAX_SESSION_DURATION_MS,
  SESSION_GRACE_PERIOD_MS,
  WS_CLOSE_QUOTA_EXCEEDED,
  WS_CLOSE_SESSION_TIMEOUT,
} from "../lib/session-limits.js";

import type { UpgradeWebSocket } from "hono/ws";
import type { WebSocket as NodeWebSocket } from "ws";
import type { RelaySession } from "../services/openai-relay.js";

type NodeUpgradeWebSocket = UpgradeWebSocket<
  NodeWebSocket,
  { onError: (err: unknown) => void }
>;

/** Hono env with typed context variables for the WS route. */
interface WsEnv {
  Variables: {
    firebaseUid: string;
  };
}

/**
 * Extract the client IP address from a Hono context's headers.
 */
function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    return first ? first.trim() : "unknown";
  }
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Create the WebSocket route app.
 * Accepts `upgradeWebSocket` from `@hono/node-ws` so the route can
 * upgrade HTTP connections to WebSocket.
 */
export function createWsRoute(
  upgradeWebSocket: NodeUpgradeWebSocket,
): Hono<WsEnv> {
  const wsApp = new Hono<WsEnv>();
  const config = loadConfig();

  // Verify Firebase auth token from query parameter before WebSocket upgrade.
  // Stores the Firebase UID in the Hono context for use in the WS handler.
  wsApp.use("/ws", async (c, next) => {
    const token = c.req.query("token");

    // In development, allow connections without token for testing
    if (config.nodeEnv === "development" && !token) {
      await next();
      return;
    }

    if (!token) {
      return c.json({ error: "認証が必要です", code: "AUTH_REQUIRED" }, 401);
    }

    try {
      const decoded = await verifyIdToken(token);
      // Store the Firebase UID in context for the WebSocket handler
      c.set("firebaseUid", decoded.uid);
      await next();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Token verification failed";
      logger.warn("WebSocket auth token verification failed", {
        error: message,
      });
      return c.json(
        { error: "認証に失敗しました", code: "AUTH_INVALID_TOKEN" },
        401,
      );
    }
  });

  wsApp.get(
    "/ws",
    upgradeWebSocket((c) => {
      let relay: RelaySession | null = null;
      // Capture the client IP from the upgrade request headers
      const clientIp = getClientIpFromHeaders(c.req.raw.headers);
      // Capture the Firebase UID set by the auth middleware
      const firebaseUid = c.get("firebaseUid") as string | undefined;
      let sessionKey: string | null = null;

      /** Clean up session tracking and relay on disconnect. */
      function cleanupSession(): void {
        if (sessionKey !== null) {
          trackSessionEnd(sessionKey);
          sessionKey = null;
        }
        if (relay !== null) {
          relay.closeRelay();
          relay = null;
        }
      }

      return {
        onOpen(_event, ws): void {
          logger.info("WebSocket client connected", { ip: clientIp });
          trackConnect(clientIp);

          // Async quota check and relay creation wrapped in IIFE.
          // The relay is NOT created until the quota check passes,
          // so no OpenAI connection is opened for rejected users.
          (async (): Promise<void> => {
            // --- User identification & quota check ---
            if (firebaseUid !== undefined) {
              const userId = await resolveUserId(firebaseUid);
              const quota = await getSessionQuota(userId);

              if (!quota.canStart) {
                logger.warn("Daily session quota exceeded", {
                  userId,
                  usedToday: quota.usedToday,
                });
                ws.close(
                  WS_CLOSE_QUOTA_EXCEEDED,
                  JSON.stringify({ code: "DAILY_QUOTA_EXCEEDED" }),
                );
                return;
              }

              // --- Server-side session timeout ---
              const totalTimeoutMs =
                MAX_SESSION_DURATION_MS + SESSION_GRACE_PERIOD_MS;
              const timeoutId = setTimeout(() => {
                logger.info("Session timeout reached, force-closing relay", {
                  userId,
                  sessionKey,
                });
                ws.close(
                  WS_CLOSE_SESSION_TIMEOUT,
                  JSON.stringify({ code: "SESSION_TIMEOUT" }),
                );
                cleanupSession();
              }, totalTimeoutMs);

              // --- Track active session ---
              sessionKey = trackSessionStart(userId, timeoutId);
            }

            // --- Create relay to OpenAI ---
            relay = createRelay(ws, { apiKey: config.openaiApiKey });
          })().catch((err: unknown) => {
            logger.error("Session setup failed", { error: String(err) });
            // Fail open: create relay anyway to avoid blocking users
            try {
              relay = createRelay(ws, { apiKey: config.openaiApiKey });
            } catch (relayErr: unknown) {
              logger.error("Failed to create relay session", {
                error: String(relayErr),
              });
              ws.close(1011, "Failed to connect to AI service");
            }
          });
        },

        onMessage(event, _ws): void {
          try {
            if (relay === null) {
              logger.warn("Received message before relay was established");
              return;
            }

            // Hono WS event.data has unresolvable types for ESLint
            const rawData: unknown = (event as { data: unknown }).data;
            const data =
              typeof rawData === "string" ? rawData : String(rawData);

            relay.forwardClientMessage(data);
          } catch (err: unknown) {
            logger.error("Error handling client message", {
              error: String(err),
            });
          }
        },

        onClose(): void {
          logger.info("WebSocket client disconnected", { ip: clientIp });
          trackDisconnect(clientIp);
          cleanupSession();
        },

        onError(event): void {
          logger.error("WebSocket client error", {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            error: String(event),
            ip: clientIp,
          });
          trackDisconnect(clientIp);
          cleanupSession();
        },
      };
    }),
  );

  return wsApp;
}
