import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { listMyConnections } from "../lib/family-api";
import { RoleBadge } from "./RoleBadge";
import { LifecycleStatusBanner } from "./LifecycleStatusBanner";

import type { ReactNode } from "react";
import type { FamilyConnection } from "../lib/family-api";

interface FamilyDashboardScreenProps {
  onSelectCreator: (creatorId: string, creatorName: string) => void;
}

export function FamilyDashboardScreen({
  onSelectCreator,
}: FamilyDashboardScreenProps): ReactNode {
  const [connections, setConnections] = useState<FamilyConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadConnections = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void listMyConnections()
      .then((data) => {
        setConnections(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load family connections:", { error: err });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleRetry = useCallback((): void => {
    loadConnections();
  }, [loadConnections]);

  const handleSelectCreator = useCallback(
    (creatorId: string, creatorName: string): void => {
      onSelectCreator(creatorId, creatorName);
    },
    [onSelectCreator],
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-lg text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-xl text-text-primary text-center leading-relaxed">
          {UI_MESSAGES.familyError.loadFailed}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-full bg-accent-primary text-text-on-accent text-lg px-6 py-3"
          onClick={handleRetry}
        >
          もう一度読み込む
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-text-primary mb-1">
          {UI_MESSAGES.family.dashboardTitle}
        </h1>
        <p className="text-lg text-text-secondary">
          {UI_MESSAGES.family.dashboardDescription}
        </p>
      </div>

      {/* Connection list */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-3 max-w-lg mx-auto">
          {connections.length === 0 && (
            <p className="text-lg text-text-secondary text-center py-8">
              {UI_MESSAGES.family.noFamilyMembers}
            </p>
          )}

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
      </div>
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
