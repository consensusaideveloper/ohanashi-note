import { useState, useRef, useEffect, useCallback } from "react";

import {
  UI_MESSAGES,
  INVITE_SHARE_MESSAGES,
  MAX_REPRESENTATIVES,
} from "../lib/constants";
import { createInvitation } from "../lib/family-api";
import { RelationshipPicker } from "./RelationshipPicker";

import type { ReactNode } from "react";

interface FamilyInviteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInviteCreated: () => void;
  isMaxRepresentatives: boolean;
}

export function FamilyInviteDialog({
  isOpen,
  onClose,
  onInviteCreated,
  isMaxRepresentatives,
}: FamilyInviteDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [relationship, setRelationship] = useState("");
  const [relationshipLabel, setRelationshipLabel] = useState("");
  const [isRepresentative, setIsRepresentative] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setRelationship("");
      setRelationshipLabel("");
      setIsRepresentative(false);
      setInviteUrl("");
      setIsCreating(false);
      setError("");
      setCopied(false);
      setShared(false);
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>): void => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>): void => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  const handleToggleRepresentative = useCallback((): void => {
    setIsRepresentative((prev) => !prev);
  }, []);

  const handleCreateInvite = useCallback((): void => {
    if (relationship === "" || relationshipLabel === "") {
      return;
    }
    setIsCreating(true);
    setError("");
    void createInvitation({
      relationship,
      relationshipLabel,
      role: isRepresentative ? "representative" : "member",
    })
      .then((invitation) => {
        const url = `${window.location.origin}/invite/${invitation.token}`;
        setInviteUrl(url);
        onInviteCreated();
      })
      .catch((err: unknown) => {
        console.error("Failed to create invitation:", { error: err });
        setError(UI_MESSAGES.familyError.inviteFailed);
      })
      .finally(() => {
        setIsCreating(false);
      });
  }, [relationship, relationshipLabel, isRepresentative, onInviteCreated]);

  const handleShare = useCallback((): void => {
    if (typeof navigator.share === "function") {
      void navigator
        .share({
          title: INVITE_SHARE_MESSAGES.shareTitle,
          text: INVITE_SHARE_MESSAGES.shareText,
          url: inviteUrl,
        })
        .then(() => {
          setShared(true);
        })
        .catch((err: unknown) => {
          // User cancelled the share dialog — not an error
          if (err instanceof Error && err.name === "AbortError") return;
          console.error("Failed to share invitation:", { error: err });
        });
    } else {
      // Fallback: copy to clipboard on desktop/unsupported browsers
      void navigator.clipboard.writeText(inviteUrl).then(() => {
        setCopied(true);
      });
    }
  }, [inviteUrl]);

  const handleClose = useCallback((): void => {
    onClose();
  }, [onClose]);

  const canCreate = relationship !== "" && relationshipLabel !== "";

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/40 bg-transparent p-0 m-auto rounded-card max-w-sm w-[calc(100%-2rem)]"
      onClick={handleBackdropClick}
      onCancel={handleNativeCancel}
    >
      <div className="bg-bg-surface rounded-card p-6 shadow-lg space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">
          {UI_MESSAGES.family.inviteDialogTitle}
        </h2>

        {inviteUrl === "" ? (
          <>
            <RelationshipPicker
              value={relationship}
              label={relationshipLabel}
              onRelationshipChange={setRelationship}
              onLabelChange={setRelationshipLabel}
            />

            <div className="space-y-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={isRepresentative}
                aria-disabled={isMaxRepresentatives}
                className={`flex items-center gap-3 w-full min-h-11 text-left ${
                  isMaxRepresentatives && !isRepresentative
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
                onClick={
                  isMaxRepresentatives && !isRepresentative
                    ? undefined
                    : handleToggleRepresentative
                }
              >
                <span
                  className={`flex-none w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                    isRepresentative
                      ? "bg-accent-primary border-accent-primary"
                      : "bg-bg-surface border-border"
                  }`}
                >
                  {isRepresentative && (
                    <svg
                      className="w-4 h-4 text-text-on-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
                <span className="text-lg text-text-primary">
                  この方を代表者に指定する
                </span>
              </button>
              <p className="text-base text-text-secondary pl-9">
                {isMaxRepresentatives
                  ? `${UI_MESSAGES.family.representativeHelp}\n（代表者は最大${String(MAX_REPRESENTATIVES)}名まで指定できます）`
                  : UI_MESSAGES.family.representativeHelp}
              </p>
            </div>

            {error !== "" && <p className="text-lg text-error">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover"
                onClick={handleClose}
              >
                もどる
              </button>
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors disabled:opacity-50"
                disabled={!canCreate || isCreating}
                onClick={handleCreateInvite}
              >
                {isCreating ? "作成中..." : "招待リンクを作成"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-card bg-accent-secondary/10 p-4">
              {/* Checkmark icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 flex-none text-accent-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-lg text-text-primary">
                {INVITE_SHARE_MESSAGES.created}
              </p>
            </div>

            <p className="text-lg text-text-secondary">
              {INVITE_SHARE_MESSAGES.instruction}
            </p>

            {/* Primary action: Share or Copy */}
            <button
              type="button"
              className="w-full min-h-12 rounded-full bg-accent-primary text-text-on-accent text-lg flex items-center justify-center gap-2 transition-colors active:opacity-90"
              onClick={handleShare}
            >
              {shared ? (
                INVITE_SHARE_MESSAGES.shared
              ) : copied ? (
                INVITE_SHARE_MESSAGES.copied
              ) : (
                <>
                  {/* Share icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
                    />
                  </svg>
                  {INVITE_SHARE_MESSAGES.shareButton}
                </>
              )}
            </button>

            <button
              type="button"
              className="w-full min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover"
              onClick={handleClose}
            >
              {INVITE_SHARE_MESSAGES.closeButton}
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
