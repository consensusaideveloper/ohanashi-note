import { eq, and, like } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  conversations,
  notifications,
  notificationPreferences,
} from "../db/schema.js";
import { QUESTIONS } from "./questions.js";
import { sendPushToUser } from "./push-sender.js";
import { logger } from "./logger.js";

import type { QuestionCategory } from "../types/conversation.js";

// --- Constants ---

/** Overall milestone definitions with thresholds and push messages. */
const OVERALL_MILESTONES = [
  {
    id: "milestone_first_question",
    threshold: 1,
    title: "はじめの一歩",
    body: "最初の項目を記録しました。これからもゆっくりお話ししましょう。",
  },
  {
    id: "milestone_ten_questions",
    threshold: 10,
    title: "10の記録",
    body: "10項目を記録しました！いいペースです。",
  },
  {
    id: "milestone_quarter_complete",
    threshold: 28,
    title: "4分の1達成！",
    body: "全体の25%を記録しました。素晴らしい進み具合です。",
  },
  {
    id: "milestone_half_complete",
    threshold: 55,
    title: "半分達成！",
    body: "もう半分まで来ました！大切な記録が増えています。",
  },
  {
    id: "milestone_three_quarters",
    threshold: 83,
    title: "あと少しです！",
    body: "全体の75%を記録しました。ゴールが見えてきました。",
  },
  {
    id: "milestone_complete",
    threshold: 110,
    title: "すべて達成！",
    body: "すべての項目を記録しました。大切な想いが詰まったノートが完成です。",
  },
] as const;

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

/** All category IDs. */
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

// --- Helpers ---

interface MilestoneCandidate {
  notificationType: string;
  title: string;
  body: string;
}

/**
 * Check which milestones have been achieved based on the total answered count.
 */
function getAchievedOverallMilestones(
  answeredCount: number,
): MilestoneCandidate[] {
  const achieved: MilestoneCandidate[] = [];
  for (const m of OVERALL_MILESTONES) {
    if (answeredCount >= m.threshold) {
      achieved.push({
        notificationType: m.id,
        title: m.title,
        body: m.body,
      });
    }
  }
  return achieved;
}

/**
 * Check which category completion milestones have been achieved.
 */
function getAchievedCategoryMilestones(
  answeredIds: Set<string>,
): MilestoneCandidate[] {
  const achieved: MilestoneCandidate[] = [];

  for (const catId of ALL_CATEGORIES) {
    const catQuestions = QUESTIONS.filter((q) => q.category === catId);
    if (catQuestions.length === 0) continue;

    const allAnswered = catQuestions.every((q) => answeredIds.has(q.id));
    if (allAnswered) {
      const label = CATEGORY_LABELS[catId] ?? catId;
      achieved.push({
        notificationType: `milestone_category_${catId}_complete`,
        title: `${label}完了`,
        body: `${label}のすべての項目を記録しました。`,
      });
    }
  }

  return achieved;
}

/**
 * Check whether a user has push milestones enabled.
 * Returns true if no preference row exists (defaults to enabled).
 */
async function isPushMilestonesEnabled(userId: string): Promise<boolean> {
  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, userId),
    columns: { pushEnabled: true, pushMilestones: true },
  });

  if (prefs === undefined) return true;
  return prefs.pushEnabled && prefs.pushMilestones;
}

// --- Public API ---

/**
 * Check for newly achieved milestones and send notifications.
 * Best-effort: errors are logged but never thrown.
 *
 * @param userId - The internal user ID (note creator)
 * @param creatorId - The creator ID for notification context
 */
export async function checkAndNotifyMilestones(
  userId: string,
  creatorId: string,
): Promise<void> {
  try {
    // 1. Gather all answered question IDs
    const rows = await db
      .select({ coveredQuestionIds: conversations.coveredQuestionIds })
      .from(conversations)
      .where(eq(conversations.userId, userId));

    const answeredIds = new Set<string>();
    for (const row of rows) {
      if (row.coveredQuestionIds !== null) {
        for (const qid of row.coveredQuestionIds) {
          answeredIds.add(qid);
        }
      }
    }

    const answeredCount = answeredIds.size;

    // 2. Compute achieved milestones
    const overallMilestones = getAchievedOverallMilestones(answeredCount);
    const categoryMilestones = getAchievedCategoryMilestones(answeredIds);
    const allAchieved = [...overallMilestones, ...categoryMilestones];

    if (allAchieved.length === 0) return;

    // 3. Check which milestones have already been notified
    const existingNotifications = await db
      .select({ type: notifications.type })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          like(notifications.type, "milestone_%"),
        ),
      );

    const notifiedTypes = new Set(existingNotifications.map((n) => n.type));

    // 4. Send notifications for new milestones
    const pushEnabled = await isPushMilestonesEnabled(userId);

    for (const milestone of allAchieved) {
      if (notifiedTypes.has(milestone.notificationType)) continue;

      try {
        // Insert in-app notification
        await db.insert(notifications).values({
          userId,
          type: milestone.notificationType,
          title: milestone.title,
          message: milestone.body,
          relatedCreatorId: creatorId,
        });

        // Send push notification if enabled
        if (pushEnabled) {
          await sendPushToUser(userId, milestone.title, milestone.body, {
            type: milestone.notificationType,
          });
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to send milestone notification", {
          userId,
          milestone: milestone.notificationType,
          error: msg,
        });
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to check milestones", {
      userId,
      error: msg,
    });
  }
}
