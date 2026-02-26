import { useState, useEffect, useCallback, useMemo } from "react";

import { getCharacterShortName } from "../lib/characters";
import { TRANSCRIPT_PREVIEW_MAX_LENGTH, UI_MESSAGES } from "../lib/constants";
import { listConversations } from "../lib/storage";
import { QUESTION_CATEGORIES } from "../lib/questions";

import type { ReactNode } from "react";
import type {
  ConversationRecord,
  QuestionCategory,
} from "../types/conversation";

type PeriodFilter = "all" | "this-month" | "last-month" | "3-months";

interface PeriodOption {
  value: PeriodFilter;
  label: string;
}

const PERIOD_OPTIONS: readonly PeriodOption[] = [
  { value: "all", label: "すべて" },
  { value: "this-month", label: "今月" },
  { value: "last-month", label: "先月" },
  { value: "3-months", label: "3ヶ月" },
] as const;

type CategoryFilter = QuestionCategory | "all";

interface CategoryOption {
  value: CategoryFilter;
  label: string;
}

const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  { value: "all", label: "すべて" },
  ...QUESTION_CATEGORIES.map((cat) => ({ value: cat.id, label: cat.label })),
];

export interface ConversationHistoryProps {
  onSelectConversation: (id: string) => void;
}

function formatDateJapanese(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

function getTranscriptPreview(record: ConversationRecord): string {
  const previewLines = record.transcript.slice(0, 2);
  if (previewLines.length === 0) {
    return "（会話内容なし）";
  }
  // Guard against undefined from legacy records
  const assistantName =
    record.characterId != null
      ? getCharacterShortName(record.characterId)
      : "アシスタント";
  const preview = previewLines
    .map((entry) => {
      const prefix = entry.role === "user" ? "あなた: " : `${assistantName}: `;
      return prefix + entry.text;
    })
    .join(" / ");

  // Truncate if too long
  if (preview.length > TRANSCRIPT_PREVIEW_MAX_LENGTH) {
    return preview.slice(0, TRANSCRIPT_PREVIEW_MAX_LENGTH) + "...";
  }
  return preview;
}

function getCardSummary(record: ConversationRecord): string {
  if (record.oneLinerSummary !== undefined && record.oneLinerSummary !== "") {
    return record.oneLinerSummary;
  }
  return getTranscriptPreview(record);
}

function getCategoryLabel(categoryId: QuestionCategory): string | null {
  const info = QUESTION_CATEGORIES.find((c) => c.id === categoryId);
  return info !== undefined ? info.label : null;
}

function getPeriodStartTimestamp(filter: PeriodFilter): number {
  const now = new Date();
  switch (filter) {
    case "all":
      return 0;
    case "this-month":
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case "last-month":
      return new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    case "3-months":
      return new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
  }
}

function getPeriodEndTimestamp(filter: PeriodFilter): number | null {
  if (filter !== "last-month") {
    return null;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function filterByPeriod(
  records: readonly ConversationRecord[],
  filter: PeriodFilter,
): ConversationRecord[] {
  if (filter === "all") {
    return [...records];
  }
  const start = getPeriodStartTimestamp(filter);
  const end = getPeriodEndTimestamp(filter);
  return records.filter((r) => {
    if (r.startedAt < start) return false;
    if (end !== null && r.startedAt >= end) return false;
    return true;
  });
}

function filterByCategory(
  records: readonly ConversationRecord[],
  filter: CategoryFilter,
): ConversationRecord[] {
  if (filter === "all") {
    return [...records];
  }
  return records.filter((record) => {
    if (record.category === filter) return true;
    if (
      record.discussedCategories !== undefined &&
      record.discussedCategories.includes(filter)
    ) {
      return true;
    }
    return false;
  });
}

interface MonthGroup {
  key: string;
  label: string;
  records: ConversationRecord[];
}

function groupByMonth(records: readonly ConversationRecord[]): MonthGroup[] {
  const groups = new Map<string, ConversationRecord[]>();
  const orderKeys: string[] = [];

  for (const record of records) {
    const date = new Date(record.startedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.push(record);
    } else {
      groups.set(key, [record]);
      orderKeys.push(key);
    }
  }

  return orderKeys.map((key) => {
    const parts = key.split("-");
    const year = parts[0];
    const month = parseInt(parts[1] ?? "1", 10);
    return {
      key,
      label: `${year}年${month}月`,
      records: groups.get(key) ?? [],
    };
  });
}

export function ConversationHistory({
  onSelectConversation,
}: ConversationHistoryProps): ReactNode {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);

  const loadConversations = useCallback((): void => {
    setIsLoading(true);
    setLoadError(false);
    listConversations()
      .then((records) => {
        setConversations(records);
      })
      .catch((error: unknown) => {
        console.error("Failed to load conversations:", { error });
        setLoadError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const filteredConversations = useMemo(() => {
    const byPeriod = filterByPeriod(conversations, periodFilter);
    return filterByCategory(byPeriod, categoryFilter);
  }, [conversations, periodFilter, categoryFilter]);

  const monthGroups = useMemo(
    () => groupByMonth(filteredConversations),
    [filteredConversations],
  );

  const handleFilterChange = useCallback((filter: PeriodFilter): void => {
    setPeriodFilter(filter);
  }, []);

  const handleCategoryFilterChange = useCallback(
    (filter: CategoryFilter): void => {
      setCategoryFilter(filter);
    },
    [],
  );

  const handleToggleCategoryFilter = useCallback((): void => {
    setIsCategoryFilterOpen((prev) => !prev);
  }, []);

  const handleRecordClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      const recordId = e.currentTarget.dataset["recordId"];
      if (recordId !== undefined) {
        onSelectConversation(recordId);
      }
    },
    [onSelectConversation],
  );

  const handleRecordKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const recordId = e.currentTarget.dataset["recordId"];
        if (recordId !== undefined) {
          onSelectConversation(recordId);
        }
      }
    },
    [onSelectConversation],
  );

  const handleCategoryTagButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      const catId = event.currentTarget.dataset["categoryId"] as
        | QuestionCategory
        | undefined;
      if (catId !== undefined) {
        event.stopPropagation();
        setCategoryFilter(catId);
        setIsCategoryFilterOpen(true);
      }
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lg text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-xl text-text-primary text-center leading-relaxed">
          {UI_MESSAGES.error.historyLoadFailed}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg px-6 py-3"
          onClick={loadConversations}
        >
          もう一度読み込む
        </button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-lg text-text-secondary text-center leading-relaxed">
          まだ記録がありません。お話しすると、ここに記録が残ります。
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full overflow-y-auto px-4 py-4">
      <div className="max-w-lg mx-auto">
        {/* Period filter pills */}
        <div
          className="flex gap-2 mb-4"
          role="radiogroup"
          aria-label="期間で絞り込み"
        >
          {PERIOD_OPTIONS.map((option) => {
            const isActive = periodFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`flex-1 min-h-11 rounded-full text-lg font-medium transition-colors ${
                  isActive
                    ? "bg-accent-primary text-text-on-accent shadow-sm"
                    : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
                }`}
                onClick={(): void => handleFilterChange(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {/* Category filter — collapsible topic section */}
        <div className="mb-4">
          <button
            type="button"
            className="flex items-center gap-2 min-h-11 px-3 py-2 text-lg text-text-secondary active:text-text-primary transition-colors"
            onClick={handleToggleCategoryFilter}
            aria-expanded={isCategoryFilterOpen}
            aria-controls="category-filter-pills"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-5 w-5 transition-transform duration-200 ${
                isCategoryFilterOpen ? "rotate-90" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span>話題で絞り込み</span>
            {categoryFilter !== "all" && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-accent-primary text-text-on-accent text-lg font-medium">
                {
                  QUESTION_CATEGORIES.find((c) => c.id === categoryFilter)
                    ?.label
                }
              </span>
            )}
          </button>
          {isCategoryFilterOpen && (
            <div
              id="category-filter-pills"
              className="flex flex-wrap gap-2 mt-2 px-1"
              role="radiogroup"
              aria-label="話題で絞り込み"
            >
              {CATEGORY_OPTIONS.map((option) => {
                const isActive = categoryFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={`min-h-11 px-4 rounded-full text-lg font-medium transition-colors ${
                      isActive
                        ? "bg-accent-primary text-text-on-accent shadow-sm"
                        : "bg-bg-surface border border-border text-text-secondary active:bg-bg-surface-hover"
                    }`}
                    onClick={(): void =>
                      handleCategoryFilterChange(option.value)
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Filtered empty state */}
        {filteredConversations.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-lg text-text-secondary text-center leading-relaxed">
              {categoryFilter !== "all"
                ? "この条件に合う記録はありません"
                : "この期間の記録はありません"}
            </p>
          </div>
        )}

        {/* Month-grouped conversation list */}
        {monthGroups.map((group) => (
          <section key={group.key} className="mb-6">
            <h2 className="text-xl font-medium text-text-secondary mb-2 px-1">
              {group.label}
              <span className="text-lg font-normal ml-2">
                （{group.records.length}件）
              </span>
            </h2>
            <ul className="space-y-3">
              {group.records.map((record) => (
                <li key={record.id} className="animate-fade-in">
                  <div
                    role="button"
                    tabIndex={0}
                    data-record-id={record.id}
                    className="w-full min-h-[72px] bg-bg-surface shadow-sm border border-border-light rounded-card px-5 py-4 text-left active:bg-bg-surface-hover transition-all duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-accent-primary focus-visible:outline-offset-2"
                    onClick={handleRecordClick}
                    onKeyDown={handleRecordKeyDown}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-medium text-text-primary">
                        {formatDateJapanese(record.startedAt)}
                      </p>
                      {record.audioAvailable === true && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4 text-accent-primary flex-none"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-label="録音あり"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                          />
                        </svg>
                      )}
                    </div>
                    <p className="text-lg text-text-secondary mt-1 truncate">
                      {getCardSummary(record)}
                    </p>
                    {/* Category tags (tappable to filter) */}
                    {record.discussedCategories !== undefined &&
                      record.discussedCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {record.discussedCategories.map((catId) => {
                            const label = getCategoryLabel(catId);
                            const isActiveFilter = categoryFilter === catId;
                            return label !== null ? (
                              <button
                                key={catId}
                                type="button"
                                data-category-id={catId}
                                className={`inline-block px-3 py-1 rounded-full text-lg transition-colors ${
                                  isActiveFilter
                                    ? "bg-accent-primary text-text-on-accent"
                                    : "bg-accent-primary-light/60 text-text-secondary active:bg-accent-primary-light"
                                }`}
                                onClick={handleCategoryTagButtonClick}
                                aria-label={`${label}で絞り込み`}
                              >
                                {label}
                              </button>
                            ) : null;
                          })}
                        </div>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
