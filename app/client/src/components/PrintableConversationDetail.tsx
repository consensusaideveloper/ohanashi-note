import { useCallback } from "react";

import { QUESTION_CATEGORIES } from "../lib/questions";
import { SETTINGS_MESSAGES, TRANSCRIPT_DISCLAIMER } from "../lib/constants";

import type { ReactNode } from "react";
import type { QuestionCategory } from "../types/conversation";

interface PrintableConversationData {
  startedAt: number;
  discussedCategories: string[] | null;
  keyPoints: {
    importantStatements: string[];
    decisions: string[];
    undecidedItems: string[];
  } | null;
  summary: string | null;
  noteEntries: { questionId: string; questionTitle: string; answer: string }[];
  transcript: {
    role: "user" | "assistant";
    text: string;
    timestamp: number;
  }[];
  coveredQuestionIds: string[];
}

interface PrintableConversationDetailProps {
  data: PrintableConversationData;
  onClose: () => void;
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

function getCategoryLabel(categoryId: string): string | null {
  const info = QUESTION_CATEGORIES.find(
    (c) => c.id === (categoryId as QuestionCategory),
  );
  return info !== undefined ? info.label : null;
}

export function PrintableConversationDetail({
  data,
  onClose,
}: PrintableConversationDetailProps): ReactNode {
  const handlePrint = useCallback((): void => {
    window.print();
  }, []);

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
            {SETTINGS_MESSAGES.conversationPrint.title}
          </h1>
          <p className="text-lg text-text-secondary">
            {formatDateJapanese(data.startedAt)}
          </p>
        </header>

        {/* Discussed category tags */}
        {data.discussedCategories !== null &&
          data.discussedCategories.length > 0 && (
            <section className="print-no-break mb-6">
              <h2 className="text-xl font-semibold text-text-primary mb-2 border-b-2 border-text-primary/20 pb-2">
                話したテーマ
              </h2>
              <div className="flex flex-wrap gap-2 pl-2">
                {data.discussedCategories.map((catId) => {
                  const label = getCategoryLabel(catId);
                  return label !== null ? (
                    <span
                      key={catId}
                      className="inline-flex items-center px-3 py-1.5 rounded-full bg-accent-primary-light text-text-primary text-lg"
                    >
                      {label}
                    </span>
                  ) : null;
                })}
              </div>
            </section>
          )}

        {/* Structured key points */}
        {data.keyPoints !== null && (
          <section className="print-no-break mb-6">
            {data.keyPoints.importantStatements.length > 0 && (
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-text-primary mb-2 border-b-2 border-text-primary/20 pb-2">
                  重要な発言
                </h2>
                <ul className="space-y-1.5 pl-2">
                  {data.keyPoints.importantStatements.map((item, i) => (
                    <li
                      key={`important-${i}`}
                      className="text-lg text-text-primary leading-relaxed flex gap-2"
                    >
                      <span className="text-accent-primary flex-none">●</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.keyPoints.decisions.length > 0 && (
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-text-primary mb-2 border-b-2 border-text-primary/20 pb-2">
                  決定事項
                </h2>
                <ul className="space-y-1.5 pl-2">
                  {data.keyPoints.decisions.map((item, i) => (
                    <li
                      key={`decision-${i}`}
                      className="text-lg text-text-primary leading-relaxed flex gap-2"
                    >
                      <span className="text-success flex-none">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.keyPoints.undecidedItems.length > 0 && (
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-text-primary mb-2 border-b-2 border-text-primary/20 pb-2">
                  まだ未確定の事項
                </h2>
                <ul className="space-y-1.5 pl-2">
                  {data.keyPoints.undecidedItems.map((item, i) => (
                    <li
                      key={`undecided-${i}`}
                      className="text-lg text-text-primary leading-relaxed flex gap-2"
                    >
                      <span className="text-text-secondary flex-none">○</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Fallback: free-text summary for records without keyPoints */}
        {data.keyPoints === null && data.summary !== null && (
          <section className="print-no-break mb-6">
            <h2 className="text-xl font-semibold text-text-primary mb-2 border-b-2 border-text-primary/20 pb-2">
              会話のまとめ
            </h2>
            <p className="text-lg text-text-primary leading-relaxed pl-2">
              {data.summary}
            </p>
          </section>
        )}

        {/* Conversation contribution summary */}
        {data.coveredQuestionIds.length > 0 && (
          <div className="print-no-break mb-6 px-4 py-3 bg-accent-primary-light/20 rounded-card">
            <p className="text-lg text-text-primary">
              この会話で{" "}
              <span className="font-semibold">
                {data.coveredQuestionIds.length}項目
              </span>{" "}
              に回答しました
            </p>
          </div>
        )}

        {/* Recorded note entries */}
        {data.noteEntries.length > 0 && (
          <section className="print-no-break mb-6">
            <h2 className="text-xl font-semibold text-text-primary mb-3 border-b-2 border-text-primary/20 pb-2">
              この会話で記録された内容
            </h2>
            <div className="space-y-3 pl-2">
              {data.noteEntries.map((entry) => (
                <div key={entry.questionId} className="print-no-break">
                  <p className="text-lg font-medium text-text-secondary">
                    {entry.questionTitle}
                  </p>
                  <p className="text-lg text-text-primary mt-0.5 pl-4 border-l-2 border-accent-primary/30">
                    {entry.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Transcript */}
        {data.transcript.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xl font-semibold text-text-primary mb-3 border-b-2 border-text-primary/20 pb-2">
              会話のやり取り
            </h2>

            <div className="print-no-break mb-4 px-3 py-2 bg-bg-surface rounded-xl">
              <p className="text-base text-text-secondary leading-relaxed">
                {TRANSCRIPT_DISCLAIMER}
              </p>
            </div>

            <div className="space-y-2 pl-2">
              {data.transcript.map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className="text-lg">
                  <span className="font-medium text-text-secondary">
                    {entry.role === "user" ? "わたし" : "話し相手"}:
                  </span>{" "}
                  <span className="text-text-primary leading-relaxed">
                    {entry.text}
                  </span>
                </div>
              ))}
            </div>
          </section>
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
