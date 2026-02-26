import { useState, useCallback } from "react";

import type { ReactNode } from "react";
import type {
  CategoryNoteData,
  NoteEntryVersion,
} from "../hooks/useEndingNote";
import type { QuestionCategory } from "../types/conversation";

function formatVersionDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function VersionTimeline({
  versions,
  onViewConversation,
}: {
  versions: readonly NoteEntryVersion[];
  onViewConversation?: (id: string) => void;
}): ReactNode {
  const handleViewClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const convId = e.currentTarget.dataset["conversationId"];
      if (convId !== undefined && onViewConversation !== undefined) {
        onViewConversation(convId);
      }
    },
    [onViewConversation],
  );

  // Show newest previous version first
  const reversed = [...versions].reverse();
  return (
    <div className="ml-5 mt-2 border-l-2 border-warning-light pl-3 space-y-3">
      <p className="text-lg font-medium text-text-secondary">更新履歴</p>
      {reversed.map((version) => (
        <div key={version.conversationId} className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-lg text-text-secondary">
              {formatVersionDate(version.recordedAt)}
            </p>
            <p className="text-base text-text-primary/70 leading-relaxed">
              {version.answer}
            </p>
          </div>
          {onViewConversation !== undefined && (
            <button
              type="button"
              className="flex-none min-w-11 min-h-11 flex items-center justify-center rounded-full text-text-secondary hover:bg-bg-surface-hover transition-colors"
              data-conversation-id={version.conversationId}
              onClick={handleViewClick}
              aria-label="会話を見る"
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
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

interface CategoryNoteSectionProps {
  data: CategoryNoteData;
  onStartConversation?: (category: QuestionCategory) => void;
  onViewConversation?: (id: string) => void;
}

export function CategoryNoteSection({
  data,
  onStartConversation,
  onViewConversation,
}: CategoryNoteSectionProps): ReactNode {
  const [isExpanded, setIsExpanded] = useState(data.noteEntries.length > 0);
  const [expandedHistories, setExpandedHistories] = useState<Set<string>>(
    new Set(),
  );

  const handleToggle = useCallback((): void => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleToggleHistory = useCallback((questionId: string): void => {
    setExpandedHistories((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }, []);

  const handleViewConversationClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const convId = e.currentTarget.dataset["conversationId"];
      if (convId !== undefined && onViewConversation !== undefined) {
        onViewConversation(convId);
      }
    },
    [onViewConversation],
  );

  const handleHistoryToggleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const questionId = e.currentTarget.dataset["questionId"];
      if (questionId !== undefined) {
        handleToggleHistory(questionId);
      }
    },
    [handleToggleHistory],
  );

  const handleStart = useCallback((): void => {
    onStartConversation?.(data.category);
  }, [onStartConversation, data.category]);

  const progressPercent =
    data.totalQuestions > 0
      ? Math.round((data.answeredCount / data.totalQuestions) * 100)
      : 0;

  return (
    <div className="bg-bg-surface rounded-2xl shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-bg-surface-hover active:bg-border-light transition-colors"
        onClick={handleToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-text-primary">
              {data.label}
            </h3>
            <span className="text-lg text-text-secondary">
              {data.answeredCount}/{data.totalQuestions} 完了
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-border-light rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        {/* Chevron */}
        <svg
          className={`w-5 h-5 text-text-secondary flex-none transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
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

      {/* Content — expandable */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {/* Category disclaimer */}
          {data.disclaimer !== undefined && (
            <div className="flex gap-2.5 items-start mb-3 px-2 py-3 bg-bg-surface rounded-xl border border-border-light">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-text-secondary flex-none mt-0.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-base text-text-secondary leading-relaxed">
                {data.disclaimer}
              </p>
            </div>
          )}

          {/* Answered questions */}
          {data.noteEntries.length > 0 && (
            <div className="space-y-3">
              {data.noteEntries.map((entry) => (
                <div
                  key={entry.questionId}
                  className="border-l-2 border-accent-primary/30 pl-3"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-success flex-none text-lg">✓</span>
                    <p className="text-lg font-medium text-text-secondary">
                      {entry.questionTitle}
                    </p>
                  </div>
                  <p className="text-base text-text-primary leading-relaxed pl-5 mt-0.5">
                    {entry.answer}
                  </p>
                  {/* Conversation detail link and version history */}
                  <div className="pl-5 mt-1.5 flex flex-wrap items-center gap-2">
                    {onViewConversation !== undefined && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 min-h-11 px-3 py-1.5 rounded-full bg-accent-primary/10 text-accent-primary text-lg font-medium hover:bg-accent-primary/20 active:bg-accent-primary/30 transition-colors"
                        data-conversation-id={entry.conversationId}
                        onClick={handleViewConversationClick}
                        aria-label="会話を見る"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                          />
                        </svg>
                        会話を見る
                      </button>
                    )}
                    {entry.hasHistory && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 min-h-11 px-3 py-1.5 rounded-full bg-warning-light/50 text-accent-primary-hover text-lg font-medium hover:bg-warning-light/70 active:bg-warning-light transition-colors"
                        data-question-id={entry.questionId}
                        onClick={handleHistoryToggleClick}
                        aria-expanded={expandedHistories.has(entry.questionId)}
                        aria-label="更新履歴を表示"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                          />
                        </svg>
                        更新あり（{entry.previousVersions.length}回）
                        <svg
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${expandedHistories.has(entry.questionId) ? "rotate-180" : ""}`}
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
                    )}
                  </div>
                  {entry.hasHistory &&
                    expandedHistories.has(entry.questionId) && (
                      <div className="pl-5">
                        <VersionTimeline
                          versions={entry.previousVersions}
                          onViewConversation={onViewConversation}
                        />
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}

          {/* Unanswered questions */}
          {data.unansweredQuestions.length > 0 && (
            <div
              className={`space-y-2 ${data.noteEntries.length > 0 ? "mt-4 pt-3 border-t border-border-light" : ""}`}
            >
              <p className="text-lg font-medium text-text-secondary">
                まだお話していない項目
              </p>
              {data.unansweredQuestions.map((q) => (
                <div key={q.id} className="flex items-center gap-1.5 pl-3">
                  <span className="text-text-secondary/50 flex-none text-lg">
                    ○
                  </span>
                  <p className="text-base text-text-secondary">{q.title}</p>
                </div>
              ))}
            </div>
          )}

          {onStartConversation !== undefined && (
            <button
              type="button"
              className="mt-4 w-full min-h-11 rounded-full border border-accent-primary text-accent-primary text-base font-medium px-4 py-2 hover:bg-accent-primary-light/30 active:bg-accent-primary-light/50 transition-colors"
              onClick={handleStart}
            >
              このテーマで話す
            </button>
          )}
        </div>
      )}
    </div>
  );
}
