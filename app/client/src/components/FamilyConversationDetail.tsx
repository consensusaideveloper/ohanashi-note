import { useState, useEffect, useCallback, useRef } from "react";

import {
  getFamilyConversationDetail,
  getFamilyAudioUrl,
} from "../lib/family-api";
import { QUESTION_CATEGORIES } from "../lib/questions";
import { TRANSCRIPT_DISCLAIMER, UI_MESSAGES } from "../lib/constants";
import { PrintableConversationDetail } from "./PrintableConversationDetail";

import type { ReactNode } from "react";
import type { FamilyConversationDetail as FamilyConversationDetailData } from "../lib/family-api";
import type { QuestionCategory } from "../types/conversation";

interface FamilyConversationDetailProps {
  creatorId: string;
  conversationId: string;
  onBack: () => void;
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

function getCategoryLabel(categoryId: QuestionCategory): string | null {
  const info = QUESTION_CATEGORIES.find((c) => c.id === categoryId);
  return info !== undefined ? info.label : null;
}

export function FamilyConversationDetail({
  creatorId,
  conversationId,
  onBack,
}: FamilyConversationDetailProps): ReactNode {
  const [record, setRecord] = useState<FamilyConversationDetailData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const audioUrlRef = useRef<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);

  const handleOpenPrint = useCallback((): void => {
    setShowPrint(true);
  }, []);

  const handleClosePrint = useCallback((): void => {
    setShowPrint(false);
  }, []);

