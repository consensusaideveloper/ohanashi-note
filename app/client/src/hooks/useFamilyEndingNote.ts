import { useState, useEffect, useCallback } from "react";

import {
  getAccessibleCategories,
  getFamilyConversations,
} from "../lib/family-api";
import { QUESTION_CATEGORIES, getQuestionsByCategory } from "../lib/questions";

import type { FamilyConversation } from "../lib/family-api";
import type { NoteEntry } from "../types/conversation";
import type {
  CategoryNoteData,
  NoteEntryVersion,
  NoteEntryWithSource,
  UnansweredQuestion,
} from "./useEndingNote";

interface UseFamilyEndingNoteReturn {
  categories: CategoryNoteData[];
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

    // Filter conversations belonging to this category
    const categoryConversations = conversations.filter(
      (c) => c.category === cat.id,
    );

    // Sort oldest-first for version tracking (same pattern as buildCategoryData)
    const oldestFirst = [...categoryConversations].sort(
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
      const previousVersions = allVersions.slice(0, -1);
      noteEntries.push({
        questionId: latest.entry.questionId,
        questionTitle: latest.entry.questionTitle,
        answer: latest.entry.answer,
        conversationId: latest.convId,
        audioAvailable: false,
        previousVersions,
        hasHistory: previousVersions.length > 0,
      });
    }

    // Compute answered/unanswered from coveredQuestionIds
    const coveredIds = new Set<string>();
    for (const conv of categoryConversations) {
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
        setCategories(
          buildFamilyCategoryData(accessInfo.categories, conversations),
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

  return { categories, isLoading, error, refresh: loadData };
}
