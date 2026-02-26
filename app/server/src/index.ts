import { resolve } from "node:path";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";

import { health } from "./routes/health.js";
import { summarize } from "./routes/summarize.js";
import { conversationsRoute } from "./routes/conversations.js";
import { profileRoute } from "./routes/profile.js";
import { sharingRoute } from "./routes/sharing.js";
import { audioRoute } from "./routes/audio.js";
import { audioUploadRoute } from "./routes/audio-upload.js";
import { createWsRoute } from "./routes/ws.js";
import { loadConfig } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { checkRateLimit } from "./lib/rate-limiter.js";
import { authMiddleware } from "./middleware/auth.js";

import type { Context, Next } from "hono";

// --- Configuration ---

const config = loadConfig();
const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// --- Helpers ---

/**
 * Extract the client IP address from the request.
 * Uses X-Forwarded-For if available, otherwise falls back to X-Real-IP.
 */
function getClientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    return first ? first.trim() : "unknown";
  }
  return c.req.header("x-real-ip") ?? "unknown";
}

// --- Origin validation middleware ---

async function originValidation(
  c: Context,
  next: Next,
): Promise<Response | void> {
  // Only validate WebSocket upgrade requests
  const upgradeHeader = c.req.header("upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    await next();
    return;
  }

  const origin = c.req.header("origin");

  // In development, allow requests without origin (e.g., from tools)
  if (config.nodeEnv === "development" && !origin) {
    await next();
    return;
  }

  if (!origin || !config.allowedOrigins.includes(origin)) {
    logger.warn("WebSocket connection rejected: invalid origin", {
      origin: origin ?? "none",
      allowed: config.allowedOrigins,
    });
    return c.json(
      { error: "Forbidden origin", code: "ORIGIN_NOT_ALLOWED" },
      403,
    );
  }

  await next();
}

// --- Rate limiting middleware for /ws ---

async function wsRateLimit(c: Context, next: Next): Promise<Response | void> {
  const upgradeHeader = c.req.header("upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    await next();
    return;
  }

  const ip = getClientIp(c);
  const result = checkRateLimit(ip);

  if (!result.allowed) {
    return c.json(
      {
        error: result.reason ?? "Rate limited",
        code: result.code ?? "RATE_LIMITED",
      },
      429,
    );
  }

  await next();
}

// --- Middleware (applied to /ws path) ---

app.use("/ws", originValidation);
app.use("/ws", wsRateLimit);

// --- Auth middleware for /api/* (except public share endpoint) ---

app.use("/api/conversations/*", authMiddleware);
app.use("/api/conversations", authMiddleware);
app.use("/api/profile", authMiddleware);
app.use("/api/summarize", authMiddleware);
// Note: /api/shares auth is handled per-method inside the sharing route
// because GET /api/shares/:id is public.

// --- Routes ---

app.route("/", health);
app.route("/", summarize);
app.route("/", conversationsRoute);
app.route("/", profileRoute);
app.route("/", sharingRoute);
app.route("/", audioRoute);
app.route("/", audioUploadRoute);

// WebSocket route via relay
const wsRoute = createWsRoute(upgradeWebSocket);
app.route("/", wsRoute);

// In production, serve the client static files
// Use absolute path to avoid CWD dependency on deployment platforms
const CLIENT_DIST = resolve(import.meta.dirname, "../../client/dist");

if (config.nodeEnv === "production") {
  app.use("/*", serveStatic({ root: CLIENT_DIST }));

  // SPA fallback: serve index.html for non-API, non-file routes
  app.get("*", serveStatic({ root: CLIENT_DIST, path: "index.html" }));
}

// --- Server startup ---

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info("Server started", {
    port: info.port,
    env: config.nodeEnv,
  });
});

injectWebSocket(server);
