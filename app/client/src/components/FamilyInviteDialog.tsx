import { useState, useRef, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { createInvitation } from "../lib/family-api";
import { RelationshipPicker } from "./RelationshipPicker";

import type { ReactNode } from "react";

interface FamilyInviteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInviteCreated: () => void;
}

export function FamilyInviteDialog({
  isOpen,
  onClose,
  onInviteCreated,
}: FamilyInviteDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [relationship, setRelationship] = useState("");
  const [relationshipLabel, setRelationshipLabel] = useState("");
  const [isRepresentative, setIsRepresentative] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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

  const handleCopy = useCallback((): void => {
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
    });
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
                className="flex items-center gap-3 w-full min-h-11 text-left"
                onClick={handleToggleRepresentative}
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
                {UI_MESSAGES.family.representativeHelp}
              </p>
            </div>

            {error !== "" && <p className="text-lg text-error">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover"
                onClick={handleClose}
              >
                やめる
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
            <p className="text-lg text-text-secondary">
              以下のリンクをご家族に共有してください。
            </p>
            <div className="rounded-card border border-border-light bg-bg-primary p-3 break-all text-base text-text-primary">
              {inviteUrl}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover"
                onClick={handleClose}
              >
                閉じる
              </button>
              <button
                type="button"
                className="flex-1 min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors"
                onClick={handleCopy}
              >
                {copied ? "コピーしました" : "コピー"}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
