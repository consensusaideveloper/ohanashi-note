import { QUESTION_CATEGORIES } from "../lib/questions";

import type { ReactNode } from "react";
import type { CategoryNoteData } from "../hooks/useEndingNote";

function formatVersionDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function PrintableCategory({
  data,
}: {
  data: CategoryNoteData;
}): ReactNode {
  if (data.noteEntries.length === 0) {
    return null;
  }

  const categoryInfo = QUESTION_CATEGORIES.find(
    (cat) => cat.id === data.category,
  );

  return (
    <section className="print-no-break mb-8">
      <div className="flex items-center gap-2 mb-4 border-b-2 border-text-primary/20 pb-2">
        {categoryInfo !== undefined && (
          <span className="text-xl">{categoryInfo.icon}</span>
        )}
        <h2 className="text-xl font-semibold text-text-primary">
          {data.label}
        </h2>
        <span className="text-base text-text-secondary ml-auto">
          {data.answeredCount}/{data.totalQuestions} 項目
        </span>
      </div>

      <div className="space-y-4 pl-2">
        {data.noteEntries.map((entry) => (
          <div key={entry.questionId} className="print-no-break">
            <p className="text-lg font-medium text-text-secondary">
              {entry.questionTitle}
            </p>
            <p className="text-lg text-text-primary leading-relaxed mt-1 pl-4 border-l-2 border-accent-primary/30">
              {entry.answer}
            </p>

            {/* Version history */}
            {entry.hasHistory && entry.previousVersions.length > 0 && (
              <div className="mt-2 ml-4 pl-3 border-l-2 border-warning-light space-y-2">
                <p className="text-base font-medium text-text-secondary">
                  更新履歴（{entry.previousVersions.length}回）
                </p>
                {[...entry.previousVersions].reverse().map((version) => (
                  <div key={version.conversationId} className="print-no-break">
                    <p className="text-base text-text-secondary">
                      {formatVersionDate(version.recordedAt)}
                    </p>
                    <p className="text-base text-text-primary/70 leading-relaxed">
                      {version.answer}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {data.disclaimer !== undefined && (
        <p className="text-base text-text-secondary mt-4 italic">
          {data.disclaimer}
        </p>
      )}
    </section>
  );
}
