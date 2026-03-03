import { useState, useCallback, useEffect } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { getWellnessHistory } from "../lib/wellness-api";

import type { ReactNode } from "react";
import type { WellnessHistoryRecord } from "../lib/wellness-api";

interface WellnessHistoryScreenProps {
  creatorId: string;
  creatorName: string;
  onBack: () => void;
}

/** Number of records fetched per page. */
const PAGE_SIZE = 30;

function formatRecordDate(dateString: string): string {
  const parts = dateString.split("-");
  if (parts.length !== 3) {
    return dateString;
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return dateString;
  }
  return `${String(year)}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function HistoryRow({ record }: { record: WellnessHistoryRecord }): ReactNode {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border-light last:border-b-0">
      {/* Status icon */}
      {record.hadConversation ? (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-secondary flex items-center justify-center mt-0.5">
          {/* Checkmark SVG */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-text-on-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
        </div>
      ) : (
        <div className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-border flex items-center justify-center mt-0.5">
          {/* Dash SVG */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </div>
      )}

      {/* Date and summary */}
      <div className="flex-1 min-w-0">
        <p className="text-lg text-text-primary">
          {formatRecordDate(record.date)}
        </p>
        {record.summary !== null && (
          <p className="text-base text-text-secondary mt-0.5 leading-relaxed">
            {record.summary}
          </p>
        )}
      </div>
    </div>
  );
}

export function WellnessHistoryScreen({
  creatorId,
  creatorName,
  onBack,
}: WellnessHistoryScreenProps): ReactNode {
  const [records, setRecords] = useState<WellnessHistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const hasMore = records.length < total;

  useEffect(() => {
    let cancelled = false;
    getWellnessHistory(creatorId, PAGE_SIZE, 0)
      .then((response) => {
        if (cancelled) return;
        setRecords(response.records);
        setTotal(response.total);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load wellness history:", {
          error: err,
          creatorId,
        });
        setError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [creatorId, reloadKey]);

  const handleRetry = useCallback((): void => {
    setLoading(true);
    setError(false);
    setReloadKey((key) => key + 1);
  }, []);

  const handleLoadMore = useCallback((): void => {
    setLoadingMore(true);
    getWellnessHistory(creatorId, PAGE_SIZE, records.length)
      .then((response) => {
        setRecords((prev) => [...prev, ...response.records]);
        setTotal(response.total);
      })
      .catch((err: unknown) => {
        console.error("Failed to load more wellness history:", {
          error: err,
          creatorId,
          offset: records.length,
        });
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [creatorId, records.length]);

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header with back button */}
      <div className="flex-none px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full transition-colors active:bg-bg-surface-hover"
            onClick={onBack}
            aria-label="戻る"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-text-primary"
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
          <h1 className="text-2xl font-bold text-text-primary flex-1">
            {creatorName}さんの記録
          </h1>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="max-w-lg mx-auto">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="text-center py-12 space-y-4">
              <p className="text-lg text-text-secondary">
                {UI_MESSAGES.wellness.loadFailed}
              </p>
              <button
                type="button"
                className="min-h-11 px-6 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover"
                onClick={handleRetry}
              >
                もう一度読み込む
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && records.length === 0 && (
            <div className="text-center py-12">
              <p className="text-lg text-text-secondary">
                {UI_MESSAGES.wellness.noData}
              </p>
            </div>
          )}

          {/* Records list */}
          {!loading && !error && records.length > 0 && (
            <div className="rounded-card border border-border bg-bg-surface px-4">
              {records.map((record) => (
                <HistoryRow key={record.date} record={record} />
              ))}
            </div>
          )}

          {/* Load more button */}
          {!loading && !error && hasMore && (
            <div className="flex justify-center pt-6">
              <button
                type="button"
                className="min-h-11 px-6 rounded-full border border-border text-text-secondary bg-bg-surface text-lg transition-colors active:bg-bg-surface-hover disabled:opacity-50"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "読み込み中..." : "もっと見る"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
