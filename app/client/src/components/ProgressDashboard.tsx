// Progress dashboard screen showing overall completion, milestones, and per-category progress.

import { useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { useProgress } from "../hooks/useProgress";
import { CategoryIcon } from "./CategoryIcon";
import { ProgressBar } from "./ProgressBar";
import { MilestoneBadge } from "./MilestoneBadge";

import type { ReactNode } from "react";
import type { QuestionCategory } from "../types/conversation";

interface ProgressDashboardProps {
  onBack: () => void;
  onStartConversation: (category: QuestionCategory) => void;
}

export function ProgressDashboard({
  onBack,
  onStartConversation,
}: ProgressDashboardProps): ReactNode {
  const { data, loading, error, refresh } = useProgress();

  // Refresh on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCategoryClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const catId = e.currentTarget.dataset["categoryId"] as
        | QuestionCategory
        | undefined;
      if (catId !== undefined) {
        onStartConversation(catId);
      }
    },
    [onStartConversation],
  );

  // Loading
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lg text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  // Error
  if (error || data === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-xl text-text-primary text-center leading-relaxed">
          {UI_MESSAGES.progress.loadFailed}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg px-6 py-3"
          onClick={refresh}
        >
          {UI_MESSAGES.progress.retryButton}
        </button>
      </div>
    );
  }

  // No progress at all
  const hasProgress = data.overall.answered > 0;

  // Separate overall milestones from category milestones
  const overallMilestones = data.milestones.filter(
    (m) => !m.id.startsWith("category_"),
  );

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header with back button */}
      <div className="flex-none px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            className="min-w-11 min-h-11 flex items-center justify-center rounded-full hover:bg-bg-surface-hover active:bg-border-light transition-colors"
            onClick={onBack}
            aria-label="戻る"
          >
            <svg
              className="w-6 h-6 text-text-secondary"
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
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
            {UI_MESSAGES.progress.pageTitle}
          </h1>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="max-w-lg mx-auto space-y-6">
          {!hasProgress ? (
            /* Empty state */
            <div className="bg-bg-surface rounded-card border border-border-light p-6 text-center">
              <p className="text-lg text-text-secondary whitespace-pre-line leading-relaxed">
                {UI_MESSAGES.progress.noProgress}
              </p>
            </div>
          ) : (
            <>
              {/* Overall progress section */}
              <section className="bg-bg-surface rounded-card border border-border-light p-5">
                <p className="text-lg text-text-secondary mb-2">
                  {UI_MESSAGES.progress.overallLabel}
                </p>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-bold text-accent-primary">
                    {data.overall.percentage}%
                  </span>
                  <span className="text-lg text-text-secondary">
                    {data.overall.answered}/{data.overall.total}{" "}
                    {UI_MESSAGES.progress.itemUnit}
                  </span>
                </div>
                <ProgressBar
                  answered={data.overall.answered}
                  total={data.overall.total}
                />
              </section>

              {/* Milestones section */}
              {overallMilestones.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold text-text-secondary mb-3">
                    {UI_MESSAGES.progress.milestonesTitle}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {overallMilestones.map((m) => (
                      <MilestoneBadge
                        key={m.id}
                        label={m.label}
                        achieved={m.achieved}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Category progress section */}
              <section>
                <h2 className="text-lg font-semibold text-text-secondary mb-3">
                  {UI_MESSAGES.progress.categoryLabel}
                </h2>
                <div className="space-y-3">
                  {data.categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      data-category-id={cat.id}
                      className="w-full bg-bg-surface rounded-card border border-border-light p-4 transition-colors hover:bg-bg-surface-hover active:bg-border-light text-left"
                      onClick={handleCategoryClick}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <CategoryIcon category={cat.id} className="w-7 h-7" />
                        <span className="text-lg font-semibold text-text-primary flex-1">
                          {cat.label}
                        </span>
                        <span className="text-lg text-text-secondary">
                          {cat.answered}/{cat.total}
                        </span>
                      </div>
                      <ProgressBar
                        answered={cat.answered}
                        total={cat.total}
                        compact
                      />
                      {cat.answered < cat.total && (
                        <p className="text-base text-accent-primary mt-2">
                          {UI_MESSAGES.progress.startConversation}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
