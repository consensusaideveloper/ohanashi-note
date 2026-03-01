import { resolve } from "node:path";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import { health } from "./routes/health.js";
import { summarize } from "./routes/summarize.js";
import { conversationsRoute } from "./routes/conversations.js";
import { profileRoute } from "./routes/profile.js";
import { categoryAccessRoute } from "./routes/category-access.js";
import { familyRoute } from "./routes/family.js";
import { lifecycleRoute } from "./routes/lifecycle.js";
import { notificationsRoute } from "./routes/notifications.js";
import { audioUploadRoute } from "./routes/audio-upload.js";
import { enhancedSummarizeRoute } from "./routes/enhanced-summarize.js";
import { sessionQuotaRoute } from "./routes/session-quota.js";
import { accessPresetsRoute } from "./routes/access-presets.js";
import { accountRoute } from "./routes/account.js";
import { termsConsentRoute } from "./routes/terms-consent.js";
import { todoRoute } from "./routes/todos.js";
import { activityRoute } from "./routes/activity.js";
import { realtimeRoute } from "./routes/realtime.js";
import { loadConfig } from "./lib/config.js";
import { logger } from "./lib/logger.js";

// Start pending summary recovery (side-effect import starts the interval)
import "./lib/pending-summary-recovery.js";
import { authMiddleware } from "./middleware/auth.js";

// --- Configuration ---

const config = loadConfig();
const app = new Hono();

// --- Auth middleware for /api/* (except public share endpoint) ---

app.use("/api/conversations/*", authMiddleware);
app.use("/api/conversations", authMiddleware);
app.use("/api/profile", authMiddleware);
app.use("/api/summarize", authMiddleware);
app.use("/api/session-quota", authMiddleware);
app.use("/api/family/*", authMiddleware);
app.use("/api/family", authMiddleware);
app.use("/api/lifecycle/*", authMiddleware);
app.use("/api/notifications/*", authMiddleware);
app.use("/api/notifications", authMiddleware);
app.use("/api/access/*", authMiddleware);
app.use("/api/access-presets/*", authMiddleware);
app.use("/api/access-presets", authMiddleware);
app.use("/api/account", authMiddleware);
app.use("/api/todos/*", authMiddleware);
app.use("/api/todos", authMiddleware);
app.use("/api/activity/*", authMiddleware);
app.use("/api/terms-consent/*", authMiddleware);
app.use("/api/terms-consent", authMiddleware);
app.use("/api/realtime/*", authMiddleware);

// --- Routes ---

app.route("/", health);
app.route("/", summarize);
app.route("/", conversationsRoute);
app.route("/", profileRoute);
app.route("/", categoryAccessRoute);
app.route("/", familyRoute);
app.route("/", lifecycleRoute);
app.route("/", notificationsRoute);
app.route("/", audioUploadRoute);
app.route("/", enhancedSummarizeRoute);
app.route("/", sessionQuotaRoute);
app.route("/", accessPresetsRoute);
app.route("/", accountRoute);
app.route("/", todoRoute);
app.route("/", activityRoute);
app.route("/", termsConsentRoute);
app.route("/", realtimeRoute);

// In production, serve the client static files
// Use absolute path to avoid CWD dependency on deployment platforms
const CLIENT_DIST = resolve(import.meta.dirname, "../../client/dist");

if (config.nodeEnv === "production") {
  app.use("/*", serveStatic({ root: CLIENT_DIST }));

  // SPA fallback: serve index.html for non-API, non-file routes
  app.get("*", serveStatic({ root: CLIENT_DIST, path: "index.html" }));
}

// --- Server startup ---

serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info("Server started", {
    port: info.port,
    env: config.nodeEnv,
  });
});
