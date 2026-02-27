import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { ApiError } from "../lib/api";
import {
  getLifecycleState,
  initiateConsent,
  cancelDeathReport,
  leaveFamilyConnection,
} from "../lib/family-api";
import { useToast } from "../hooks/useToast";
import { RoleBadge } from "./RoleBadge";
import { LifecycleStatusBanner } from "./LifecycleStatusBanner";
import { DeathReportDialog } from "./DeathReportDialog";
import { ConsentScreen } from "./ConsentScreen";
import { ConsentProgressTracker } from "./ConsentProgressTracker";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type { FamilyConnection } from "../lib/family-api";

/** Lifecycle states where self-removal is blocked. */
const LEAVE_BLOCKED_STATES = ["consent_gathering"];

interface CreatorDetailViewProps {
  connection: FamilyConnection;
  onBack: () => void;
  onViewNote: (creatorId: string, creatorName: string) => void;
  onViewTodos: (creatorId: string, creatorName: string) => void;
  onLeave: (creatorId: string) => void;
}

export function CreatorDetailView({
  connection,
  onBack,
  onViewNote,
  onViewTodos,
  onLeave,
}: CreatorDetailViewProps): ReactNode {
  const [lifecycleStatus, setLifecycleStatus] = useState(
    connection.lifecycleStatus,
  );
  const [isLoadingLifecycle, setIsLoadingLifecycle] = useState(false);
  const [showDeathReportDialog, setShowDeathReportDialog] = useState(false);
  const [showCancelDeathConfirm, setShowCancelDeathConfirm] = useState(false);
  const [showInitiateConsentConfirm, setShowInitiateConsentConfirm] =
    useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const isRepresentative = connection.role === "representative";

  const refreshLifecycle = useCallback((): void => {
    setIsLoadingLifecycle(true);
    void getLifecycleState(connection.creatorId)
      .then((state) => {
        setLifecycleStatus(state.status);
      })
      .catch((err: unknown) => {
        console.error("Failed to refresh lifecycle state:", {
          error: err,
          creatorId: connection.creatorId,
        });
      })
      .finally(() => {
        setIsLoadingLifecycle(false);
      });
  }, [connection.creatorId]);

  useEffect(() => {
    refreshLifecycle();
  }, [refreshLifecycle]);

  // --- Death report handlers ---
  const handleOpenDeathReport = useCallback((): void => {
    setShowDeathReportDialog(true);
  }, []);

  const handleCloseDeathReport = useCallback((): void => {
    setShowDeathReportDialog(false);
  }, []);

  const handleDeathReported = useCallback((): void => {
    setLifecycleStatus("death_reported");
    showToast("逝去報告が完了しました", "success");
  }, [showToast]);

  // --- Cancel death report handlers ---
  const handleOpenCancelDeath = useCallback((): void => {
    setShowCancelDeathConfirm(true);
  }, []);

  const handleCancelDeathConfirm = useCallback((): void => {
    setShowCancelDeathConfirm(false);
    setIsProcessing(true);
    void cancelDeathReport(connection.creatorId)
      .then(() => {
        setLifecycleStatus("active");
        showToast("逝去報告を取り消しました", "success");
      })
      .catch((err: unknown) => {
        console.error("Failed to cancel death report:", {
          error: err,
          creatorId: connection.creatorId,
        });
        showToast(UI_MESSAGES.familyError.cancelDeathFailed, "error");
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }, [connection.creatorId, showToast]);

  const handleCancelDeathClose = useCallback((): void => {
    setShowCancelDeathConfirm(false);
  }, []);

  // --- Initiate consent handlers ---
  const handleOpenInitiateConsent = useCallback((): void => {
    setShowInitiateConsentConfirm(true);
  }, []);

  const handleInitiateConsentConfirm = useCallback((): void => {
    setShowInitiateConsentConfirm(false);
    setIsProcessing(true);
    void initiateConsent(connection.creatorId)
      .then(() => {
        setLifecycleStatus("consent_gathering");
        showToast("同意収集を開始しました", "success");
      })
      .catch((err: unknown) => {
        console.error("Failed to initiate consent:", {
          error: err,
          creatorId: connection.creatorId,
        });
        showToast(UI_MESSAGES.familyError.consentFailed, "error");
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }, [connection.creatorId, showToast]);

  const handleInitiateConsentClose = useCallback((): void => {
    setShowInitiateConsentConfirm(false);
  }, []);

  // --- View note handler ---
  const handleViewNote = useCallback((): void => {
    onViewNote(connection.creatorId, connection.creatorName);
  }, [onViewNote, connection.creatorId, connection.creatorName]);

  // --- View todos handler ---
  const handleViewTodos = useCallback((): void => {
    onViewTodos(connection.creatorId, connection.creatorName);
  }, [onViewTodos, connection.creatorId, connection.creatorName]);

  // --- Leave handlers ---
  const handleOpenLeave = useCallback((): void => {
    setShowLeaveConfirm(true);
  }, []);

  const handleLeaveConfirm = useCallback((): void => {
    setShowLeaveConfirm(false);
    setIsProcessing(true);
    void leaveFamilyConnection(connection.creatorId)
      .then(() => {
        showToast(UI_MESSAGES.family.memberLeft, "success");
        onLeave(connection.creatorId);
      })
      .catch((err: unknown) => {
        console.error("Failed to leave family:", {
          error: err,
          creatorId: connection.creatorId,
        });
        if (err instanceof ApiError && err.status === 409) {
          showToast(UI_MESSAGES.familyError.leaveBlockedByLifecycle, "error");
        } else {
          showToast(UI_MESSAGES.familyError.leaveFailed, "error");
        }
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }, [connection.creatorId, showToast, onLeave]);

  const handleLeaveClose = useCallback((): void => {
    setShowLeaveConfirm(false);
  }, []);

  const isOpened = lifecycleStatus === "opened";
  const isLeaveBlocked = LEAVE_BLOCKED_STATES.includes(lifecycleStatus);

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header with back button */}
      <div className="flex-none px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full transition-colors active:bg-bg-surface-hover"
            onClick={onBack}
            aria-label="一覧に戻る"
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
          <h1 className="text-2xl font-bold text-text-primary flex-1 truncate">
            {connection.creatorName}さん
          </h1>
          <RoleBadge role={connection.role} />
        </div>

        <p className="text-lg text-text-secondary">
          {connection.relationshipLabel}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-6 max-w-lg mx-auto">
          {/* Lifecycle status */}
          <LifecycleStatusBanner
            status={lifecycleStatus}
            creatorName={connection.creatorName}
          />

          {isLoadingLifecycle && (
            <p className="text-lg text-text-secondary">読み込み中...</p>
          )}

          {/* Actions based on lifecycle status and role */}
          {!isLoadingLifecycle && (
            <>
              {/* Active state: representative can report death */}
              {lifecycleStatus === "active" && isRepresentative && (
                <section className="space-y-3">
                  <p className="text-lg text-text-secondary">
                    {UI_MESSAGES.family.noteNotOpened}
                  </p>
                  <button
                    type="button"
                    className="w-full min-h-11 rounded-full border border-error text-error bg-bg-surface text-lg transition-colors active:bg-error-light disabled:opacity-50"
                    onClick={handleOpenDeathReport}
                    disabled={isProcessing}
                  >
                    {UI_MESSAGES.family.reportDeathButton}
                  </button>
                </section>
              )}

              {lifecycleStatus === "active" && !isRepresentative && (
                <p className="text-lg text-text-secondary">
                  {UI_MESSAGES.family.noteNotOpened}
                </p>
              )}

              {/* Death reported: representative can initiate consent or cancel */}
              {lifecycleStatus === "death_reported" && isRepresentative && (
                <section className="space-y-3">
                  <button
                    type="button"
                    className="w-full min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover disabled:opacity-50"
                    onClick={handleOpenInitiateConsent}
                    disabled={isProcessing}
                  >
                    {UI_MESSAGES.family.initiateConsentButton}
                  </button>
                  <button
                    type="button"
                    className="w-full min-h-11 rounded-full border border-border text-text-secondary bg-bg-surface text-lg transition-colors active:bg-bg-surface-hover disabled:opacity-50"
                    onClick={handleOpenCancelDeath}
                    disabled={isProcessing}
                  >
                    {UI_MESSAGES.family.cancelDeathReportButton}
                  </button>
                </section>
              )}

              {lifecycleStatus === "death_reported" && !isRepresentative && (
                <p className="text-lg text-text-secondary">
                  {UI_MESSAGES.family.waitingForRepresentative}
                </p>
              )}

              {/* Consent gathering: show consent UI for all members */}
              {lifecycleStatus === "consent_gathering" && (
                <section className="space-y-4">
                  <ConsentScreen
                    creatorId={connection.creatorId}
                    creatorName={connection.creatorName}
                  />
                  {isRepresentative && (
                    <ConsentProgressTracker creatorId={connection.creatorId} />
                  )}
                </section>
              )}

              {/* Opened: view note, todos, and access management */}
              {isOpened && (
                <section className="space-y-3">
                  <button
                    type="button"
                    className="w-full min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover"
                    onClick={handleViewNote}
                  >
                    {UI_MESSAGES.family.viewNoteButton}
                  </button>
                  <button
                    type="button"
                    className="w-full min-h-11 rounded-full border border-accent-secondary text-accent-secondary bg-bg-surface text-lg transition-colors active:bg-success-light"
                    onClick={handleViewTodos}
                  >
                    {UI_MESSAGES.todo.pageTitle}
                  </button>
                </section>
              )}

              {/* Leave family button (hidden during consent_gathering) */}
              {!isLeaveBlocked && (
                <section className="pt-4 border-t border-border">
                  <button
                    type="button"
                    className="w-full min-h-11 rounded-full border border-error text-error bg-bg-surface text-lg transition-colors active:bg-error-light disabled:opacity-50"
                    onClick={handleOpenLeave}
                    disabled={isProcessing}
                  >
                    {UI_MESSAGES.family.leaveButton}
                  </button>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Death report dialog */}
      <DeathReportDialog
        isOpen={showDeathReportDialog}
        onClose={handleCloseDeathReport}
        creatorId={connection.creatorId}
        creatorName={connection.creatorName}
        onReported={handleDeathReported}
      />

      {/* Cancel death report confirmation */}
      <ConfirmDialog
        isOpen={showCancelDeathConfirm}
        title={UI_MESSAGES.family.cancelDeathReportButton}
        message={UI_MESSAGES.family.cancelDeathReportConfirmMessage}
        confirmLabel="取り消す"
        cancelLabel="やめる"
        onConfirm={handleCancelDeathConfirm}
        onCancel={handleCancelDeathClose}
      />

      {/* Initiate consent confirmation */}
      <ConfirmDialog
        isOpen={showInitiateConsentConfirm}
        title={UI_MESSAGES.family.initiateConsentButton}
        message={UI_MESSAGES.family.initiateConsentMessage}
        confirmLabel="開始する"
        cancelLabel="やめる"
        onConfirm={handleInitiateConsentConfirm}
        onCancel={handleInitiateConsentClose}
      />

      {/* Leave family confirmation */}
      <ConfirmDialog
        isOpen={showLeaveConfirm}
        title={UI_MESSAGES.family.leaveConfirmTitle}
        message={
          isOpened
            ? UI_MESSAGES.family.leaveConfirmMessageOpened
            : UI_MESSAGES.family.leaveConfirmMessage
        }
        confirmLabel="脱退する"
        cancelLabel="やめる"
        onConfirm={handleLeaveConfirm}
        onCancel={handleLeaveClose}
      />

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </div>
  );
}
