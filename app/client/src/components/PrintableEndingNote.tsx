import { useState, useEffect, useCallback } from "react";

import { useEndingNote } from "../hooks/useEndingNote";
import { getUserProfile } from "../lib/storage";
import { SETTINGS_MESSAGES, UI_MESSAGES } from "../lib/constants";
import { QUESTION_CATEGORIES } from "../lib/questions";

import type { ReactNode } from "react";
import type { CategoryNoteData } from "../hooks/useEndingNote";

interface PrintableEndingNoteProps {
  onClose: () => void;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function PrintableCategory({ data }: { data: CategoryNoteData }): ReactNode {
  if (data.noteEntries.length === 0) {
    return null;
  }

  const categoryInfo = QUESTION_CATEGORIES.find(
    (cat) => cat.id === data.category,
  );

  return (
    <section className="print-no-break mb-8">
      <div className="flex items-center gap-2 mb-4 border-b-2 border-text-primary/20 pb-2">
        {categoryInfo !== undefined && (
          <span className="text-xl">{categoryInfo.icon}</span>
        )}
        <h2 className="text-xl font-semibold text-text-primary">
          {data.label}
        </h2>
        <span className="text-base text-text-secondary ml-auto">
          {data.answeredCount}/{data.totalQuestions} 項目
        </span>
      </div>

      <div className="space-y-4 pl-2">
        {data.noteEntries.map((entry) => (
          <div key={entry.questionId} className="print-no-break">
            <p className="text-lg font-medium text-text-secondary">
              {entry.questionTitle}
            </p>
            <p className="text-lg text-text-primary leading-relaxed mt-1 pl-4 border-l-2 border-accent-primary/30">
              {entry.answer}
            </p>
          </div>
        ))}
      </div>

      {data.disclaimer !== undefined && (
        <p className="text-base text-text-secondary mt-4 italic">
          {data.disclaimer}
        </p>
      )}
    </section>
  );
}

export function PrintableEndingNote({
  onClose,
}: PrintableEndingNoteProps): ReactNode {
  const { categories, isLoading, error, refresh } = useEndingNote();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    void getUserProfile().then((profile) => {
      if (profile !== null) {
        setUserName(profile.name);
      }
    });
  }, []);

  const handlePrint = useCallback((): void => {
    window.print();
  }, []);

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
            onClick={refresh}
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
          <h1 className="text-2xl font-bold text-text-primary mb-1">
            {SETTINGS_MESSAGES.print.title}
          </h1>
          <p className="text-lg text-text-secondary">
            {SETTINGS_MESSAGES.print.subtitle}
          </p>
          {userName !== "" && (
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
