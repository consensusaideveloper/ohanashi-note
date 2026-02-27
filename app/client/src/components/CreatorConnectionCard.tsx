import { useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { RoleBadge } from "./RoleBadge";
import { LifecycleStatusBanner } from "./LifecycleStatusBanner";

import type { ReactNode } from "react";
import type { FamilyConnection } from "../lib/family-api";

interface CreatorConnectionCardProps {
  connection: FamilyConnection;
  onSelect: (
    creatorId: string,
    creatorName: string,
    connection: FamilyConnection,
  ) => void;
}

export function CreatorConnectionCard({
  connection,
  onSelect,
}: CreatorConnectionCardProps): ReactNode {
  const isOpened = connection.lifecycleStatus === "opened";

  const handleClick = useCallback((): void => {
    onSelect(connection.creatorId, connection.creatorName, connection);
  }, [onSelect, connection]);

  const showPendingBadge = connection.hasPendingConsent;

  return (
    <button
      type="button"
      className={`rounded-card border border-border-light bg-bg-surface p-4 space-y-3 w-full text-left transition-colors active:bg-bg-surface-hover ${
        !isOpened && connection.lifecycleStatus === "active" ? "opacity-70" : ""
      }`}
      onClick={handleClick}
      aria-label={`${connection.creatorName}さんの詳細を見る`}
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
        <div className="flex items-center gap-2 flex-none">
          {showPendingBadge && (
            <span className="inline-block min-w-3 h-3 rounded-full bg-error" />
          )}
          <RoleBadge role={connection.role} />
        </div>
      </div>

      <LifecycleStatusBanner
        status={connection.lifecycleStatus}
        creatorName={connection.creatorName}
      />

      {isOpened && (
        <p className="text-lg text-accent-primary font-medium text-right">
          {UI_MESSAGES.family.viewNoteButton} →
        </p>
      )}

      {connection.hasPendingConsent && (
        <p className="text-lg text-info font-medium text-right">
          {UI_MESSAGES.family.consentDialogTitle} →
        </p>
      )}

      {connection.lifecycleStatus === "death_reported" &&
        connection.role === "representative" && (
          <p className="text-lg text-warning font-medium text-right">
            {UI_MESSAGES.family.initiateConsentButton} →
          </p>
        )}

      {connection.lifecycleStatus === "active" && (
        <p className="text-lg text-text-secondary">
          {UI_MESSAGES.family.noteNotOpened}
        </p>
      )}
    </button>
  );
}
