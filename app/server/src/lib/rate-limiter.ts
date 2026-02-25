// In-memory rate limiter for WebSocket connections.
// Tracks concurrent connections and attempts per IP per time window.

import { logger } from "./logger.js";

// --- Configuration ---

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_CONCURRENT_CONNECTIONS = 3;
const MAX_ATTEMPTS_PER_MINUTE = 10;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// --- Types ---

interface RateLimitEntry {
  connections: number;
  attempts: number;
  windowStart: number;
}

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  code?: string;
}

// --- State ---

const rateLimitMap = new Map<string, RateLimitEntry>();

// Periodically clean up stale entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (
      now - entry.windowStart > RATE_LIMIT_WINDOW_MS &&
      entry.connections === 0
    ) {
      rateLimitMap.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);

// --- Helpers ---

/**
 * Get or create a rate limit entry for the given IP, resetting
 * the attempt window if it has expired.
 */
function getEntry(ip: string): RateLimitEntry {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);

  if (!entry) {
    entry = { connections: 0, attempts: 0, windowStart: now };
    rateLimitMap.set(ip, entry);
    return entry;
  }

  // Reset the attempts window if expired, but preserve active connections
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.attempts = 0;
    entry.windowStart = now;
  }

  return entry;
}

// --- Public API ---

/**
 * Check whether a new connection attempt from the given IP is allowed.
 * If allowed, increments the attempts counter (but does NOT increment
 * the connection count yet -- call `trackConnect` for that).
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const entry = getEntry(ip);

  // Check attempts per minute
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS_PER_MINUTE) {
    logger.warn("WebSocket rate limit exceeded (attempts)", { ip });
    return {
      allowed: false,
      reason: "Too many requests",
      code: "RATE_LIMIT_EXCEEDED",
    };
  }

  // Check concurrent connections
  if (entry.connections >= MAX_CONCURRENT_CONNECTIONS) {
    logger.warn("WebSocket rate limit exceeded (concurrent connections)", {
      ip,
      connections: entry.connections,
    });
    return {
      allowed: false,
      reason: "Too many connections",
      code: "CONNECTION_LIMIT_EXCEEDED",
    };
  }

  return { allowed: true };
}

/**
 * Track that a WebSocket connection has been established for this IP.
 * Call this when the WebSocket `onOpen` fires.
 */
export function trackConnect(ip: string): void {
  const entry = getEntry(ip);
  entry.connections += 1;
  logger.debug("Connection tracked", {
    ip,
    connections: entry.connections,
  });
}

/**
 * Track that a WebSocket connection has been closed for this IP.
 * Call this when the WebSocket `onClose` fires.
 */
export function trackDisconnect(ip: string): void {
  const entry = getEntry(ip);
  entry.connections = Math.max(0, entry.connections - 1);
  logger.debug("Disconnection tracked", {
    ip,
    connections: entry.connections,
  });
}
