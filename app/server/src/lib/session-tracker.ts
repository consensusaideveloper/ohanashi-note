// In-memory tracker for active (in-progress) WebSocket sessions per user.
// Used alongside the DB conversations table to enforce daily session limits
// even for sessions that haven't been saved to the database yet.
//
// Follows the same Map + periodic cleanup pattern as rate-limiter.ts.

import { logger } from "./logger.js";

// --- Constants ---

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_SESSION_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour safety net

// --- Types ---

interface ActiveSession {
  userId: string;
  startedAt: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

// --- State ---

/** Map from a unique session key to active session details. */
const activeSessions = new Map<string, ActiveSession>();

// Periodically clean up sessions that were never removed
// (e.g., if onClose was never called due to a crash).
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of activeSessions.entries()) {
    if (now - session.startedAt > STALE_SESSION_THRESHOLD_MS) {
      logger.warn("Removing stale active session", {
        sessionKey: key,
        userId: session.userId,
      });
      if (session.timeoutId !== null) {
        clearTimeout(session.timeoutId);
      }
      activeSessions.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// --- Public API ---

/**
 * Register a new active session for the given user.
 * Returns a unique session key used to remove the session later.
 */
export function trackSessionStart(
  userId: string,
  timeoutId: ReturnType<typeof setTimeout> | null,
): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const sessionKey = `${userId}:${Date.now()}:${randomSuffix}`;
  activeSessions.set(sessionKey, {
    userId,
    startedAt: Date.now(),
    timeoutId,
  });
  logger.info("Active session tracked", {
    sessionKey,
    userId,
    totalActive: activeSessions.size,
  });
  return sessionKey;
}

/**
 * Remove an active session when the WebSocket closes.
 * Also clears the associated timeout if one was set.
 */
export function trackSessionEnd(sessionKey: string): void {
  const session = activeSessions.get(sessionKey);
  if (session !== undefined) {
    if (session.timeoutId !== null) {
      clearTimeout(session.timeoutId);
    }
    activeSessions.delete(sessionKey);
    logger.info("Active session removed", {
      sessionKey,
      userId: session.userId,
      totalActive: activeSessions.size,
    });
  }
}

/**
 * Count the number of currently active sessions for a specific user.
 */
export function getActiveSessionCount(userId: string): number {
  let count = 0;
  for (const session of activeSessions.values()) {
    if (session.userId === userId) {
      count += 1;
    }
  }
  return count;
}
