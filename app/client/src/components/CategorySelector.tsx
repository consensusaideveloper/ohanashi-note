// Category selection screen displayed before a conversation begins.
// Allows the user to choose which ending note topic to discuss.

import { useCallback } from "react";

import { QUESTION_CATEGORIES } from "../lib/questions";
import { CategoryIcon } from "./CategoryIcon";

import type { ReactNode } from "react";
import type { QuestionCategory } from "../types/conversation";

interface CategorySelectorProps {
  onSelectCategory: (category: QuestionCategory) => void;
  characterName: string;
  onBack: () => void;
  /** Optional progress map: category → { answered, total } */
  progressByCategory?: Record<
    QuestionCategory,
    { answered: number; total: number }
  >;
}

// Bento-style left border design per category
const CATEGORY_STYLES: Record<QuestionCategory, string> = {
  memories:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-primary-light/50 border-l-4 border-l-accent-primary",
  people:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-primary-light/50 border-l-4 border-l-accent-primary/85",
  house:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-primary-light/50 border-l-4 border-l-accent-primary/70",
  medical:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-tertiary-light/50 border-l-4 border-l-accent-tertiary",
  funeral:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-secondary-light/50 border-l-4 border-l-accent-secondary",
  money:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-secondary-light/50 border-l-4 border-l-accent-secondary/70",
  work: "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-primary-light/50 border-l-4 border-l-accent-primary/55",
  digital:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-tertiary-light/50 border-l-4 border-l-accent-tertiary/70",
  legal:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-secondary-light/50 border-l-4 border-l-accent-secondary/85",
  trust:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-primary-light/50 border-l-4 border-l-accent-primary/80",
  support:
    "bg-bg-surface hover:bg-bg-surface-hover active:bg-accent-tertiary-light/50 border-l-4 border-l-accent-tertiary/55",
};

// CategoryIcon is now imported from ./CategoryIcon.tsx

export function CategorySelector({
  onSelectCategory,
  characterName,
  onBack,
  progressByCategory,
}: CategorySelectorProps): ReactNode {
  const handleOmakase = useCallback(() => {
    // Pick category with lowest completion rate
    if (progressByCategory !== undefined) {
      let bestCategory: QuestionCategory = "memories";
      let lowestRate = 1;
      for (const cat of QUESTION_CATEGORIES) {
        const progress = progressByCategory[cat.id];
        const rate =
          progress.total > 0 ? progress.answered / progress.total : 0;
        if (rate < lowestRate) {
          lowestRate = rate;
          bestCategory = cat.id;
        }
      }
      onSelectCategory(bestCategory);
    } else {
      onSelectCategory("memories");
    }
  }, [onSelectCategory, progressByCategory]);

  const handleCategoryClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const catId = e.currentTarget.dataset["categoryId"] as
        | QuestionCategory
        | undefined;
      if (catId !== undefined) {
        onSelectCategory(catId);
      }
    },
    [onSelectCategory],
  );

  return (
    <div className="min-h-dvh flex flex-col items-center bg-bg-primary px-4 py-8">
      {/* Back button */}
      <div className="w-full max-w-lg md:max-w-2xl flex items-center">
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
      </div>

      {/* Header */}
      <div className="flex-none text-center mb-8 pt-2">
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary mb-2">
          {characterName}と何をお話ししましょうか？
        </h1>
        <p className="text-lg text-text-secondary">
          気になるテーマを選んでください
        </p>
      </div>

      {/* Category grid — 2 cols on mobile, 3 cols on md+ for 11 categories */}
      <div className="w-full max-w-lg md:max-w-2xl grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        {QUESTION_CATEGORIES.map((cat) => {
          const progress = progressByCategory?.[cat.id];
          return (
            <button
              key={cat.id}
              type="button"
              className={`relative flex flex-col items-center justify-center shadow-sm rounded-card p-4 md:p-5 min-h-[120px] md:min-h-[140px] transition-all duration-300 cursor-pointer ${CATEGORY_STYLES[cat.id]}`}
              data-category-id={cat.id}
              onClick={handleCategoryClick}
            >
              {progress !== undefined && progress.answered > 0 && (
                <span className="absolute top-2 right-2 bg-accent-primary/15 text-accent-primary text-lg font-semibold rounded-full px-2.5 py-1">
                  {progress.answered}/{progress.total}
                </span>
              )}
              <div className="mb-2">
                <CategoryIcon category={cat.id} />
              </div>
              <span className="text-lg md:text-xl font-semibold text-text-primary mb-1">
                {cat.label}
              </span>
              <span className="text-lg md:text-xl text-text-secondary text-center leading-snug">
                {cat.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Omakase (auto-select) button */}
      <div className="w-full max-w-lg md:max-w-2xl">
        <button
          type="button"
          className="w-full bg-accent-primary text-text-on-accent shadow-md rounded-card border-none hover:bg-accent-primary-hover active:bg-accent-primary-hover p-4 md:p-5 min-h-[56px] transition-colors duration-300 cursor-pointer"
          onClick={handleOmakase}
        >
          <span className="text-lg md:text-xl font-semibold text-text-on-accent">
            おまかせ
          </span>
          <span className="block text-lg md:text-xl text-text-on-accent/80 mt-1">
            {characterName}にお話の流れをお任せします
          </span>
        </button>
      </div>
    </div>
  );
}
