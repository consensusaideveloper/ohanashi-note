import { useState, useEffect, useCallback } from "react";

import { listConversations } from "../lib/storage";
import { getQuestionsByCategory, QUESTION_CATEGORIES } from "../lib/questions";

import type {
  QuestionCategory,
  NoteEntry,
  ConversationRecord,
} from "../types/conversation";

/** A single historical version of a note entry from a past conversation. */
export interface NoteEntryVersion {
  answer: string;
  conversationId: string;
  audioAvailable: boolean;
  /** Timestamp (ms epoch) of the conversation that produced this version. */
  recordedAt: number;
}

export interface NoteEntryWithSource extends NoteEntry {
  conversationId: string;
  audioAvailable: boolean;
  /** Past versions in chronological order (oldest first); excludes the current answer. */
  previousVersions: NoteEntryVersion[];
  /** True when the answer has been updated at least once. */
  hasHistory: boolean;
}

export interface UnansweredQuestion {
  id: string;
  title: string;
}

export interface CategoryNoteData {
  category: QuestionCategory;
  label: string;
  totalQuestions: number;
  answeredCount: number;
  noteEntries: NoteEntryWithSource[];
  unansweredQuestions: UnansweredQuestion[];
  /** Optional disclaimer text for categories with legal/institutional caveats. */
  disclaimer?: string;
}

interface UseEndingNoteReturn {
  categories: CategoryNoteData[];
  isLoading: boolean;
  error: boolean;
  refresh: () => void;
}

export function buildCategoryData(
  records: ConversationRecord[],
): CategoryNoteData[] {
  return QUESTION_CATEGORIES.map((cat) => {
    const questions = getQuestionsByCategory(cat.id);
    const questionIdSet = new Set(questions.map((q) => q.id));

    // Collect ALL versions of note entries per questionId (oldest-first).
    // The latest version becomes the current answer; earlier ones go to previousVersions.
    const allVersionsMap = new Map<string, NoteEntryVersion[]>();
    const latestMetaMap = new Map<
      string,
      { entry: NoteEntry; convId: string; audio: boolean }
    >();

    const oldest = [...records].reverse();
    for (const record of oldest) {
      if (record.noteEntries) {
        for (const entry of record.noteEntries) {
          if (questionIdSet.has(entry.questionId)) {
            const version: NoteEntryVersion = {
              answer: entry.answer,
              conversationId: record.id,
              audioAvailable: record.audioAvailable === true,
              recordedAt: record.startedAt,
            };
            const existing = allVersionsMap.get(entry.questionId);
            if (existing !== undefined) {
              existing.push(version);
            } else {
              allVersionsMap.set(entry.questionId, [version]);
            }
            latestMetaMap.set(entry.questionId, {
              entry,
              convId: record.id,
              audio: record.audioAvailable === true,
            });
          }
        }
      }
    }

    const entryMap = new Map<string, NoteEntryWithSource>();
    for (const [qId, latest] of latestMetaMap.entries()) {
      const allVersions = allVersionsMap.get(qId) ?? [];
      const previousVersions = allVersions.slice(0, -1);
      entryMap.set(qId, {
        ...latest.entry,
        conversationId: latest.convId,
        audioAvailable: latest.audio,
        previousVersions,
        hasHistory: previousVersions.length > 0,
      });
    }

    // Collect all covered question IDs for this category from ALL records
    const coveredIds = new Set<string>();
    for (const record of records) {
      if (record.coveredQuestionIds) {
        for (const id of record.coveredQuestionIds) {
          if (questionIdSet.has(id)) {
            coveredIds.add(id);
          }
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
      noteEntries: Array.from(entryMap.values()),
      unansweredQuestions,
      ...(cat.disclaimer !== undefined ? { disclaimer: cat.disclaimer } : {}),
    };
  });
}

export function useEndingNote(): UseEndingNoteReturn {
  const [categories, setCategories] = useState<CategoryNoteData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback((): void => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setError(false);
    listConversations()
      .then((records) => {
        setCategories(buildCategoryData(records));
      })
      .catch((err: unknown) => {
        console.error("Failed to load ending note data:", { error: err });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [refreshKey]);

  return { categories, isLoading, error, refresh };
}
