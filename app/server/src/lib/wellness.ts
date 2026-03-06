import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations, users, wellnessSettings } from "../db/schema.js";
import { QUESTIONS } from "./questions.js";

import type { QuestionCategory } from "../types/conversation.js";

export type WellnessShareLevel = "basic" | "summary" | "detailed";
export type WellnessStatus = "stable" | "warning" | "urgent";

const DEFAULT_ESCALATION_RULE = { day2: "warn", day3: "urgent" } as const;
const DEFAULT_CONSENT_VERSION = "2026-03-v1";
const DEFAULT_TIMEZONE = "Asia/Tokyo";
const DEFAULT_WEEKLY_SUMMARY_DAY = 0;
const LOOKBACK_DAYS = 35;
const WEEK_WINDOW_DAYS = 7;
const CATEGORY_LABELS = new Map<QuestionCategory, string>(
  QUESTIONS.reduce<Array<[QuestionCategory, string]>>((acc, question) => {
    if (!acc.some(([category]) => category === question.category)) {
      acc.push([question.category, question.category]);
    }
    return acc;
  }, []).map(([category]) => [category, getCategoryLabel(category)]),
);

interface WellnessSettingsPayload {
  enabled: boolean;
  shareLevel: WellnessShareLevel;
  timezone: string;
  weeklySummaryDay: number;
  escalationRule: Record<string, string>;
  pausedUntil: string | null;
  consentVersion: string;
}

export interface WellnessOwnerStatusPayload {
  engagedDaysLast7: number;
  missedStreak: number;
  lastConversationAt: string | null;
}

