import { useEffect } from "react";

import { useEndingNote } from "../hooks/useEndingNote";
import { CategoryNoteSection } from "./CategoryNoteSection";

import type { ReactNode } from "react";
import type { QuestionCategory } from "../types/conversation";

interface EndingNoteViewProps {
  onStartConversation?: (category: QuestionCategory) => void;
  onViewConversation?: (id: string) => void;
}

export function EndingNoteView({
  onStartConversation,
  onViewConversation,
}: EndingNoteViewProps): ReactNode {
  const { categories, isLoading, refresh } = useEndingNote();

  // Refresh data when the view becomes visible
  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalAnswered = categories.reduce(
    (sum, cat) => sum + cat.answeredCount,
    0,
  );
  const totalQuestions = categories.reduce(
    (sum, cat) => sum + cat.totalQuestions,
    0,
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lg text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-text-primary mb-1">
          わたしのエンディングノート
        </h1>
        <p className="text-base text-text-secondary">
          {totalAnswered > 0
            ? `${totalQuestions}項目中 ${totalAnswered}項目を記録しました`
            : "お話しした内容がここにまとまります"}
        </p>
      </div>

      {/* Category sections */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-3 max-w-lg mx-auto">
          {categories.map((cat) => (
            <CategoryNoteSection
              key={cat.category}
              data={cat}
              onStartConversation={onStartConversation}
              onViewConversation={onViewConversation}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
