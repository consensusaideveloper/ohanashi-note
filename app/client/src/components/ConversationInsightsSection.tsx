import { useCallback, useState } from "react";

import type { ReactNode } from "react";
import type { FlexibleNoteItem } from "../lib/flexible-notes";

interface ConversationInsightsSectionProps {
  items: FlexibleNoteItem[];
  onViewConversation?: (id: string) => void;
}

function formatRecordedAt(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function ConversationInsightsSection({
  items,
  onViewConversation,
}: ConversationInsightsSectionProps): ReactNode {
  const [isExpanded, setIsExpanded] = useState(items.length > 0);

  const handleToggle = useCallback((): void => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleViewConversationClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const conversationId = e.currentTarget.dataset["conversationId"];
      if (conversationId !== undefined && onViewConversation !== undefined) {
        onViewConversation(conversationId);
      }
    },
    [onViewConversation],
  );

  return (
    <section className="bg-bg-surface rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-bg-surface-hover active:bg-border-light transition-colors"
        onClick={handleToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-text-primary">
              会話から見えたこと
            </h3>
            <span className="text-lg text-text-secondary">
              {items.length}件
            </span>
          </div>
          <p className="text-base text-text-secondary leading-relaxed">
            質問項目に収まりきらない、好きなことや思い出、人となりのメモです
          </p>
        </div>
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

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="border-l-2 border-accent-secondary/40 pl-3"
            >
              <p className="text-base text-text-primary leading-relaxed">
                {item.text}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-sm text-text-secondary">
                  {formatRecordedAt(item.recordedAt)}の会話
                </span>
                {item.mentionCount > 1 && (
                  <span className="inline-flex items-center rounded-full bg-accent-secondary/10 px-2.5 py-1 text-sm text-text-secondary">
                    {item.mentionCount}回出てきた話題
                  </span>
                )}
                {onViewConversation !== undefined && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 min-h-11 px-3 py-1.5 rounded-full bg-accent-primary/10 text-accent-primary text-lg font-medium hover:bg-accent-primary/20 active:bg-accent-primary/30 transition-colors"
                    data-conversation-id={item.conversationId}
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
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