  const loadData = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void getFamilyConversationDetail(creatorId, conversationId)
      .then((data) => {
        setRecord(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load family conversation detail:", {
          error: err,
          creatorId,
          conversationId,
        });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [creatorId, conversationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load audio recording if available
  useEffect(() => {
    if (record === null || !record.audioAvailable) return;

    setAudioLoading(true);
    void getFamilyAudioUrl(creatorId, conversationId)
      .then(({ downloadUrl }) => fetch(downloadUrl))
      .then((response) => {
        if (!response.ok) return;
        return response.blob();
      })
      .then((blob) => {
        if (blob !== undefined) {
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          setAudioUrl(url);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load family audio recording:", {
          error: err,
          creatorId,
          conversationId,
        });
      })
      .finally(() => {
        setAudioLoading(false);
      });

    return () => {
      if (audioUrlRef.current !== null) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [record, creatorId, conversationId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lg text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  if (error || record === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-xl text-text-primary text-center leading-relaxed">
          {UI_MESSAGES.familyError.noteFetchFailed}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg px-6 py-3"
          onClick={loadData}
        >
          もう一度読み込む
        </button>
        <button
          type="button"
          className="min-h-11 rounded-full border border-border text-text-secondary text-lg px-6 py-3"
          onClick={onBack}
        >
          戻る
        </button>
      </div>
    );
  }

  // Parse noteEntries safely
  const noteEntries: {
    questionId: string;
    questionTitle: string;
    answer: string;
  }[] = [];
  if (Array.isArray(record.noteEntries)) {
    for (const entry of record.noteEntries) {
      if (typeof entry === "object" && entry !== null) {
        const typed = entry as Record<string, unknown>;
        if (
          typeof typed["questionId"] === "string" &&
          typeof typed["questionTitle"] === "string" &&
          typeof typed["answer"] === "string"
        ) {
          noteEntries.push({
            questionId: typed["questionId"],
            questionTitle: typed["questionTitle"],
            answer: typed["answer"],
          });
        }
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header with back button and date */}
      <div className="flex-none flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border-light">
        <button
          type="button"
          className="min-w-11 min-h-11 flex items-center justify-center rounded-full hover:bg-bg-surface-hover active:bg-border-light transition-colors"
          onClick={onBack}
          aria-label="戻る"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <p className="text-lg font-medium text-text-primary">
          {formatDateJapanese(record.startedAt)}
        </p>
        <button
          type="button"
          className="min-w-11 min-h-11 flex items-center justify-center rounded-full hover:bg-bg-surface-hover active:bg-border-light transition-colors ml-auto"
          onClick={handleOpenPrint}
          aria-label="印刷する"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.034v-.659"
            />
          </svg>
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Summary pending indicator */}
        {record.summaryStatus === "pending" && (
          <div className="px-4 py-3 bg-accent-primary-light/30 border-b border-border-light">
            <p className="text-lg text-text-secondary animate-pulse">
              まとめを作成中です...
            </p>
          </div>
        )}

        {/* Emotion/atmosphere analysis */}
        {record.emotionAnalysis !== null && (
          <div className="px-4 py-4 border-b border-border-light">
            <h3 className="text-lg font-semibold text-text-secondary mb-2">
              会話の雰囲気
            </h3>
            <p className="text-lg text-text-primary leading-relaxed">
              {record.emotionAnalysis}
            </p>
          </div>
        )}

        {/* Discussed category tags */}
        {record.discussedCategories !== null &&
          record.discussedCategories.length > 0 && (
            <div className="px-4 py-3 border-b border-border-light">
              <h3 className="text-lg font-semibold text-text-secondary mb-2">
                話したテーマ
              </h3>
              <div className="flex flex-wrap gap-2">
                {record.discussedCategories.map((catId) => {
                  const label = getCategoryLabel(catId as QuestionCategory);
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
            </div>
          )}

        {/* Structured key points */}
        {record.keyPoints !== null && (
          <div className="px-4 py-4 border-b border-border-light space-y-4">
            {record.keyPoints.importantStatements.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-text-secondary mb-2">
                  重要な発言
                </h3>
                <ul className="space-y-1.5">
                  {record.keyPoints.importantStatements.map((item, i) => (
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

            {record.keyPoints.decisions.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-text-secondary mb-2">
                  決定事項
                </h3>
                <ul className="space-y-1.5">
                  {record.keyPoints.decisions.map((item, i) => (
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

            {record.keyPoints.undecidedItems.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-text-secondary mb-2">
                  まだ未確定の事項
                </h3>
                <ul className="space-y-1.5">
                  {record.keyPoints.undecidedItems.map((item, i) => (
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
          </div>
        )}

        {/* Fallback: show old free-text summary for records without keyPoints */}
        {record.keyPoints === null && record.summary !== null && (
          <div className="px-4 py-4 border-b border-border-light">
            <h3 className="text-lg font-semibold text-text-secondary mb-2">
              会話のまとめ
            </h3>
            <p className="text-lg text-text-primary leading-relaxed">
              {record.summary}
            </p>
          </div>
        )}

        {/* Conversation contribution summary */}
        {record.coveredQuestionIds.length > 0 && (
          <div className="px-4 py-3 border-b border-border-light bg-accent-primary-light/20">
            <p className="text-lg text-text-primary">
              この会話で{" "}
              <span className="font-semibold">
                {record.coveredQuestionIds.length}項目
              </span>{" "}
              に回答しました
            </p>
          </div>
        )}

        {/* Recorded note entries for this conversation */}
        {noteEntries.length > 0 && (
          <div className="px-4 py-4 border-b border-border-light">
            <h3 className="text-lg font-semibold text-text-secondary mb-3">
              この会話で記録された内容
            </h3>
            <div className="space-y-3">
              {noteEntries.map((entry) => (
                <div key={entry.questionId}>
                  <p className="text-lg font-medium text-text-secondary">
                    {entry.questionTitle}
                  </p>
                  <p className="text-lg text-text-primary mt-0.5">
                    {entry.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audio recording */}
        {record.audioAvailable && (
          <div className="px-4 py-4 border-b border-border-light">
            <h3 className="text-lg font-semibold text-text-secondary mb-2">
              会話の録音
            </h3>
            {audioLoading && (
              <p className="text-lg text-text-secondary">読み込み中...</p>
            )}
            {!audioLoading && audioUrl !== null && (
              <audio
                controls
                src={audioUrl}
                className="w-full"
                preload="metadata"
              />
            )}
            {!audioLoading && audioUrl === null && (
              <p className="text-lg text-text-secondary">
                録音データを読み込めませんでした。
              </p>
            )}
          </div>
        )}

        {/* Transcript */}
        <div className="w-full max-w-lg mx-auto px-4 py-4 notebook-lines">
          {record.transcript.length > 0 && (
            <div className="flex gap-2.5 items-start mb-4 px-2 py-3 bg-bg-surface rounded-xl">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-text-secondary flex-none mt-0.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-base text-text-secondary leading-relaxed">
                {TRANSCRIPT_DISCLAIMER}
              </p>
            </div>
          )}
          {record.transcript.length === 0 ? (
            <p className="text-lg text-text-secondary text-center mt-8">
              会話内容がありません。
            </p>
          ) : (
            record.transcript.map((entry, index) => (
              <div
                key={`${entry.timestamp}-${index}`}
                className={`mb-3 flex ${
                  entry.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-card px-4 py-3 text-lg ${
                    entry.role === "user"
                      ? "bg-accent-primary-light text-text-primary"
                      : "bg-bg-surface text-text-primary shadow-sm"
                  }`}
                >
                  {entry.text}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showPrint && (
        <PrintableConversationDetail
          data={{
            startedAt: record.startedAt,
            emotionAnalysis: record.emotionAnalysis,
            discussedCategories: record.discussedCategories,
            keyPoints: record.keyPoints,
            summary: record.summary,
            noteEntries,
            transcript: record.transcript,
            coveredQuestionIds: record.coveredQuestionIds,
          }}
          onClose={handleClosePrint}
        />
      )}
    </div>
  );
}
