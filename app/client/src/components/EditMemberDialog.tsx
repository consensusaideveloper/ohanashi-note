import { useState, useRef, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { RelationshipPicker } from "./RelationshipPicker";

import type { ReactNode } from "react";
import type { FamilyMember } from "../lib/family-api";

interface EditMemberDialogProps {
  isOpen: boolean;
  member: FamilyMember | null;
  onClose: () => void;
  onSave: (
    id: string,
    data: { relationship: string; relationshipLabel: string },
  ) => void;
}

export function EditMemberDialog({
  isOpen,
  member,
  onClose,
  onSave,
}: EditMemberDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [relationship, setRelationship] = useState("");
  const [relationshipLabel, setRelationshipLabel] = useState("");

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
    if (isOpen && member !== null) {
      setRelationship(member.relationship);
      setRelationshipLabel(member.relationshipLabel);
    }
  }, [isOpen, member]);

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

  const handleSave = useCallback((): void => {
    if (member === null || relationship === "" || relationshipLabel === "") {
      return;
    }
    onSave(member.id, { relationship, relationshipLabel });
    onClose();
  }, [member, relationship, relationshipLabel, onSave, onClose]);

  const canSave = relationship !== "" && relationshipLabel !== "";

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/40 bg-transparent p-0 m-auto rounded-card max-w-sm w-[calc(100%-2rem)]"
      onClick={handleBackdropClick}
      onCancel={handleNativeCancel}
    >
      <div className="bg-bg-surface rounded-card p-6 shadow-lg space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">
          {UI_MESSAGES.family.editMemberDialogTitle}
        </h2>

        {member !== null && (
          <p className="text-lg text-text-secondary">
            {member.name}さんの情報を編集します
          </p>
        )}

        <RelationshipPicker
          value={relationship}
          label={relationshipLabel}
          onRelationshipChange={setRelationship}
          onLabelChange={setRelationshipLabel}
        />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full border border-border-light bg-bg-surface text-lg text-text-primary transition-colors active:bg-bg-surface-hover"
            onClick={onClose}
          >
            やめる
          </button>
          <button
            type="button"
            className="flex-1 min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors disabled:opacity-50"
            disabled={!canSave}
            onClick={handleSave}
          >
            {UI_MESSAGES.family.saveButton}
          </button>
        </div>
      </div>
    </dialog>
  );
}
