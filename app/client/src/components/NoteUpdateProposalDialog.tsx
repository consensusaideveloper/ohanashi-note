import { useState, useCallback, useRef, useEffect } from "react";

import { QUESTION_CATEGORIES } from "../lib/questions";
import {
  applyConversationNoteUpdates,
  dismissConversationNoteUpdates,
} from "../lib/storage";
import { useToast } from "../hooks/useToast";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type { NoteUpdateProposal } from "../types/conversation";

// --- Constants ---

const PROPOSAL_MESSAGES = {
  title: "ノートの更新候補があります",
  description: "お話の中から、ノートに追加・更新できる内容が見つかりました。",
  proposalCountPrefix: "件中",
  proposalCountSuffix: "件目",
  categoryLabel: "カテゴリ",
  questionLabel: "項目",
  currentLabel: "現在の記録",
  proposedLabel: "お話の内容",
  noCurrentRecord: "まだ記録がありません",
  approveButton: "ノートに反映する",
  skipButton: "この項目はスキップ",
  laterButton: "あとで確認する",
  approveSuccess: "ノートを更新しました",
  approveFailed: "ノートの更新に失敗しました。もう一度お試しください。",
  doneTitle: "確認が終わりました",
  doneApplied: "件の内容をノートに反映しました",
  doneNoneApplied: "今回は反映する内容はありませんでした",
  closeButton: "閉じる",
  saving: "保存しています...",
  dismissFailed: "スキップの処理中にエラーがありました",
  addBadge: "新しく追加",
  updateBadge: "内容を更新",
} as const;

const DIALOG_TITLE_ID = "proposal-dialog-title";

// --- Props ---

interface NoteUpdateProposalDialogProps {
  conversationId: string;
  proposals: NoteUpdateProposal[];
  onComplete: () => void;
}

// --- Component ---

