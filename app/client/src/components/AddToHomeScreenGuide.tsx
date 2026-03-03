import { useCallback } from "react";

import type { ReactNode } from "react";

interface AddToHomeScreenGuideProps {
  onDismiss: () => void;
}

const A2HS_DISMISSED_KEY = "a2hs_guide_dismissed";

const TITLE = "ホーム画面に追加";
const DESCRIPTION = "ホーム画面に追加すると、通知を受け取れるようになります。";
const STEP_1 = "画面下の共有ボタン（□に↑）をタップ";
const STEP_2 = "「ホーム画面に追加」を選択";
const CLOSE_LABEL = "閉じる";

export function isA2HSGuideDismissed(): boolean {
  try {
    return localStorage.getItem(A2HS_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function AddToHomeScreenGuide({
  onDismiss,
}: AddToHomeScreenGuideProps): ReactNode {
  const handleDismiss = useCallback((): void => {
    try {
      localStorage.setItem(A2HS_DISMISSED_KEY, "true");
    } catch {
      // localStorage may be unavailable in private browsing
    }
    onDismiss();
  }, [onDismiss]);

  return (
    <div className="bg-bg-surface rounded-card border border-border-light p-5 shadow-lg space-y-4">
      <h3 className="text-xl font-semibold text-text-primary">{TITLE}</h3>
      <p className="text-lg text-text-secondary leading-relaxed">
        {DESCRIPTION}
      </p>
      <ol className="space-y-3 list-none">
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-primary text-text-on-accent flex items-center justify-center text-lg font-semibold">
            1
          </span>
          <span className="text-lg text-text-primary pt-0.5 flex items-center gap-2">
            {STEP_1}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6 flex-shrink-0 text-accent-primary"
              aria-hidden="true"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M12 16V3" />
              <path d="M8 7l4-4 4 4" />
            </svg>
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-primary text-text-on-accent flex items-center justify-center text-lg font-semibold">
            2
          </span>
          <span className="text-lg text-text-primary pt-0.5">{STEP_2}</span>
        </li>
      </ol>
      <button
        type="button"
        className="w-full min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-secondary hover:bg-bg-surface-hover active:bg-border-light transition-colors"
        onClick={handleDismiss}
        aria-label="ホーム画面追加ガイドを閉じる"
      >
        {CLOSE_LABEL}
      </button>
    </div>
  );
}
