import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import {
  listFamilyMembers,
  deleteFamilyMember,
  updateFamilyMember,
} from "../lib/family-api";
import { useToast } from "../hooks/useToast";
import { FamilyMemberCard } from "./FamilyMemberCard";
import { FamilyInviteDialog } from "./FamilyInviteDialog";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type { FamilyMember } from "../lib/family-api";

export function FamilyManagementSection(): ReactNode {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const loadMembers = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void listFamilyMembers()
      .then((data) => {
        setMembers(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load family members:", { error: err });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleRemove = useCallback(
    (id: string): void => {
      void deleteFamilyMember(id)
        .then(() => {
          setMembers((prev) => prev.filter((m) => m.id !== id));
          showToast(UI_MESSAGES.family.memberRemoved, "success");
        })
        .catch((err: unknown) => {
          console.error("Failed to remove family member:", {
            error: err,
            memberId: id,
          });
          showToast(UI_MESSAGES.familyError.removeFailed, "error");
        });
    },
    [showToast],
  );

  const handleSetRepresentative = useCallback(
    (id: string): void => {
      void updateFamilyMember(id, { role: "representative" })
        .then((updated) => {
          setMembers((prev) =>
            prev.map((m) => {
              if (m.id === updated.id) {
                return updated;
              }
              if (m.role === "representative") {
                return { ...m, role: "member" as const };
              }
              return m;
            }),
          );
          showToast(UI_MESSAGES.family.representativeChanged, "success");
        })
        .catch((err: unknown) => {
          console.error("Failed to set representative:", {
            error: err,
            memberId: id,
          });
          showToast(UI_MESSAGES.familyError.updateFailed, "error");
        });
    },
    [showToast],
  );

  const handleOpenInvite = useCallback((): void => {
    setShowInviteDialog(true);
  }, []);

  const handleCloseInvite = useCallback((): void => {
    setShowInviteDialog(false);
  }, []);

  const handleInviteCreated = useCallback((): void => {
    showToast(UI_MESSAGES.family.inviteCreated, "success");
  }, [showToast]);

  const handleRetry = useCallback((): void => {
    loadMembers();
  }, [loadMembers]);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-secondary">
        {UI_MESSAGES.family.sectionTitle}
      </h2>
      <p className="text-lg text-text-secondary">
        {UI_MESSAGES.family.sectionDescription}
      </p>

      {isLoading && (
        <p className="text-lg text-text-secondary">読み込み中...</p>
      )}

      {error && (
        <div className="rounded-card border border-error-light bg-error-light p-4 space-y-3">
          <p className="text-lg text-error">
            {UI_MESSAGES.familyError.loadFailed}
          </p>
          <button
            type="button"
            className="min-h-11 rounded-full border border-error text-error bg-bg-surface px-6 text-lg transition-colors active:bg-error-light"
            onClick={handleRetry}
          >
            もう一度読み込む
          </button>
        </div>
      )}

      {!isLoading && !error && members.length === 0 && (
        <p className="text-lg text-text-secondary">
          {UI_MESSAGES.family.noFamilyMembers}
        </p>
      )}

      {!isLoading && !error && members.length > 0 && (
        <div className="space-y-3">
          {members.map((member) => (
            <FamilyMemberCard
              key={member.id}
              member={member}
              onRemove={handleRemove}
              onSetRepresentative={handleSetRepresentative}
              isOnlyMember={members.length === 1}
            />
          ))}
        </div>
      )}

      {!isLoading && !error && (
        <button
          type="button"
          className="w-full min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover"
          onClick={handleOpenInvite}
        >
          {UI_MESSAGES.family.inviteButton}
        </button>
      )}

      <FamilyInviteDialog
        isOpen={showInviteDialog}
        onClose={handleCloseInvite}
        onInviteCreated={handleInviteCreated}
      />

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </section>
  );
}
