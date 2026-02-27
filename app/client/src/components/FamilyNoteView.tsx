import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { getAccessibleCategories, getCategoryNote } from "../lib/family-api";
import { QUESTION_CATEGORIES } from "../lib/questions";

import type { ReactNode } from "react";
import type { CategoryAccessInfo, CategoryNoteData } from "../lib/family-api";

interface FamilyNoteViewProps {
  creatorId: string;
  creatorName: string;
  onBack: () => void;
}

interface NoteEntry {
  questionId: string;
  questionTitle: string;
  answer: string;
}

export function FamilyNoteView({
  creatorId,
  creatorName,
  onBack,
}: FamilyNoteViewProps): ReactNode {
  const [accessInfo, setAccessInfo] = useState<CategoryAccessInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [categoryNotes, setCategoryNotes] = useState<
    Record<string, CategoryNoteData>
  >({});
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const loadAccessInfo = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void getAccessibleCategories(creatorId)
      .then((data) => {
        setAccessInfo(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load accessible categories:", {
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
    loadAccessInfo();
  }, [loadAccessInfo]);

  const handleRetry = useCallback((): void => {
    loadAccessInfo();
  }, [loadAccessInfo]);

  const handleToggleCategory = useCallback(
    (categoryId: string): void => {
      if (expandedCategory === categoryId) {
        setExpandedCategory(null);
        return;
      }

      setExpandedCategory(categoryId);
      setCategoryError(null);

      // Fetch note data if not already cached
      if (categoryNotes[categoryId] === undefined) {
        setLoadingCategory(categoryId);
        void getCategoryNote(creatorId, categoryId)
          .then((data) => {
            setCategoryNotes((prev) => ({
              ...prev,
              [categoryId]: data,
            }));
          })
          .catch((err: unknown) => {
            console.error("Failed to load category note:", {
              error: err,
              creatorId,
              categoryId,
            });
            setCategoryError(categoryId);
          })
          .finally(() => {
            setLoadingCategory(null);
          });
      }
    },
    [expandedCategory, categoryNotes, creatorId],
  );

  const handleBack = useCallback((): void => {
    onBack();
  }, [onBack]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lg text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-xl text-text-primary text-center leading-relaxed">
          {UI_MESSAGES.familyError.accessCategoriesFailed}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg px-6 py-3"
          onClick={handleRetry}
        >
          もう一度読み込む
        </button>
        <button
          type="button"
          className="min-h-11 rounded-full border border-border text-text-secondary text-lg px-6 py-3"
          onClick={handleBack}
        >
          {UI_MESSAGES.family.backToCreatorList}
        </button>
      </div>
    );
  }

  const accessibleCategories = accessInfo?.categories ?? [];

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 pt-6 pb-4">
        <button
          type="button"
          className="min-h-11 flex items-center gap-2 text-lg text-accent-primary mb-3 transition-colors active:text-accent-primary-hover"
          onClick={handleBack}
          aria-label={UI_MESSAGES.family.backToCreatorList}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          {UI_MESSAGES.family.backToCreatorList}
        </button>

        <h1 className="text-2xl font-bold text-text-primary mb-1">
          {creatorName}さんのノート
        </h1>
        <p className="text-lg text-text-secondary">
          {UI_MESSAGES.family.noteViewTitle}
        </p>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-3 max-w-lg mx-auto">
          {accessibleCategories.length === 0 && (
            <div className="rounded-card border border-border-light bg-bg-surface p-6 text-center">
              <p className="text-lg text-text-secondary">
                {UI_MESSAGES.family.noAccessibleCategories}
              </p>
            </div>
          )}

          {accessibleCategories.map((categoryId) => {
            const categoryInfo = QUESTION_CATEGORIES.find(
              (c) => c.id === categoryId,
            );
            if (categoryInfo === undefined) {
              return null;
            }

            const isExpanded = expandedCategory === categoryId;
            const isLoadingThis = loadingCategory === categoryId;
            const hasError = categoryError === categoryId;
            const noteData = categoryNotes[categoryId];

            return (
              <CategorySection
                key={categoryId}
                categoryId={categoryId}
                label={categoryInfo.label}
                icon={categoryInfo.icon}
                isExpanded={isExpanded}
                isLoading={isLoadingThis}
                hasError={hasError}
                noteData={noteData}
                onToggle={handleToggleCategory}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- CategorySection sub-component ---

interface CategorySectionProps {
  categoryId: string;
  label: string;
  icon: string;
  isExpanded: boolean;
  isLoading: boolean;
  hasError: boolean;
  noteData: CategoryNoteData | undefined;
  onToggle: (categoryId: string) => void;
}

function CategorySection({
  categoryId,
  label,
  icon,
  isExpanded,
  isLoading,
  hasError,
  noteData,
  onToggle,
}: CategorySectionProps): ReactNode {
  const handleToggle = useCallback((): void => {
    onToggle(categoryId);
  }, [onToggle, categoryId]);

  // Extract note entries from conversations
  const noteEntries: NoteEntry[] = [];
  if (noteData !== undefined) {
    for (const conversation of noteData.conversations) {
      for (const entry of conversation.noteEntries) {
        const typedEntry = entry as {
          questionId?: string;
          questionTitle?: string;
          answer?: string;
        };
        if (
          typedEntry.questionId !== undefined &&
          typedEntry.answer !== undefined
        ) {
          noteEntries.push({
            questionId: typedEntry.questionId,
            questionTitle: typedEntry.questionTitle ?? "",
            answer: typedEntry.answer,
          });
        }
      }
    }
  }

  return (
    <div className="rounded-card border border-border-light bg-bg-surface overflow-hidden">
      <button
        type="button"
        className="w-full min-h-14 flex items-center gap-3 px-4 py-3 text-left transition-colors active:bg-bg-surface-hover"
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        <span className="text-xl flex-none" aria-hidden="true">
          {icon}
        </span>
        <span className="text-xl font-medium text-text-primary flex-1">
          {label}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-text-secondary transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t border-border-light px-4 py-4 space-y-4">
          {isLoading && (
            <p className="text-lg text-text-secondary">読み込み中...</p>
          )}

          {hasError && (
            <p className="text-lg text-error">
              {UI_MESSAGES.familyError.noteFetchFailed}
            </p>
          )}

          {!isLoading && !hasError && noteEntries.length === 0 && (
            <p className="text-lg text-text-secondary">まだ記録がありません</p>
          )}

          {!isLoading &&
            !hasError &&
            noteEntries.map((entry) => (
              <div key={entry.questionId} className="space-y-1">
                <p className="text-lg font-medium text-text-primary">
                  {entry.questionTitle}
                </p>
                <p className="text-lg text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {entry.answer}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