export function NoteUpdateProposalDialog({
  conversationId,
  proposals,
  onComplete,
}: NoteUpdateProposalDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>): void => {
      if (e.target === dialogRef.current) {
        // Do nothing — prevent accidental dismiss
      }
    },
    [],
  );

  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>): void => {
      e.preventDefault();
    },
    [],
  );

  const moveToNext = useCallback((): void => {
    if (currentIndex < proposals.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsDone(true);
    }
  }, [currentIndex, proposals.length]);

  const handleApprove = useCallback((): void => {
    const proposal = proposals[currentIndex];
    if (proposal === undefined || isSaving) return;

    setIsSaving(true);
    applyConversationNoteUpdates(conversationId, [
      {
        questionId: proposal.questionId,
        proposedAnswer: proposal.proposedAnswer,
      },
    ])
      .then(() => {
        setApprovedIds((prev) => [...prev, proposal.questionId]);
        showToast(PROPOSAL_MESSAGES.approveSuccess, "success");
        moveToNext();
      })
      .catch((err: unknown) => {
        console.error("Failed to apply note update proposal:", {
          error: err,
          conversationId,
          questionId: proposal.questionId,
        });
        showToast(PROPOSAL_MESSAGES.approveFailed, "error");
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [
    currentIndex,
    proposals,
    isSaving,
    conversationId,
    showToast,
    moveToNext,
  ]);

  const handleSkip = useCallback((): void => {
    const proposal = proposals[currentIndex];
    if (proposal === undefined || isSaving) return;

    setIsSaving(true);
    dismissConversationNoteUpdates(conversationId, [
      {
        questionId: proposal.questionId,
        proposedAnswer: proposal.proposedAnswer,
      },
    ])
      .then(() => {
        moveToNext();
      })
      .catch((err: unknown) => {
        console.error("Failed to dismiss note update proposal:", {
          error: err,
          conversationId,
          questionId: proposal.questionId,
        });
        showToast(PROPOSAL_MESSAGES.dismissFailed, "error");
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [
    currentIndex,
    proposals,
    isSaving,
    conversationId,
    showToast,
    moveToNext,
  ]);

  const handleLater = useCallback((): void => {
    if (isSaving) return;
    dialogRef.current?.close();
    onComplete();
  }, [isSaving, onComplete]);

  const handleClose = useCallback((): void => {
    dialogRef.current?.close();
    onComplete();
  }, [onComplete]);

  const getCategoryLabel = (categoryId: string): string => {
    const found = QUESTION_CATEGORIES.find((c) => c.id === categoryId);
    return found?.label ?? categoryId;
  };

  if (isDone) {
    const appliedCount = approvedIds.length;
    return (
      <dialog
        ref={dialogRef}
        aria-labelledby={DIALOG_TITLE_ID}
        className="backdrop:bg-black/40 bg-transparent p-0 m-auto rounded-card max-w-md w-[calc(100%-2rem)]"
        onClick={handleBackdropClick}
        onCancel={handleNativeCancel}
      >
        <div className="bg-bg-surface rounded-card p-6 shadow-lg space-y-5">
          <h2
            id={DIALOG_TITLE_ID}
            className="text-xl font-semibold text-text-primary"
          >
            {PROPOSAL_MESSAGES.doneTitle}
          </h2>
          <p className="text-lg text-text-primary leading-relaxed">
            {appliedCount > 0
              ? `${String(appliedCount)}${PROPOSAL_MESSAGES.doneApplied}`
              : PROPOSAL_MESSAGES.doneNoneApplied}
          </p>
          <button
            type="button"
            className="w-full min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors"
            onClick={handleClose}
          >
            {PROPOSAL_MESSAGES.closeButton}
          </button>
        </div>
      </dialog>
    );
  }

  const proposal = proposals[currentIndex];
  if (proposal === undefined) return null;

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby={DIALOG_TITLE_ID}
        className="backdrop:bg-black/40 bg-transparent p-0 m-auto rounded-card max-w-md w-[calc(100%-2rem)]"
        onClick={handleBackdropClick}
        onCancel={handleNativeCancel}
      >
        <div className="bg-bg-surface rounded-card p-6 shadow-lg space-y-5">
          {/* Title + progress */}
          <div className="space-y-1">
            <h2
              id={DIALOG_TITLE_ID}
              className="text-xl font-semibold text-text-primary"
            >
              {PROPOSAL_MESSAGES.title}
            </h2>
            <p className="text-base text-text-secondary">
              {PROPOSAL_MESSAGES.description}
            </p>
            <p
              className="text-base text-text-secondary"
              aria-live="polite"
              role="status"
            >
              {String(proposals.length)}
              {PROPOSAL_MESSAGES.proposalCountPrefix}
              {String(currentIndex + 1)}
              {PROPOSAL_MESSAGES.proposalCountSuffix}
            </p>
          </div>

          {/* Category + question info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full bg-accent-secondary-light text-accent-secondary-hover px-3 py-0.5 text-base font-medium">
                {getCategoryLabel(proposal.category)}
              </span>
              <span className="inline-block rounded-full bg-bg-surface-hover text-text-secondary px-3 py-0.5 text-base font-medium">
                {proposal.proposalType === "add"
                  ? PROPOSAL_MESSAGES.addBadge
                  : PROPOSAL_MESSAGES.updateBadge}
              </span>
            </div>
            <p className="text-lg font-medium text-text-primary">
              {proposal.questionTitle}
            </p>
          </div>

          {/* Current vs proposed */}
          <div className="space-y-3">
            {proposal.previousAnswer !== null && (
              <div className="rounded-card border border-border-light bg-bg-surface p-3 space-y-1">
                <p className="text-base font-medium text-text-secondary">
                  {PROPOSAL_MESSAGES.currentLabel}
                </p>
                <p className="text-lg text-text-primary leading-relaxed">
                  {proposal.previousAnswer}
                </p>
              </div>
            )}
            <div className="rounded-card border border-accent-primary bg-accent-primary-light p-3 space-y-1">
              <p className="text-base font-medium text-accent-primary-hover">
                {PROPOSAL_MESSAGES.proposedLabel}
              </p>
              <p className="text-lg text-text-primary leading-relaxed">
                {proposal.proposedAnswer}
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-2">
            <button
              type="button"
              className={`w-full min-h-11 rounded-full text-lg transition-colors ${
                isSaving
                  ? "bg-bg-surface text-text-secondary border border-border cursor-default"
                  : "bg-accent-primary text-text-on-accent"
              }`}
              onClick={handleApprove}
              disabled={isSaving}
            >
              {isSaving
                ? PROPOSAL_MESSAGES.saving
                : PROPOSAL_MESSAGES.approveButton}
            </button>
            <button
              type="button"
              className="w-full min-h-11 rounded-full border border-border-light text-lg text-text-secondary transition-colors hover:bg-bg-surface-hover active:bg-bg-surface-hover"
              onClick={handleSkip}
              disabled={isSaving}
            >
              {PROPOSAL_MESSAGES.skipButton}
            </button>
            <button
              type="button"
              className="w-full min-h-11 rounded-full text-lg text-text-secondary transition-colors hover:bg-bg-surface-hover active:bg-bg-surface-hover"
              onClick={handleLater}
              disabled={isSaving}
            >
              {PROPOSAL_MESSAGES.laterButton}
            </button>
          </div>
        </div>
      </dialog>

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </>
  );
}
