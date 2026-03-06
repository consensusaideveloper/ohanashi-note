import { useState, useCallback } from "react";

import { reactivateAccount } from "../lib/storage";
import { useAuthContext } from "../contexts/AuthContext";
import { SETTINGS_MESSAGES } from "../lib/constants";
import { useToast } from "../hooks/useToast";
import { Toast } from "./Toast";

import type { ReactNode } from "react";

interface ReactivationScreenProps {
  scheduledDeletionAt: string | null;
  onReactivated: () => void;
}

function formatJapaneseDate(isoDate: string): string {
  const date = new Date(isoDate);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${String(y)}年${String(m)}月${String(d)}日`;
}

export function ReactivationScreen({
  scheduledDeletionAt,
  onReactivated,
}: ReactivationScreenProps): ReactNode {
  const { handleSignOut } = useAuthContext();
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();
  const [isReactivating, setIsReactivating] = useState(false);

  const handleReactivate = useCallback((): void => {
    setIsReactivating(true);
    void reactivateAccount()
      .then(() => {
        showToast(SETTINGS_MESSAGES.reactivation.reactivated, "success");
        onReactivated();
      })
      .catch((error: unknown) => {
        console.error("Failed to reactivate account:", { error });
        showToast(SETTINGS_MESSAGES.reactivation.reactivateFailed, "error");
      })
      .finally(() => {
        setIsReactivating(false);
      });
  }, [onReactivated, showToast]);

  const handleLogout = useCallback((): void => {
    void handleSignOut();
  }, [handleSignOut]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-primary px-6">
      <div className="max-w-lg w-full flex flex-col items-center gap-6">
        {/* Warning icon */}
        <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-text-primary text-center">
          {SETTINGS_MESSAGES.reactivation.title}
        </h1>

        <p className="text-lg text-text-secondary text-center leading-relaxed">
          {SETTINGS_MESSAGES.reactivation.description}
        </p>

        {scheduledDeletionAt !== null && (
          <div className="w-full bg-bg-surface rounded-card border border-border-light p-4">
            <p className="text-lg text-text-secondary text-center">
              {SETTINGS_MESSAGES.reactivation.scheduledDeletionLabel}
            </p>
            <p className="text-xl text-error font-semibold text-center mt-1">
              {formatJapaneseDate(scheduledDeletionAt)}
            </p>
          </div>
        )}

        <p className="text-base text-text-secondary text-center leading-relaxed">
          {SETTINGS_MESSAGES.reactivation.shareLinkNote}
        </p>

        <button
          type="button"
          onClick={handleReactivate}
          disabled={isReactivating}
          className="w-full min-h-14 rounded-full bg-accent-primary text-text-on-accent text-xl px-8 py-4 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
        >
          {isReactivating
            ? SETTINGS_MESSAGES.reactivation.reactivating
            : SETTINGS_MESSAGES.reactivation.reactivateButton}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full min-h-11 rounded-full bg-bg-surface text-text-secondary border border-border text-lg px-6 py-3 transition-colors"
        >
          {SETTINGS_MESSAGES.reactivation.logoutButton}
        </button>
      </div>

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </div>
  );
}