export interface WellnessFamilySummaryPayload {
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

function getCategoryLabel(category: QuestionCategory): string {
  switch (category) {
    case "memories":
      return "思い出";
    case "people":
      return "大事な人・ペット";
    case "house":
      return "生活";
    case "medical":
      return "医療・介護";
    case "funeral":
      return "葬儀・供養";
    case "money":
      return "お金・資産";
    case "work":
      return "仕事・事業";
    case "digital":
      return "デジタル";
    case "legal":
      return "相続・遺言";
    case "trust":
      return "信託・委任";
    case "support":
      return "支援制度";
  }
}

function normalizeShareLevel(value: unknown): WellnessShareLevel | null {
  if (value === "basic" || value === "summary" || value === "detailed") {
    return value;
  }
  return null;
}

export function toDateKey(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(dateKey: string, offsetDays: number): string {
  const shifted = new Date(`${dateKey}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().slice(0, 10);
}

export function buildDateWindow(endDateKey: string, days: number): string[] {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(shiftDateKey(endDateKey, -offset));
  }
  return keys;
}

function toIsoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function coerceEscalationRule(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...DEFAULT_ESCALATION_RULE };
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  if (entries.length === 0) {
    return { ...DEFAULT_ESCALATION_RULE };
  }
  return Object.fromEntries(entries);
}

export function getStatusFromMissedStreak(
  missedStreak: number,
): WellnessStatus {
  if (missedStreak >= 3) {
    return "urgent";
  }
  if (missedStreak >= 2) {
    return "warning";
  }
  return "stable";
}

function buildSummaryText(
  status: WellnessStatus,
  engagedDays: number,
  missedStreak: number,
): string {
  if (status === "urgent") {
    return `${String(missedStreak)}日以上会話が確認できていません。早めのご確認をお願いします。`;
  }
  if (status === "warning") {
    return `${String(missedStreak)}日連続で会話がありません。ご連絡をおすすめします。`;
  }
  return `今週は${String(engagedDays)}日会話があり、安定してやり取りできています。`;
}

export async function listRecentConversations(creatorId: string): Promise<
  Array<{
    id: string;
    startedAt: Date;
    oneLinerSummary: string | null;
    discussedCategories: string[] | null;
  }>
> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  return db
    .select({
      id: conversations.id,
      startedAt: conversations.startedAt,
      oneLinerSummary: conversations.oneLinerSummary,
      discussedCategories: conversations.discussedCategories,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, creatorId),
        gte(conversations.startedAt, cutoff),
        sql`${conversations.endedAt} is not null`,
      ),
    )
    .orderBy(desc(conversations.startedAt));
}

export function buildHighlights(
  shareLevel: WellnessShareLevel,
  rows: Array<{
    oneLinerSummary: string | null;
    discussedCategories: string[] | null;
  }>,
): string[] {
  if (shareLevel === "basic") {
    return [];
  }

  const highlights: string[] = [];

  if (shareLevel === "detailed") {
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const category of row.discussedCategories ?? []) {
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }

    for (const [category] of [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)) {
      const label =
        CATEGORY_LABELS.get(category as QuestionCategory) ?? category;
      highlights.push(`${label}の話題がありました`);
    }
  }

  for (const row of rows) {
    if (typeof row.oneLinerSummary === "string" && row.oneLinerSummary !== "") {
      highlights.push(row.oneLinerSummary);
    }
    if (highlights.length >= 2) {
      break;
    }
  }

  return highlights.slice(0, 2);
}

export function calculateMetrics(
  rows: Array<{
    startedAt: Date;
    oneLinerSummary: string | null;
    discussedCategories: string[] | null;
  }>,
  timeZone: string,
  referenceDateKey?: string,
): {
  engagedDaysLast7: number;
  missedStreak: number;
  lastConversationAt: string | null;
  weekStart: string;
  weekEnd: string;
  recentRows: Array<{
    oneLinerSummary: string | null;
    discussedCategories: string[] | null;
  }>;
} {
  const effectiveEndDateKey =
    referenceDateKey ?? toDateKey(new Date(), timeZone);
  const last7Days = buildDateWindow(effectiveEndDateKey, WEEK_WINDOW_DAYS);
  const dateSet = new Set(
    rows.map((row) => toDateKey(row.startedAt, timeZone)),
  );

  if (rows.length === 0) {
    return {
      engagedDaysLast7: 0,
      missedStreak: 0,
      lastConversationAt: null,
      weekStart: last7Days[0] ?? effectiveEndDateKey,
      weekEnd: last7Days[last7Days.length - 1] ?? effectiveEndDateKey,
      recentRows: [],
    };
  }

  let missedStreak = 0;
  let cursor = effectiveEndDateKey;
  for (let index = 0; index < LOOKBACK_DAYS; index += 1) {
    if (dateSet.has(cursor)) {
      break;
    }
    missedStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  const lastConversationAt = rows[0]?.startedAt ?? null;
  const recentRows = rows.filter((row) =>
    last7Days.includes(toDateKey(row.startedAt, timeZone)),
  );

  return {
    engagedDaysLast7: last7Days.filter((dateKey) => dateSet.has(dateKey))
      .length,
    missedStreak,
    lastConversationAt: toIsoOrNull(lastConversationAt),
    weekStart: last7Days[0] ?? effectiveEndDateKey,
    weekEnd: last7Days[last7Days.length - 1] ?? effectiveEndDateKey,
    recentRows,
  };
}

export function toWellnessSettingsResponse(
  row: typeof wellnessSettings.$inferSelect,
): WellnessSettingsPayload {
  return {
    enabled: row.enabled,
    shareLevel: normalizeShareLevel(row.shareLevel) ?? "basic",
    timezone: row.timezone,
    weeklySummaryDay: row.weeklySummaryDay,
    escalationRule: coerceEscalationRule(row.escalationRule),
    pausedUntil: toIsoOrNull(row.pausedUntil),
    consentVersion: row.consentVersion,
  };
}

export async function getWellnessSettingsOrNull(
  creatorId: string,
): Promise<typeof wellnessSettings.$inferSelect | undefined> {
  return db.query.wellnessSettings.findFirst({
    where: eq(wellnessSettings.creatorId, creatorId),
  });
}

export async function buildOwnerStatus(
  creatorId: string,
  settingsRow?: typeof wellnessSettings.$inferSelect,
): Promise<WellnessOwnerStatusPayload> {
  const timeZone = settingsRow?.timezone ?? DEFAULT_TIMEZONE;
  const rows = await listRecentConversations(creatorId);
  const metrics = calculateMetrics(rows, timeZone);

  return {
    engagedDaysLast7: metrics.engagedDaysLast7,
    missedStreak: metrics.missedStreak,
    lastConversationAt: metrics.lastConversationAt,
  };
}

export async function buildFamilySummary(
  creatorId: string,
  settingsRow: typeof wellnessSettings.$inferSelect,
): Promise<WellnessFamilySummaryPayload | null> {
  if (!settingsRow.enabled) {
    return null;
  }

  if (
    settingsRow.pausedUntil !== null &&
    settingsRow.pausedUntil.getTime() > Date.now()
  ) {
    return null;
  }

  const creator = await db.query.users.findFirst({
    where: eq(users.id, creatorId),
    columns: { name: true },
  });
  const rows = await listRecentConversations(creatorId);
  const metrics = calculateMetrics(rows, settingsRow.timezone);
  const shareLevel = normalizeShareLevel(settingsRow.shareLevel) ?? "basic";
  const status = getStatusFromMissedStreak(metrics.missedStreak);
  const summary =
    rows.length === 0
      ? "まだ見守りデータがありません。会話が始まるとここに状況が表示されます。"
      : buildSummaryText(
          status,
          metrics.engagedDaysLast7,
          metrics.missedStreak,
        );

  return {
    creatorId,
    creatorName: creator?.name || "ご利用者",
    weekStart: metrics.weekStart,
    weekEnd: metrics.weekEnd,
    engagedDays: metrics.engagedDaysLast7,
    missedStreak: metrics.missedStreak,
    status,
    summary,
    highlights: buildHighlights(shareLevel, metrics.recentRows),
  };
}

export function mergeWellnessSettings(
  current: typeof wellnessSettings.$inferSelect | undefined,
  input: Record<string, unknown>,
): typeof wellnessSettings.$inferInsert {
  const currentShareLevel = normalizeShareLevel(current?.shareLevel) ?? "basic";
  const nextShareLevel =
    normalizeShareLevel(input["shareLevel"]) ?? currentShareLevel;

  const nextWeeklySummaryDayRaw = input["weeklySummaryDay"];
  const nextWeeklySummaryDay =
    typeof nextWeeklySummaryDayRaw === "number" &&
    Number.isInteger(nextWeeklySummaryDayRaw) &&
    nextWeeklySummaryDayRaw >= 0 &&
    nextWeeklySummaryDayRaw <= 6
      ? nextWeeklySummaryDayRaw
      : (current?.weeklySummaryDay ?? DEFAULT_WEEKLY_SUMMARY_DAY);

  const nextPausedUntilRaw = input["pausedUntil"];
  const nextPausedUntil =
    nextPausedUntilRaw === null
      ? null
      : typeof nextPausedUntilRaw === "string" && nextPausedUntilRaw !== ""
        ? new Date(nextPausedUntilRaw)
        : (current?.pausedUntil ?? null);

  return {
    creatorId: current?.creatorId ?? String(input["creatorId"]),
    enabled:
      typeof input["enabled"] === "boolean"
        ? input["enabled"]
        : (current?.enabled ?? false),
    shareLevel: nextShareLevel,
    timezone:
      typeof input["timezone"] === "string" && input["timezone"] !== ""
        ? input["timezone"]
        : (current?.timezone ?? DEFAULT_TIMEZONE),
    weeklySummaryDay: nextWeeklySummaryDay,
    escalationRule:
      input["escalationRule"] !== undefined
        ? coerceEscalationRule(input["escalationRule"])
        : coerceEscalationRule(current?.escalationRule),
    pausedUntil:
      nextPausedUntil instanceof Date &&
      !Number.isNaN(nextPausedUntil.getTime())
        ? nextPausedUntil
        : null,
    consentVersion:
      typeof input["consentVersion"] === "string" &&
      input["consentVersion"] !== ""
        ? input["consentVersion"]
        : (current?.consentVersion ?? DEFAULT_CONSENT_VERSION),
    updatedAt: new Date(),
  };
}
