import { useEffect, useCallback } from "react";

import { useFamilyEndingNote } from "../hooks/useFamilyEndingNote";
import { UI_MESSAGES } from "../lib/constants";
import { CategoryNoteSection } from "./CategoryNoteSection";

import type { ReactNode } from "react";

interface FamilyNoteViewProps {
  creatorId: string;
  creatorName: string;
  onBack: () => void;
}

export function FamilyNoteView({
  creatorId,
  creatorName,
  onBack,
}: FamilyNoteViewProps): ReactNode {
  const { categories, isLoading, error, refresh } =
    useFamilyEndingNote(creatorId);

  // Refresh data when the view becomes visible
  useEffect(() => {
    refresh();
  }, [refresh]);

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
          onClick={refresh}
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

  const totalAnswered = categories.reduce(
    (sum, cat) => sum + cat.answeredCount,
    0,
  );
  const totalQuestions = categories.reduce(
    (sum, cat) => sum + cat.totalQuestions,
    0,
  );

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
        <p className="text-base text-text-secondary">
          {totalAnswered > 0
            ? `${totalQuestions}項目中 ${totalAnswered}項目を記録しました`
            : UI_MESSAGES.family.noteViewTitle}
        </p>
      </div>

      {/* Category sections */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-3 max-w-lg mx-auto">
          {categories.length === 0 && (
            <div className="rounded-card border border-border-light bg-bg-surface p-6 text-center">
              <p className="text-lg text-text-secondary">
                {UI_MESSAGES.family.noAccessibleCategories}
              </p>
            </div>
          )}

          {categories.map((cat) => (
            <CategoryNoteSection
              key={cat.category}
              data={cat}
              onStartConversation={undefined}
              onViewConversation={undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
