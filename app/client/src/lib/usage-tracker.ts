// Client-side daily session usage tracker using localStorage.
// This is a temporary measure until server-side per-user quotas are implemented.

import { MAX_DAILY_SESSIONS } from "./constants";

const STORAGE_KEY = "daily-session-usage";

interface DailyUsage {
  date: string;
  count: number;
}

/** Get today's date string in YYYY-MM-DD format (JST). */
function getTodayString(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** Read current daily usage from localStorage. */
function readUsage(): DailyUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { date: getTodayString(), count: 0 };
    }
    const parsed = JSON.parse(raw) as DailyUsage;
    // Reset if the stored date is not today
    if (parsed.date !== getTodayString()) {
      return { date: getTodayString(), count: 0 };
    }
    return parsed;
  } catch {
    return { date: getTodayString(), count: 0 };
  }
}

/** Write daily usage to localStorage. */
function writeUsage(usage: DailyUsage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/** Check whether a new session can be started today. */
export function canStartSession(): boolean {
  const usage = readUsage();
  return usage.count < MAX_DAILY_SESSIONS;
}

/** Increment the daily session count. Call this when a session starts. */
export function incrementDailySession(): void {
  const usage = readUsage();
  usage.count += 1;
  writeUsage(usage);
}

/** Get the number of remaining sessions for today. */
export function getRemainingSessionCount(): number {
  const usage = readUsage();
  return Math.max(0, MAX_DAILY_SESSIONS - usage.count);
}
