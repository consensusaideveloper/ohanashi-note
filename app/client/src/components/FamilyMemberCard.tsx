import { useState, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { RoleBadge } from "./RoleBadge";
import { ConfirmDialog } from "./ConfirmDialog";

import type { ReactNode } from "react";
import type { FamilyMember } from "../lib/family-api";

interface FamilyMemberCardProps {
  member: FamilyMember;
  onRemove: (id: string) => void;
  onSetRepresentative: (id: string) => void;
  isOnlyMember: boolean;
}

export function FamilyMemberCard({
  member,
  onRemove,
  onSetRepresentative,
  isOnlyMember,
}: FamilyMemberCardProps): ReactNode {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

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

  return (
    <div className="rounded-card border border-border-light bg-bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xl font-medium text-text-primary truncate">
            {member.name}
          </p>
          <p className="text-lg text-text-secondary">
            {member.relationshipLabel}
          </p>
        </div>
        <RoleBadge role={member.role} />
      </div>

      <div className="flex gap-2">
        {member.role !== "representative" && (
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full border border-accent-primary text-accent-primary bg-bg-surface text-lg transition-colors active:bg-accent-primary-light"
            onClick={handleSetRepresentative}
          >
            {UI_MESSAGES.family.setRepresentative}
          </button>
        )}
        {!isOnlyMember && (
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full border border-error text-error bg-bg-surface px-4 text-lg transition-colors active:bg-error-light"
            onClick={handleRemoveClick}
            aria-label="家族を削除"
          >
            削除
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={showRemoveConfirm}
        title={UI_MESSAGES.family.removeConfirmTitle}
        message={UI_MESSAGES.family.removeConfirmMessage}
        confirmLabel="削除する"
        cancelLabel="やめる"
        variant="danger"
        onConfirm={handleRemoveConfirm}
        onCancel={handleRemoveCancel}
      />
    </div>
  );
}
