import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import {
  listFamilyMembers,
  deleteFamilyMember,
  updateFamilyMember,
  listMyConnections,
} from "../lib/family-api";
import { useToast } from "../hooks/useToast";
import { FamilyMemberCard } from "./FamilyMemberCard";
import { FamilyInviteDialog } from "./FamilyInviteDialog";
import { RoleBadge } from "./RoleBadge";
import { LifecycleStatusBanner } from "./LifecycleStatusBanner";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type { FamilyMember, FamilyConnection } from "../lib/family-api";

interface FamilyScreenProps {
  onSelectCreator: (creatorId: string, creatorName: string) => void;
}

export function FamilyScreen({
  onSelectCreator,
}: FamilyScreenProps): ReactNode {
  // Members section state
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState(false);

  // Connections section state
  const [connections, setConnections] = useState<FamilyConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState(false);

  // Invite dialog state
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const loadMembers = useCallback((): void => {
    setMembersLoading(true);
    setMembersError(false);
    void listFamilyMembers()
      .then((data) => {
        setMembers(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load family members:", { error: err });
        setMembersError(true);
      })
      .finally(() => {
        setMembersLoading(false);
      });
  }, []);

  const loadConnections = useCallback((): void => {
    setConnectionsLoading(true);
    setConnectionsError(false);
    void listMyConnections()
      .then((data) => {
        setConnections(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load family connections:", { error: err });
        setConnectionsError(true);
      })
      .finally(() => {
        setConnectionsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadMembers();
    loadConnections();
  }, [loadMembers, loadConnections]);

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

  const handleRevokeRepresentative = useCallback(
    (id: string): void => {
      void updateFamilyMember(id, { role: "member" })
        .then((updated) => {
          setMembers((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
          showToast(UI_MESSAGES.family.representativeRevoked, "success");
        })
        .catch((err: unknown) => {
          console.error("Failed to revoke representative:", {
            error: err,
            memberId: id,
          });
          showToast(UI_MESSAGES.familyError.updateFailed, "error");
        });
    },
    [showToast],
  );

  const handleUpdateMember = useCallback(
    (
      id: string,
      data: { relationship: string; relationshipLabel: string },
    ): void => {
      void updateFamilyMember(id, data)
        .then((updated) => {
          setMembers((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
          showToast(UI_MESSAGES.family.memberUpdated, "success");
        })
        .catch((err: unknown) => {
          console.error("Failed to update family member:", {
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

  const handleRetryMembers = useCallback((): void => {
    loadMembers();
  }, [loadMembers]);

  const handleRetryConnections = useCallback((): void => {
    loadConnections();
  }, [loadConnections]);

  const handleSelectCreator = useCallback(
    (creatorId: string, creatorName: string): void => {
      onSelectCreator(creatorId, creatorName);
    },
    [onSelectCreator],
  );

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Page header */}
      <div className="flex-none px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-text-primary mb-1">
          {UI_MESSAGES.family.pageTitle}
        </h1>
        <p className="text-lg text-text-secondary">
          {UI_MESSAGES.family.pageDescription}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-8 max-w-lg mx-auto">
          {/* Section 1: Registered family members */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-secondary">
              {UI_MESSAGES.family.membersSectionTitle}
            </h2>
            <p className="text-lg text-text-secondary">
              {UI_MESSAGES.family.membersSectionDescription}
            </p>

            {membersLoading && (
              <p className="text-lg text-text-secondary">読み込み中...</p>
            )}

            {membersError && (
              <div className="rounded-card border border-error-light bg-error-light p-4 space-y-3">
                <p className="text-lg text-error">
                  {UI_MESSAGES.familyError.loadFailed}
                </p>
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-error text-error bg-bg-surface px-6 text-lg transition-colors active:bg-error-light"
                  onClick={handleRetryMembers}
                >
                  もう一度読み込む
                </button>
              </div>
            )}

            {!membersLoading && !membersError && members.length === 0 && (
              <p className="text-lg text-text-secondary whitespace-pre-line">
                {UI_MESSAGES.family.noMembers}
              </p>
            )}

            {!membersLoading && !membersError && members.length > 0 && (
              <div className="space-y-3">
                {members.map((member) => (
                  <FamilyMemberCard
                    key={member.id}
                    member={member}
                    onRemove={handleRemove}
                    onSetRepresentative={handleSetRepresentative}
                    onRevokeRepresentative={handleRevokeRepresentative}
                    onUpdate={handleUpdateMember}
                    isOnlyMember={members.length === 1}
                  />
                ))}
              </div>
            )}

            {!membersLoading && !membersError && (
              <button
                type="button"
                className="w-full min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover"
                onClick={handleOpenInvite}
              >
                {UI_MESSAGES.family.inviteButton}
              </button>
            )}
          </section>

          {/* Visual separator */}
          <div className="border-t border-border" />

          {/* Section 2: Family connections / notes */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-secondary">
              {UI_MESSAGES.family.connectionsSectionTitle}
            </h2>
            <p className="text-lg text-text-secondary">
              {UI_MESSAGES.family.dashboardDescription}
            </p>

            {connectionsLoading && (
              <p className="text-lg text-text-secondary">読み込み中...</p>
            )}

            {connectionsError && (
              <div className="rounded-card border border-error-light bg-error-light p-4 space-y-3">
                <p className="text-lg text-error">
                  {UI_MESSAGES.familyError.loadFailed}
                </p>
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-error text-error bg-bg-surface px-6 text-lg transition-colors active:bg-error-light"
                  onClick={handleRetryConnections}
                >
                  もう一度読み込む
                </button>
              </div>
            )}

            {!connectionsLoading &&
              !connectionsError &&
              connections.length === 0 && (
                <p className="text-lg text-text-secondary whitespace-pre-line">
                  {UI_MESSAGES.family.noConnections}
                </p>
              )}

            {!connectionsLoading &&
              !connectionsError &&
              connections.length > 0 && (
                <div className="space-y-3">
                  {connections.map((connection) => {
                    const isOpened = connection.lifecycleStatus === "opened";

                    return (
                      <CreatorCard
                        key={connection.id}
                        connection={connection}
                        isOpened={isOpened}
                        onSelect={handleSelectCreator}
                      />
                    );
                  })}
                </div>
              )}
          </section>
        </div>
      </div>

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
    </div>
  );
}

// --- CreatorCard sub-component ---

interface CreatorCardProps {
  connection: FamilyConnection;
  isOpened: boolean;
  onSelect: (creatorId: string, creatorName: string) => void;
}

function CreatorCard({
  connection,
  isOpened,
  onSelect,
}: CreatorCardProps): ReactNode {
  const handleClick = useCallback((): void => {
    if (isOpened) {
      onSelect(connection.creatorId, connection.creatorName);
    }
  }, [isOpened, onSelect, connection.creatorId, connection.creatorName]);

  return (
    <div
      className={`rounded-card border border-border-light bg-bg-surface p-4 space-y-3 ${
        isOpened
          ? "cursor-pointer active:bg-bg-surface-hover transition-colors"
          : "opacity-70"
      }`}
      role={isOpened ? "button" : undefined}
      tabIndex={isOpened ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={
        isOpened
          ? (e): void => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      aria-label={
        isOpened
          ? `${connection.creatorName}さんのノートを見る`
          : `${connection.creatorName}さん（${UI_MESSAGES.family.noteNotOpened}）`
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xl font-medium text-text-primary truncate">
            {connection.creatorName}さん
          </p>
          <p className="text-lg text-text-secondary">
            {connection.relationshipLabel}
          </p>
        </div>
        <RoleBadge role={connection.role} />
      </div>

      <LifecycleStatusBanner
        status={connection.lifecycleStatus}
        creatorName={connection.creatorName}
      />

      {isOpened && (
        <p className="text-lg text-accent-primary font-medium text-right">
          ノートを見る →
        </p>
      )}

      {!isOpened && (
        <p className="text-lg text-text-secondary">
          {UI_MESSAGES.family.noteNotOpened}
        </p>
      )}
    </div>
  );
}
