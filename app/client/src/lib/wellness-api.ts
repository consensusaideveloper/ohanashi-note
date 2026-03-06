import { fetchWithAuth, ApiError } from "./api";

// --- Types ---

export type WellnessShareLevel = "basic" | "summary" | "detailed";

export type WellnessStatus = "stable" | "warning" | "urgent";

export interface WellnessSettings {
  enabled: boolean;
  shareLevel: WellnessShareLevel;
  timezone: string;
  weeklySummaryDay: number;
  pausedUntil: string | null;
  escalationRule: Record<string, string>;
  consentVersion: string;
}

export interface WellnessOwnerStatus {
  engagedDaysLast7: number;
  missedStreak: number;
  lastConversationAt: string | null;
}

export interface WellnessFamilySummary {
  creatorId: string;
  creatorName: string;
  weekStart: string;
  weekEnd: string;
  engagedDays: number;
  missedStreak: number;
  status: WellnessStatus;
  summary: string;
  highlights: string[];
}

export interface WellnessCheckin {
  checkinDate: string;
  status: "engaged" | "missed" | "paused";
  conversationId: string | null;
  signals: Record<string, unknown>;
  summaryForFamily: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- API functions ---

/**
 * Get the current user's wellness settings.
 * Returns null if wellness has never been configured (404).
 */
export async function getWellnessSettings(): Promise<WellnessSettings | null> {
  try {
    const response = await fetchWithAuth("/api/wellness/settings");
    return (await response.json()) as WellnessSettings;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Create or update wellness settings.
 */
export async function updateWellnessSettings(
  data: Partial<WellnessSettings>,
): Promise<WellnessSettings> {
  const response = await fetchWithAuth("/api/wellness/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return (await response.json()) as WellnessSettings;
}

/**
 * Pause wellness monitoring until a specified date.
 */
export async function pauseWellness(pausedUntil: string): Promise<void> {
  await fetchWithAuth("/api/wellness/pause", {
    method: "POST",
    body: JSON.stringify({ pausedUntil }),
  });
}

/**
 * Resume wellness monitoring (clear pause).
 */
export async function resumeWellness(): Promise<void> {
  await fetchWithAuth("/api/wellness/resume", {
    method: "POST",
  });
}

/**
 * Get the owner's wellness status (recent activity summary).
 * Returns null if wellness is not configured (404).
 */
export async function getWellnessOwnerStatus(): Promise<WellnessOwnerStatus | null> {
  try {
    const response = await fetchWithAuth("/api/wellness/status");
    return (await response.json()) as WellnessOwnerStatus;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get the weekly wellness summary for a specific creator (family view).
 * Returns null if the creator has no wellness data or it is not enabled (404).
 */
export async function getWellnessFamilySummary(
  creatorId: string,
): Promise<WellnessFamilySummary | null> {
  try {
    const response = await fetchWithAuth(
      `/api/wellness/${encodeURIComponent(creatorId)}/weekly-summary`,
    );
    return (await response.json()) as WellnessFamilySummary;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getWellnessCheckins(
  days = 30,
): Promise<WellnessCheckin[]> {
  const safeDays =
    Number.isInteger(days) && days >= 1 && days <= 90 ? days : 30;
  const response = await fetchWithAuth(
    `/api/wellness/checkins?days=${String(safeDays)}`,
  );
  return (await response.json()) as WellnessCheckin[];
}
