// Server-side session limit constants.
// Client-side constants in client/src/lib/constants.ts mirror these values
// for UX purposes, but the server values are the authoritative enforcement.

function readIntEnv(
  name: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Invalid ${name}: ${raw}. Expected an integer between ${String(min)} and ${String(max)}.`,
    );
  }
  return parsed;
}

/**
 * Maximum number of conversation sessions per user per day.
 *
 * Set to 3 based on cost analysis (docs/cost-analysis.md):
 * - 3 sessions × 20 min = 60 min/day — appropriate cognitive load for elderly users (60-80)
 * - Caps daily variable AI cost at roughly ¥100-¥120/day (model-dependent)
 * - Ending note completion (110 questions, ~3-5 per session) takes 8-12 days at 3/day — sufficient pace
 * - Aligns with planned premium tier daily limit
 */
export const MAX_DAILY_SESSIONS = 3;

/**
 * Optional monthly quota.
 *
 * 0 means "disabled" to preserve current behavior until a paid plan is
 * officially launched.
 */
export const MAX_MONTHLY_SESSIONS = readIntEnv(
  "MAX_MONTHLY_SESSIONS",
  0,
  0,
  365,
);

/**
 * Maximum session duration in milliseconds (20 minutes).
 *
 * Kept at 20 min based on cost analysis (docs/cost-analysis.md):
 * - Cost per 20-min session is still low enough to preserve strong gross margin
 * - Elderly users need unhurried pace; 15 min risks feeling rushed
 * - 20 min covers 3-5 ending note questions naturally with warm AI conversation
 */
export const MAX_SESSION_DURATION_MS = 20 * 60 * 1000;

/** Grace period after MAX_SESSION_DURATION_MS before force-closing (30 seconds). */
export const SESSION_GRACE_PERIOD_MS = 30 * 1000;

/** WebSocket close code: daily session quota exceeded (RFC 6455 app range 4000-4999). */
export const WS_CLOSE_QUOTA_EXCEEDED = 4008;

/** WebSocket close code: session duration limit reached (RFC 6455 app range 4000-4999). */
export const WS_CLOSE_SESSION_TIMEOUT = 4009;

/** WebSocket close code: lifecycle status prevents new conversations (RFC 6455 app range 4000-4999). */
export const WS_CLOSE_LIFECYCLE_BLOCKED = 4004;

/** JST timezone identifier for day-boundary calculations. */
export const JST_TIMEZONE = "Asia/Tokyo";
