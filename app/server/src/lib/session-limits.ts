// Server-side session limit constants.
// Client-side constants in client/src/lib/constants.ts mirror these values
// for UX purposes, but the server values are the authoritative enforcement.

/** Maximum number of conversation sessions per user per day. */
export const MAX_DAILY_SESSIONS = 5;

/** Maximum session duration in milliseconds (20 minutes). */
export const MAX_SESSION_DURATION_MS = 20 * 60 * 1000;

/** Grace period after MAX_SESSION_DURATION_MS before force-closing (30 seconds). */
export const SESSION_GRACE_PERIOD_MS = 30 * 1000;

/** WebSocket close code: daily session quota exceeded (RFC 6455 app range 4000-4999). */
export const WS_CLOSE_QUOTA_EXCEEDED = 4008;

/** WebSocket close code: session duration limit reached (RFC 6455 app range 4000-4999). */
export const WS_CLOSE_SESSION_TIMEOUT = 4009;

/** JST timezone identifier for day-boundary calculations. */
export const JST_TIMEZONE = "Asia/Tokyo";
