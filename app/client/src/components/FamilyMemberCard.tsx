import { useState, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { RoleBadge } from "./RoleBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditMemberDialog } from "./EditMemberDialog";

import type { ReactNode } from "react";
import type { FamilyMember } from "../lib/family-api";

/** Lifecycle states where creator-initiated deletion is blocked. */
const DELETION_BLOCKED_STATES = ["consent_gathering", "death_reported"];

interface FamilyMemberCardProps {
  member: FamilyMember;
  lifecycleStatus: string;
  onRemove: (id: string) => void;
  onSetRepresentative: (id: string) => void;
  onRevokeRepresentative: (id: string) => void;
  onUpdate: (
    id: string,
    data: { relationship: string; relationshipLabel: string },
  ) => void;
  isMaxRepresentatives: boolean;
}

function getRemoveConfirmMessage(
  member: FamilyMember,
  lifecycleStatus: string,
): string {
  const isRepresentative = member.role === "representative";
  const isOpened = lifecycleStatus === "opened";

  if (isRepresentative && isOpened) {
    return UI_MESSAGES.family.removeConfirmMessageRepresentativeOpened;
  }
  if (isRepresentative) {
    return UI_MESSAGES.family.removeConfirmMessageRepresentative;
  }
  if (isOpened) {
    return UI_MESSAGES.family.removeConfirmMessageOpened;
  }
  return UI_MESSAGES.family.removeConfirmMessage;
}

export function FamilyMemberCard({
  member,
  lifecycleStatus,
  onRemove,
  onSetRepresentative,
  onRevokeRepresentative,
  onUpdate,
  isMaxRepresentatives,
}: FamilyMemberCardProps): ReactNode {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const isDeletionBlocked = DELETION_BLOCKED_STATES.includes(lifecycleStatus);

  const handleRemoveClick = useCallback((): void => {
    setShowRemoveConfirm(true);
  }, []);

  const handleRemoveConfirm = useCallback((): void => {
    setShowRemoveConfirm(false);
    onRemove(member.id);
  }, [onRemove, member.id]);

  const handleRemoveCancel = useCallback((): void => {
    setShowRemoveConfirm(false);
  }, []);

  const handleSetRepresentative = useCallback((): void => {
    onSetRepresentative(member.id);
  }, [onSetRepresentative, member.id]);

  const handleRevokeClick = useCallback((): void => {
    setShowRevokeConfirm(true);
  }, []);

  const handleRevokeConfirm = useCallback((): void => {
    setShowRevokeConfirm(false);
    onRevokeRepresentative(member.id);
  }, [onRevokeRepresentative, member.id]);

  const handleRevokeCancel = useCallback((): void => {
    setShowRevokeConfirm(false);
  }, []);

  const handleEditClick = useCallback((): void => {
    setShowEditDialog(true);
  }, []);

  const handleEditClose = useCallback((): void => {
    setShowEditDialog(false);
  }, []);

  return (
    <div className="rounded-card border border-border-light bg-bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xl font-medium text-text-primary truncate">
            {member.name}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-lg text-text-secondary">
              {member.relationshipLabel}
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-1 min-h-11 min-w-11 justify-center text-accent-primary transition-colors active:text-accent-primary-hover"
              onClick={handleEditClick}
              aria-label="家族情報を編集"
            >
              {/* Pencil icon */}
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
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                />
              </svg>
              <span className="text-base">{UI_MESSAGES.family.editMember}</span>
            </button>
          </div>
        </div>
        <RoleBadge role={member.role} />
      </div>

      <div className="flex gap-2">
        {member.role === "representative" ? (
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full border border-border bg-bg-surface text-text-secondary text-lg transition-colors active:bg-bg-surface-hover"
            onClick={handleRevokeClick}
          >
            {UI_MESSAGES.family.revokeRepresentative}
          </button>
        ) : (
          <button
            type="button"
            className={`flex-1 min-h-11 rounded-full border text-lg transition-colors ${
              isMaxRepresentatives
                ? "border-border text-text-secondary bg-bg-surface opacity-50 cursor-not-allowed"
                : "border-accent-primary text-accent-primary bg-bg-surface active:bg-accent-primary-light"
            }`}
            onClick={handleSetRepresentative}
            disabled={isMaxRepresentatives}
          >
            {UI_MESSAGES.family.setRepresentative}
          </button>
        )}
        <button
          type="button"
          className={`min-h-11 min-w-11 rounded-full border border-error text-error bg-bg-surface px-4 text-lg transition-colors ${
            isDeletionBlocked
              ? "opacity-50 cursor-not-allowed"
              : "active:bg-error-light"
          }`}
          onClick={isDeletionBlocked ? undefined : handleRemoveClick}
          disabled={isDeletionBlocked}
          aria-label="家族を削除"
          title={
            isDeletionBlocked
              ? UI_MESSAGES.family.removeDeletionBlocked
              : undefined
          }
        >
          {UI_MESSAGES.family.removeButton}
        </button>
      </div>

      <ConfirmDialog
        isOpen={showRemoveConfirm}
        title={UI_MESSAGES.family.removeConfirmTitle}
        message={getRemoveConfirmMessage(member, lifecycleStatus)}
        confirmLabel="削除する"
        cancelLabel="もどる"
        variant="danger"
        onConfirm={handleRemoveConfirm}
        onCancel={handleRemoveCancel}
      />

      <ConfirmDialog
        isOpen={showRevokeConfirm}
        title={UI_MESSAGES.family.revokeRepresentativeConfirmTitle}
        message={UI_MESSAGES.family.revokeRepresentativeConfirmMessage}
        confirmLabel="解除する"
        cancelLabel="もどる"
        variant="danger"
        onConfirm={handleRevokeConfirm}
        onCancel={handleRevokeCancel}
      />

      <EditMemberDialog
        isOpen={showEditDialog}
        member={member}
        onClose={handleEditClose}
        onSave={onUpdate}
      />
    </div>
  );
}
