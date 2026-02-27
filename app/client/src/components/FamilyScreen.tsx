import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES, MAX_REPRESENTATIVES } from "../lib/constants";
import {
  listFamilyMembers,
  deleteFamilyMember,
  updateFamilyMember,
  listMyConnections,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../lib/family-api";
import { useToast } from "../hooks/useToast";
import { FamilyMemberCard } from "./FamilyMemberCard";
import { FamilyInviteDialog } from "./FamilyInviteDialog";
import { CreatorConnectionCard } from "./CreatorConnectionCard";
import { AccessPresetsSection } from "./AccessPresetsSection";
import { NotificationBell } from "./NotificationBell";
import { NotificationList } from "./NotificationList";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type {
  FamilyMember,
  FamilyConnection,
  Notification,
} from "../lib/family-api";

interface FamilyScreenProps {
  onSelectCreator: (
    creatorId: string,
    creatorName: string,
    connection: FamilyConnection,
  ) => void;
}

type FamilySection = "my-family" | "family-notes";

export function FamilyScreen({
  onSelectCreator,
}: FamilyScreenProps): ReactNode {
  // Section tab state
  const [section, setSection] = useState<FamilySection>("my-family");

  // Members section state
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState(false);

  // Connections section state
  const [connections, setConnections] = useState<FamilyConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

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

  const loadNotifications = useCallback((): void => {
    void listNotifications()
      .then((data) => {
        setNotifications(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load notifications:", { error: err });
      });
  }, []);

  useEffect(() => {
    loadMembers();
    loadConnections();
    loadNotifications();
  }, [loadMembers, loadConnections, loadNotifications]);

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
            prev.map((m) => (m.id === updated.id ? updated : m)),
          );
          showToast(UI_MESSAGES.family.representativeSet, "success");
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
    (
      creatorId: string,
      creatorName: string,
      connection: FamilyConnection,
    ): void => {
      onSelectCreator(creatorId, creatorName, connection);
    },
    [onSelectCreator],
  );

  const handleSwitchToMyFamily = useCallback((): void => {
    setSection("my-family");
  }, []);

  const handleSwitchToFamilyNotes = useCallback((): void => {
    setSection("family-notes");
  }, []);

  const handleToggleNotifications = useCallback((): void => {
    setShowNotifications((prev) => !prev);
  }, []);

  const handleMarkNotificationRead = useCallback(
    (id: string): void => {
      void markNotificationRead(id)
        .then(() => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
          );
        })
        .catch((err: unknown) => {
          console.error("Failed to mark notification as read:", {
            error: err,
            notificationId: id,
          });
          showToast(UI_MESSAGES.familyError.notificationsFailed, "error");
        });
    },
    [showToast],
  );

  const handleMarkAllNotificationsRead = useCallback((): void => {
    void markAllNotificationsRead()
      .then(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      })
      .catch((err: unknown) => {
        console.error("Failed to mark all notifications as read:", {
          error: err,
        });
        showToast(UI_MESSAGES.familyError.notificationsFailed, "error");
      });
  }, [showToast]);

  // Count pending actions for badge
  const pendingActionCount = connections.filter(
    (c) => c.hasPendingConsent,
  ).length;

  const unreadNotificationCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Page header */}
      <div className="flex-none px-4 pt-8 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">
              {UI_MESSAGES.family.pageTitle}
            </h1>
            <p className="text-lg text-text-secondary">
              {UI_MESSAGES.family.pageDescription}
            </p>
          </div>
          <NotificationBell
            count={unreadNotificationCount}
            onClick={handleToggleNotifications}
          />
        </div>
      </div>

      {/* Notification list (expandable) */}
      {showNotifications && (
        <div className="flex-none px-4 pb-4">
          <div className="max-w-lg mx-auto">
            <NotificationList
              notifications={notifications}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
            />
          </div>
        </div>
      )}

      {/* Segment control */}
      <div className="flex-none px-4 pb-4">
        <div className="flex gap-2 max-w-lg mx-auto">
          <button
            type="button"
            className={`flex-1 min-h-11 rounded-full text-lg font-medium transition-colors ${
              section === "my-family"
                ? "bg-accent-primary text-text-on-accent"
                : "border border-border text-text-secondary active:bg-bg-surface-hover"
            }`}
            onClick={handleSwitchToMyFamily}
          >
            {UI_MESSAGES.family.myFamilyTab}
          </button>
          <button
            type="button"
            className={`flex-1 min-h-11 rounded-full text-lg font-medium transition-colors relative ${
              section === "family-notes"
                ? "bg-accent-primary text-text-on-accent"
                : "border border-border text-text-secondary active:bg-bg-surface-hover"
            }`}
            onClick={handleSwitchToFamilyNotes}
          >
            {UI_MESSAGES.family.familyNotesTab}
            {pendingActionCount > 0 && section !== "family-notes" && (
              <span className="absolute -top-1 -right-1 min-w-6 h-6 flex items-center justify-center rounded-full bg-error text-bg-surface text-base font-bold px-1">
                {String(pendingActionCount)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-8 max-w-lg mx-auto">
          {section === "my-family" && (
            <>
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

                {!membersLoading &&
                  !membersError &&
                  members.length > 0 &&
                  (() => {
                    const representativeCount = members.filter(
                      (m) => m.role === "representative",
                    ).length;
                    const isMaxRepresentatives =
                      representativeCount >= MAX_REPRESENTATIVES;

                    return (
                      <div className="space-y-3">
                        {representativeCount > 0 && (
                          <p className="text-base text-text-secondary">
                            代表者: {String(representativeCount)}/
                            {String(MAX_REPRESENTATIVES)}名
                          </p>
                        )}
                        {members.map((member) => (
                          <FamilyMemberCard
                            key={member.id}
                            member={member}
                            onRemove={handleRemove}
                            onSetRepresentative={handleSetRepresentative}
                            onRevokeRepresentative={handleRevokeRepresentative}
                            onUpdate={handleUpdateMember}
                            isOnlyMember={members.length === 1}
                            isMaxRepresentatives={isMaxRepresentatives}
                          />
                        ))}
                      </div>
                    );
                  })()}

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

              {/* Section 2: Access presets (creator's pre-mortem wishes) */}
              <AccessPresetsSection
                members={members}
                membersLoading={membersLoading}
              />
            </>
          )}

          {section === "family-notes" && (
            <section className="space-y-3">
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
                    {connections.map((connection) => (
                      <CreatorConnectionCard
                        key={connection.id}
                        connection={connection}
                        onSelect={handleSelectCreator}
                      />
                    ))}
                  </div>
                )}
            </section>
          )}
        </div>
      </div>

      <FamilyInviteDialog
        isOpen={showInviteDialog}
        onClose={handleCloseInvite}
        onInviteCreated={handleInviteCreated}
        isMaxRepresentatives={
          members.filter((m) => m.role === "representative").length >=
          MAX_REPRESENTATIVES
        }
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
