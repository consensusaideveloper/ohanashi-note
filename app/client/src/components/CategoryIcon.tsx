// Clean SVG line icons for each ending-note question category.
// Shared between CategorySelector and ProgressDashboard.

import type { ReactNode } from "react";
import type { QuestionCategory } from "../types/conversation";

/** Icon color class per category (matches card border accent). */
export const CATEGORY_ICON_COLORS: Record<QuestionCategory, string> = {
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

interface CategoryIconProps {
  category: QuestionCategory;
  /** Additional CSS classes (e.g. size overrides). Defaults to "w-9 h-9". */
  className?: string;
}

export function CategoryIcon({
  category,
  className,
}: CategoryIconProps): ReactNode {
  const color = CATEGORY_ICON_COLORS[category];
  const cls = `${className ?? "w-9 h-9"} ${color}`;
  const props = {
    className: cls,
    fill: "none" as const,
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.5,
  };

  switch (category) {
    case "memories":
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
