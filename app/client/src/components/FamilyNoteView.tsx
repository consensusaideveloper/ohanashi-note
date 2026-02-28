import { useEffect, useCallback } from "react";

import { useFamilyEndingNote } from "../hooks/useFamilyEndingNote";
import { SETTINGS_MESSAGES, UI_MESSAGES } from "../lib/constants";
import { CategoryNoteSection } from "./CategoryNoteSection";

import type { ReactNode } from "react";

interface FamilyNoteViewProps {
  creatorId: string;
  creatorName: string;
  onBack: () => void;
  onViewConversation?: (id: string) => void;
  onPrintNote?: () => void;
}

export function FamilyNoteView({
  creatorId,
  creatorName,
  onBack,
  onViewConversation,
  onPrintNote,
}: FamilyNoteViewProps): ReactNode {
  const { categories, isRepresentative, isLoading, error, refresh } =
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
        {totalAnswered > 0 && onPrintNote !== undefined && (
          <button
            type="button"
            className="mt-3 w-full min-h-11 rounded-full border border-accent-primary text-accent-primary text-lg font-medium px-4 py-2 hover:bg-accent-primary-light/30 active:bg-accent-primary-light/50 transition-colors flex items-center justify-center gap-2"
            onClick={onPrintNote}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"
              />
            </svg>
            {SETTINGS_MESSAGES.print.buttonLabel}
          </button>
        )}
      </div>

      {/* Category sections */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-3 max-w-lg mx-auto">
          {categories.length === 0 && (
            <div className="rounded-card border border-border-light bg-bg-surface p-6 text-center space-y-2">
              <p className="text-lg text-text-secondary">
                {UI_MESSAGES.family.noAccessibleCategories}
              </p>
              <p className="text-base text-text-secondary">
                {isRepresentative
                  ? UI_MESSAGES.family.noAccessibleCategoriesRepresentativeHint
                  : UI_MESSAGES.family.noAccessibleCategoriesMemberHint}
              </p>
            </div>
          )}

          {categories.map((cat) => (
            <CategoryNoteSection
              key={cat.category}
              data={cat}
              onStartConversation={undefined}
              onViewConversation={onViewConversation}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
