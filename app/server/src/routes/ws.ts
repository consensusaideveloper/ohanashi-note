// WebSocket route that bridges browser clients to the OpenAI Realtime API
// via the relay service.

import { Hono } from "hono";

import { createRelay } from "../services/openai-relay.js";
import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { trackConnect, trackDisconnect } from "../lib/rate-limiter.js";

import type { UpgradeWebSocket } from "hono/ws";
import type { WebSocket as NodeWebSocket } from "ws";
import type { RelaySession } from "../services/openai-relay.js";

type NodeUpgradeWebSocket = UpgradeWebSocket<
  NodeWebSocket,
  { onError: (err: unknown) => void }
>;

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
export function createWsRoute(upgradeWebSocket: NodeUpgradeWebSocket): Hono {
  const wsApp = new Hono();
  const config = loadConfig();

  wsApp.get(
    "/ws",
    upgradeWebSocket((c) => {
      let relay: RelaySession | null = null;
      // Capture the client IP from the upgrade request headers
      const clientIp = getClientIpFromHeaders(c.req.raw.headers);

      return {
        onOpen(_event, ws): void {
          logger.info("WebSocket client connected, creating relay", {
            ip: clientIp,
          });

          trackConnect(clientIp);

          try {
            relay = createRelay(ws, { apiKey: config.openaiApiKey });
          } catch (err: unknown) {
            logger.error("Failed to create relay session", {
              error: String(err),
            });
            ws.close(1011, "Failed to connect to AI service");
          }
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

          if (relay !== null) {
            relay.closeRelay();
            relay = null;
          }
        },

        onError(event): void {
          logger.error("WebSocket client error", {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            error: String(event),
            ip: clientIp,
          });
          trackDisconnect(clientIp);

          if (relay !== null) {
            relay.closeRelay();
            relay = null;
          }
        },
      };
    }),
  );

  return wsApp;
}
