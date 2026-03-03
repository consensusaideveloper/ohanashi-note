import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";

import { db } from "../db/connection.js";
import { conversations } from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { QUESTIONS } from "../lib/questions.js";
import { logger } from "../lib/logger.js";

import type { Context } from "hono";
import type { QuestionCategory } from "../types/conversation.js";

// --- Constants ---

/** Category ID to Japanese label mapping. */
const CATEGORY_LABELS: Record<string, string> = {
  memories: "思い出",
  people: "大事な人・ペット",
  house: "生活",
  medical: "医療・介護",
  funeral: "葬儀・供養",
  money: "お金・資産",
  work: "仕事・事業",
  digital: "デジタル",
  legal: "相続・遺言",
  trust: "信託・委任",
  support: "支援制度",
};

/** All category IDs in display order. */
const ALL_CATEGORIES: QuestionCategory[] = [
  "memories",
  "people",
  "house",
  "medical",
  "funeral",
  "money",
  "work",
  "digital",
  "legal",
  "trust",
  "support",
];

/** Milestone definitions with their thresholds. */
const MILESTONES = [
  { id: "first_question", label: "はじめの一歩", threshold: 1 },
  { id: "ten_questions", label: "10の記録", threshold: 10 },
  { id: "quarter_complete", label: "4分の1達成", threshold: 28 },
  { id: "half_complete", label: "半分達成", threshold: 55 },
  { id: "three_quarters", label: "あと少し", threshold: 83 },
  { id: "complete", label: "すべて達成", threshold: 110 },
] as const;

// --- Helpers ---

/** Build a set of all answered question IDs from all conversations. */
function collectAnsweredIds(
  rows: Array<{ coveredQuestionIds: string[] | null }>,
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.coveredQuestionIds !== null) {
      for (const qid of row.coveredQuestionIds) {
        ids.add(qid);
      }
    }
  }
  return ids;
}

/** Count answered questions per category. */
function countByCategory(
  answeredIds: Set<string>,
): Map<QuestionCategory, { answered: number; total: number }> {
  const counts = new Map<
    QuestionCategory,
    { answered: number; total: number }
  >();

  for (const cat of ALL_CATEGORIES) {
    counts.set(cat, { answered: 0, total: 0 });
  }

  for (const q of QUESTIONS) {
    const entry = counts.get(q.category);
    if (entry !== undefined) {
      entry.total++;
      if (answeredIds.has(q.id)) {
        entry.answered++;
      }
    }
  }

  return counts;
}

/**
 * Find the achieved date for a milestone by scanning conversations
 * in chronological order and tracking cumulative answered count.
 */
function findMilestoneAchievedDates(
  rows: Array<{
    coveredQuestionIds: string[] | null;
    endedAt: Date | null;
  }>,
): Map<number, Date | null> {
  const thresholdDates = new Map<number, Date | null>();
  const thresholds = MILESTONES.map((m) => m.threshold);
  const cumulativeIds = new Set<string>();
  let nextThresholdIndex = 0;

  // Sort rows by startedAt ascending (we retrieved them in asc order)
  for (const row of rows) {
    if (row.coveredQuestionIds !== null) {
      for (const qid of row.coveredQuestionIds) {
        cumulativeIds.add(qid);
      }
    }

    // Check if any remaining thresholds are met
    while (nextThresholdIndex < thresholds.length) {
      const threshold = thresholds[nextThresholdIndex] as number;
      if (cumulativeIds.size < threshold) break;
      thresholdDates.set(threshold, row.endedAt ?? null);
      nextThresholdIndex++;
    }
  }

  return thresholdDates;
}

// --- Route ---

const progressRoute = new Hono();

/** GET /api/progress — Get the authenticated user's progress overview. */
progressRoute.get("/api/progress", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);

    // Fetch all conversations for this user, ordered chronologically
    const rows = await db
      .select({
        coveredQuestionIds: conversations.coveredQuestionIds,
        endedAt: conversations.endedAt,
      })
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(asc(conversations.startedAt));

    // Collect all answered question IDs
    const answeredIds = collectAnsweredIds(rows);

    // Category-level progress
    const categoryCounts = countByCategory(answeredIds);
    const categories = ALL_CATEGORIES.map((catId) => {
      const entry = categoryCounts.get(catId);
      const answered = entry?.answered ?? 0;
      const total = entry?.total ?? 0;
      const percentage = total > 0 ? Math.round((answered / total) * 100) : 0;
      return {
        id: catId,
        label: CATEGORY_LABELS[catId] ?? catId,
        answered,
        total,
        percentage,
      };
    });

    // Overall progress
    const totalQuestions = QUESTIONS.length;
    const totalAnswered = answeredIds.size;
    const overallPercentage =
      totalQuestions > 0
        ? Math.round((totalAnswered / totalQuestions) * 100)
        : 0;

    // Milestones
    const thresholdDates = findMilestoneAchievedDates(rows);

    const milestones = MILESTONES.map((m) => ({
      id: m.id,
      label: m.label,
      achieved: totalAnswered >= m.threshold,
      achievedDate: thresholdDates.get(m.threshold)?.toISOString() ?? null,
    }));

    // Category completion milestones
    const categoryMilestones = ALL_CATEGORIES.map((catId) => {
      const entry = categoryCounts.get(catId);
      const answered = entry?.answered ?? 0;
      const total = entry?.total ?? 0;
      const achieved = total > 0 && answered >= total;

      // Find achieved date: the first conversation where all questions in the category are covered
      let achievedDate: string | null = null;
      if (achieved) {
        const catQuestionIds = new Set(
          QUESTIONS.filter((q) => q.category === catId).map((q) => q.id),
        );
        const seenIds = new Set<string>();
        for (const row of rows) {
          if (row.coveredQuestionIds !== null) {
            for (const qid of row.coveredQuestionIds) {
              if (catQuestionIds.has(qid)) {
                seenIds.add(qid);
              }
            }
          }
          if (seenIds.size >= catQuestionIds.size) {
            achievedDate = row.endedAt?.toISOString() ?? null;
            break;
          }
        }
      }

      return {
        id: `category_${catId}_complete`,
        label: `${CATEGORY_LABELS[catId] ?? catId}完了`,
        achieved,
        achievedDate,
      };
    });

    return c.json({
      categories,
      overall: {
        answered: totalAnswered,
        total: totalQuestions,
        percentage: overallPercentage,
      },
      milestones: [...milestones, ...categoryMilestones],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get progress", { error: message });
    return c.json(
      {
        error: "進捗情報の取得に失敗しました",
        code: "PROGRESS_GET_FAILED",
      },
      500,
    );
  }
});

export { progressRoute };
