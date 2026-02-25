// Category selection screen displayed before a conversation begins.
// Allows the user to choose which ending note topic to discuss.

import { useCallback } from "react";

import { QUESTION_CATEGORIES } from "../lib/questions";

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

// SVG icon color per category (matches border accent)
const CATEGORY_ICON_COLORS: Record<QuestionCategory, string> = {
  memories: "text-accent-primary",
  people: "text-accent-primary/85",
  house: "text-accent-primary/70",
  medical: "text-accent-tertiary",
  funeral: "text-accent-secondary",
  money: "text-accent-secondary/70",
  work: "text-accent-primary/55",
  digital: "text-accent-tertiary/70",
  legal: "text-accent-secondary/85",
  trust: "text-accent-primary/80",
  support: "text-accent-tertiary/55",
};

// Clean SVG line icons replacing emojis — consistent with design system
function CategoryIcon({ category }: { category: QuestionCategory }): ReactNode {
  const color = CATEGORY_ICON_COLORS[category];
  const cls = `w-9 h-9 ${color}`;
  const props = {
    className: cls,
    fill: "none" as const,
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.5,
  };

  switch (category) {
    case "memories":
      // Book open
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
          />
        </svg>
      );
    case "people":
      // User group
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
          />
        </svg>
      );
    case "house":
      // Home
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
          />
        </svg>
      );
    case "medical":
      // Heart
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
          />
        </svg>
      );
    case "funeral":
      // Sparkles (spiritual, gentle)
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
          />
        </svg>
      );
    case "money":
      // Shield check (security/protection)
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
          />
        </svg>
      );
    case "work":
      // Briefcase
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0"
          />
        </svg>
      );
    case "digital":
      // Smartphone
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
          />
        </svg>
      );
    case "legal":
      // Scale (balance of justice)
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v17.25m0-17.25c-1.33 0-2.58.37-3.64 1.02L5.25 7.5H3.75a.75.75 0 0 0-.53 1.28l2.12 2.12a4.5 4.5 0 0 0 3.16 1.35m3.5-9.25c1.33 0 2.58.37 3.64 1.02l3.11 3.23h1.5a.75.75 0 0 1 .53 1.28l-2.12 2.12a4.5 4.5 0 0 1-3.16 1.35M8.25 21h7.5"
          />
        </svg>
      );
    case "trust":
      // Hand raised (entrusting, delegation)
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075-5.925v3m0-3a1.575 1.575 0 0 1 3.15 0v3m-3.15 0 .075 3.9M16.2 7.575v3m0 0a1.575 1.575 0 0 1 3.15 0v1.65c0 2.674-1.065 5.239-2.96 7.128l-.674.673a2.25 2.25 0 0 1-1.59.66H9.319a2.25 2.25 0 0 1-1.537-.606l-1.15-1.084A4.496 4.496 0 0 1 5.25 15.09V11.1c0-.865.702-1.568 1.568-1.568.385 0 .756.14 1.044.4l1.088 .976"
          />
        </svg>
      );
    case "support":
      // Building columns (public institution)
      return (
        <svg {...props}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z"
          />
        </svg>
      );
  }
}

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
