import { useState, useEffect, useCallback } from "react";

import { buildFlexibleNoteItems } from "../lib/flexible-notes";
import {
  getAccessibleCategories,
  getFamilyConversations,
} from "../lib/family-api";
import {
  QUESTION_CATEGORIES,
  getQuestionsByCategory,
  getQuestionType,
} from "../lib/questions";

import type { FamilyConversation } from "../lib/family-api";
import type { NoteEntry } from "../types/conversation";
import type { FlexibleNoteItem } from "../lib/flexible-notes";
import type {
  AccumulativeEntry,
  CategoryNoteData,
  NoteEntryVersion,
  NoteEntryWithSource,
  UnansweredQuestion,
} from "./useEndingNote";

interface UseFamilyEndingNoteReturn {
  categories: CategoryNoteData[];
  flexibleNotes: FlexibleNoteItem[];
  isRepresentative: boolean;
  isLoading: boolean;
  error: boolean;
  refresh: () => void;
}

function isNoteEntry(value: unknown): value is NoteEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["questionId"] === "string" &&
    typeof obj["questionTitle"] === "string" &&
    typeof obj["answer"] === "string"
  );
}

import type { InsightStatement } from "../types/conversation";

const VALID_INSIGHT_CATEGORIES = new Set([
  "hobbies",
  "values",
  "relationships",
  "memories",
  "concerns",
  "other",
]);

const VALID_INSIGHT_IMPORTANCES = new Set(["high", "medium", "low"]);

function isInsightStatement(item: unknown): item is InsightStatement {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj["text"] === "string" &&
    typeof obj["category"] === "string" &&
    VALID_INSIGHT_CATEGORIES.has(obj["category"]) &&
    typeof obj["importance"] === "string" &&
    VALID_INSIGHT_IMPORTANCES.has(obj["importance"])
  );
}

function getImportantStatements(
  value: unknown,
): Array<string | InsightStatement> {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const raw = (value as Record<string, unknown>)["importantStatements"];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is string | InsightStatement =>
      typeof item === "string" || isInsightStatement(item),
  );
}

/**
 * Transform family API conversation data into the same CategoryNoteData[]
 * format used by the creator's EndingNoteView (useEndingNote hook).
 *
 * Only accessible categories are included in the output.
 */
export function buildFamilyCategoryData(
  accessibleCategoryIds: readonly string[],
  conversations: readonly FamilyConversation[],
): CategoryNoteData[] {
  const accessibleSet = new Set(accessibleCategoryIds);
  const filteredCategories = QUESTION_CATEGORIES.filter((cat) =>
    accessibleSet.has(cat.id),
  );

  return filteredCategories.map((cat) => {
    const questions = getQuestionsByCategory(cat.id);
    const questionIdSet = new Set(questions.map((q) => q.id));

    // Search ALL conversations — noteEntries' questionId determines category
    // membership, not conversation.category (same approach as buildCategoryData)
    const oldestFirst = [...conversations].sort(
      (a, b) => a.startedAt - b.startedAt,
    );

    // Build version map: collect all versions per questionId
    const allVersionsMap = new Map<string, NoteEntryVersion[]>();
    const latestMetaMap = new Map<
      string,
      { entry: NoteEntry; convId: string }
    >();

    for (const conv of oldestFirst) {
      for (const rawEntry of conv.noteEntries) {
        if (!isNoteEntry(rawEntry)) {
          continue;
        }
        if (!questionIdSet.has(rawEntry.questionId)) {
          continue;
        }

        const version: NoteEntryVersion = {
          answer: rawEntry.answer,
          conversationId: conv.id,
          audioAvailable: false,
          recordedAt: conv.startedAt,
        };

        const existing = allVersionsMap.get(rawEntry.questionId);
        if (existing !== undefined) {
          existing.push(version);
        } else {
          allVersionsMap.set(rawEntry.questionId, [version]);
        }

        latestMetaMap.set(rawEntry.questionId, {
          entry: rawEntry,
          convId: conv.id,
        });
      }
    }

    // Build NoteEntryWithSource[] from the latest versions
    const noteEntries: NoteEntryWithSource[] = [];
    for (const [qId, latest] of latestMetaMap.entries()) {
      const allVersions = allVersionsMap.get(qId) ?? [];
      // Always use client-side question title to ensure consistency
      // between answered and unanswered display states.
      const clientQuestion = questions.find((q) => q.id === qId);
      const questionTitle = clientQuestion?.title ?? latest.entry.questionTitle;
      const qType = getQuestionType(qId);

      if (qType === "accumulative") {
        const allEntries: AccumulativeEntry[] = [...allVersions]
          .reverse()
          .map((v) => ({
            answer: v.answer,
            conversationId: v.conversationId,
            audioAvailable: false,
            recordedAt: v.recordedAt,
            sourceEvidence: undefined,
          }));
        noteEntries.push({
          questionId: latest.entry.questionId,
          questionTitle,
          answer: latest.entry.answer,
          conversationId: latest.convId,
          audioAvailable: false,
          questionType: qType,
          previousVersions: [],
          hasHistory: false,
          allEntries,
        });
      } else {
        const previousVersions = allVersions.slice(0, -1);
        noteEntries.push({
          questionId: latest.entry.questionId,
          questionTitle,
          answer: latest.entry.answer,
          conversationId: latest.convId,
          audioAvailable: false,
          questionType: qType,
          previousVersions,
          hasHistory: previousVersions.length > 0,
          allEntries: [],
        });
      }
    }

    // Compute answered/unanswered from coveredQuestionIds across ALL conversations
    const coveredIds = new Set<string>();
    for (const conv of conversations) {
      for (const id of conv.coveredQuestionIds) {
        if (questionIdSet.has(id)) {
          coveredIds.add(id);
        }
      }
    }

    const answeredCount = questions.filter((q) => coveredIds.has(q.id)).length;

    const unansweredQuestions: UnansweredQuestion[] = questions
      .filter((q) => !coveredIds.has(q.id))
      .map((q) => ({ id: q.id, title: q.title }));

    return {
      category: cat.id,
      label: cat.label,
      totalQuestions: questions.length,
      answeredCount,
      noteEntries,
      unansweredQuestions,
      ...(cat.disclaimer !== undefined ? { disclaimer: cat.disclaimer } : {}),
    };
  });
}

export function useFamilyEndingNote(
  creatorId: string,
): UseFamilyEndingNoteReturn {
  const [categories, setCategories] = useState<CategoryNoteData[]>([]);
  const [flexibleNotes, setFlexibleNotes] = useState<FlexibleNoteItem[]>([]);
  const [isRepresentative, setIsRepresentative] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadData = useCallback((): void => {
    setIsLoading(true);
    setError(false);

    void Promise.all([
      getAccessibleCategories(creatorId),
      getFamilyConversations(creatorId),
    ])
      .then(([accessInfo, conversations]) => {
        setIsRepresentative(accessInfo.isRepresentative);
        setCategories(
          buildFamilyCategoryData(accessInfo.categories, conversations),
        );
        setFlexibleNotes(
          buildFlexibleNoteItems(
            conversations.map((conversation) => ({
              conversationId: conversation.id,
              startedAt: conversation.startedAt,
              importantStatements: getImportantStatements(
                conversation.keyPoints,
              ),
              noteEntries: conversation.noteEntries.filter(isNoteEntry),
            })),
          ),
        );
      })
      .catch((err: unknown) => {
        console.error("Failed to load family ending note data:", {
          error: err,
          creatorId,
        });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [creatorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    categories,
    flexibleNotes,
    isRepresentative,
    isLoading,
    error,
    refresh: loadData,
  };
}
