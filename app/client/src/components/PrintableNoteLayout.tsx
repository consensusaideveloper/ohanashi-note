import { useCallback } from "react";

import { SETTINGS_MESSAGES, UI_MESSAGES } from "../lib/constants";
import { PrintableCategory } from "./PrintableCategory";

import type { ReactNode } from "react";
import type { CategoryNoteData } from "../hooks/useEndingNote";

interface PrintableNoteLayoutProps {
  title: string;
  subtitle?: string;
  userName?: string;
  categories: CategoryNoteData[];
  isLoading: boolean;
  error: boolean;
  onRefresh: () => void;
  onClose: () => void;
  onPrint?: () => void;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function PrintableNoteLayout({
  title,
  subtitle,
  userName,
  categories,
  isLoading,
  error,
  onRefresh,
  onClose,
  onPrint,
}: PrintableNoteLayoutProps): ReactNode {
  const handlePrint = useCallback((): void => {
    onPrint?.();
    window.print();
  }, [onPrint]);

  const totalAnswered = categories.reduce(
    (sum, cat) => sum + cat.answeredCount,
    0,
  );
  const totalQuestions = categories.reduce(
    (sum, cat) => sum + cat.totalQuestions,
    0,
  );
  const categoriesWithEntries = categories.filter(
    (cat) => cat.noteEntries.length > 0,
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-bg-primary flex items-center justify-center">
        <p className="text-lg text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-bg-primary flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-xl text-text-primary text-center leading-relaxed">
          {UI_MESSAGES.error.printLoadFailed}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg px-6 py-3"
            onClick={onRefresh}
          >
            もう一度読み込む
          </button>
          <button
            type="button"
            className="min-h-11 rounded-full bg-bg-surface text-text-primary border border-border-light text-lg px-6 py-3"
            onClick={onClose}
          >
            {SETTINGS_MESSAGES.print.closeButton}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary overflow-y-auto">
      {/* Screen-only controls */}
      <div className="print-hidden sticky top-0 bg-bg-primary/95 backdrop-blur-sm border-b border-border-light px-4 py-3 flex items-center justify-between z-10">
        <button
          type="button"
          className="min-h-11 min-w-11 flex items-center gap-2 rounded-full text-text-primary text-lg px-4 py-2 hover:bg-bg-surface-hover transition-colors"
          onClick={onClose}
          aria-label="戻る"
        >
          <svg
            className="h-5 w-5"
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
          {SETTINGS_MESSAGES.print.closeButton}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg font-medium px-6 py-2"
          onClick={handlePrint}
        >
          {SETTINGS_MESSAGES.print.printButton}
        </button>
      </div>

      {/* Printable content */}
      <div className="print-content max-w-2xl mx-auto px-6 py-8">
        {/* Title block */}
        <header className="text-center mb-10 print-no-break">
          <h1 className="text-2xl font-bold text-text-primary mb-1">{title}</h1>
          {subtitle !== undefined && (
            <p className="text-lg text-text-secondary">{subtitle}</p>
          )}
          {userName !== undefined && userName !== "" && (
            <p className="text-xl font-medium text-text-primary mt-4">
              {userName}
            </p>
          )}
          <p className="text-base text-text-secondary mt-2">
            {SETTINGS_MESSAGES.print.generatedAt}: {formatDate(new Date())}
          </p>
          {totalAnswered > 0 && (
            <p className="text-base text-text-secondary mt-1">
              {totalQuestions}項目中 {totalAnswered}項目を記録しました
            </p>
          )}
        </header>

        {/* Category sections */}
        {categoriesWithEntries.length > 0 ? (
          categoriesWithEntries.map((cat) => (
            <PrintableCategory key={cat.category} data={cat} />
          ))
        ) : (
          <p className="text-lg text-text-secondary text-center py-12">
            {SETTINGS_MESSAGES.print.noEntries}
          </p>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-border text-center print-no-break">
          <p className="text-base text-text-secondary">
            {SETTINGS_MESSAGES.print.footer}
          </p>
          <p className="text-base text-text-secondary mt-1">
            {SETTINGS_MESSAGES.print.disclaimer}
          </p>
        </footer>
      </div>
    </div>
  );
}
