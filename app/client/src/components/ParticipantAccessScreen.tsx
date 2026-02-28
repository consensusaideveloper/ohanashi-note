import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import {
  getAccessMatrix,
  grantCategoryAccess,
  revokeCategoryAccess,
  getAccessPresetRecommendations,
} from "../lib/family-api";
import { QUESTION_CATEGORIES } from "../lib/questions";
import { useToast } from "../hooks/useToast";
import { RoleBadge } from "./RoleBadge";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type {
  AccessMatrix,
  AccessMatrixMember,
  AccessPresetRecommendation,
} from "../lib/family-api";

/** Total number of categories for access summary display. */
const TOTAL_CATEGORIES = QUESTION_CATEGORIES.length;

interface ParticipantAccessScreenProps {
  creatorId: string;
  creatorName: string;
  onBack: () => void;
}

export function ParticipantAccessScreen({
  creatorId,
  creatorName,
  onBack,
}: ParticipantAccessScreenProps): ReactNode {
  const [matrix, setMatrix] = useState<AccessMatrix | null>(null);
  const [recommendations, setRecommendations] = useState<
    AccessPresetRecommendation[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [togglingCells, setTogglingCells] = useState<Set<string>>(new Set());
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(
    new Set(),
  );
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const loadMatrix = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void Promise.all([
      getAccessMatrix(creatorId),
      getAccessPresetRecommendations(creatorId).catch(
        (err: unknown): AccessPresetRecommendation[] => {
          console.error("Failed to load recommendations:", {
            error: err,
            creatorId,
          });
          return [];
        },
      ),
    ])
      .then(([matrixData, recommendationData]) => {
        setMatrix(matrixData);
        setRecommendations(recommendationData);
      })
      .catch((err: unknown) => {
        console.error("Failed to load access matrix:", {
          error: err,
          creatorId,
        });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [creatorId]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const handleBack = useCallback((): void => {
    onBack();
  }, [onBack]);

  const handleRetry = useCallback((): void => {
    loadMatrix();
  }, [loadMatrix]);

  const handleToggleExpand = useCallback((familyMemberId: string): void => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(familyMemberId)) {
        next.delete(familyMemberId);
      } else {
        next.add(familyMemberId);
      }
      return next;
    });
  }, []);

  const handleToggleAccess = useCallback(
    (member: AccessMatrixMember, categoryId: string): void => {
      const cellKey = `${member.familyMemberId}-${categoryId}`;
      const hasAccess = member.categories.includes(categoryId);

      setTogglingCells((prev) => new Set(prev).add(cellKey));

      const operation = hasAccess
        ? revokeCategoryAccess(creatorId, member.familyMemberId, categoryId)
        : grantCategoryAccess(creatorId, member.familyMemberId, categoryId);

      void operation
        .then(() => {
          setMatrix((prev) => {
            if (prev === null) {
              return null;
            }
            return {
              ...prev,
              members: prev.members.map((m) => {
                if (m.familyMemberId !== member.familyMemberId) {
                  return m;
                }
                return {
                  ...m,
                  categories: hasAccess
                    ? m.categories.filter((c) => c !== categoryId)
                    : [...m.categories, categoryId],
                };
              }),
            };
          });

          showToast(
            hasAccess
              ? UI_MESSAGES.family.categoryRevoked
              : UI_MESSAGES.family.categoryGranted,
            "success",
          );
        })
        .catch((err: unknown) => {
          console.error("Failed to toggle category access:", {
            error: err,
            creatorId,
            familyMemberId: member.familyMemberId,
            categoryId,
            action: hasAccess ? "revoke" : "grant",
          });
          showToast(
            hasAccess
              ? UI_MESSAGES.familyError.revokeAccessFailed
              : UI_MESSAGES.familyError.grantAccessFailed,
            "error",
          );
        })
        .finally(() => {
          setTogglingCells((prev) => {
            const next = new Set(prev);
            next.delete(cellKey);
            return next;
          });
        });
    },
    [creatorId, showToast],
  );

  const handleApplyRecommendations = useCallback((): void => {
    if (recommendations.length === 0 || matrix === null) {
      return;
    }

    const pendingGrants: { familyMemberId: string; categoryId: string }[] = [];
    for (const rec of recommendations) {
      const member = matrix.members.find(
        (m) => m.familyMemberId === rec.familyMemberId,
      );
      if (member && !member.categories.includes(rec.categoryId)) {
        pendingGrants.push({
          familyMemberId: rec.familyMemberId,
          categoryId: rec.categoryId,
        });
      }
    }

    if (pendingGrants.length === 0) {
      showToast(UI_MESSAGES.family.categoryGranted, "success");
      return;
    }

    setIsApplyingAll(true);
    const grantPromises = pendingGrants.map((grant) =>
      grantCategoryAccess(creatorId, grant.familyMemberId, grant.categoryId)
        .then(() => ({ ...grant, success: true }))
        .catch((err: unknown) => {
          console.error("Failed to grant category access:", {
            error: err,
            creatorId,
            familyMemberId: grant.familyMemberId,
            categoryId: grant.categoryId,
          });
          return { ...grant, success: false };
        }),
    );

    void Promise.all(grantPromises)
      .then((results) => {
        const succeeded = results.filter((r) => r.success);
        if (succeeded.length > 0) {
          setMatrix((prev) => {
            if (prev === null) {
              return null;
            }
            return {
              ...prev,
              members: prev.members.map((m) => {
                const newCategories = succeeded
                  .filter((s) => s.familyMemberId === m.familyMemberId)
                  .map((s) => s.categoryId);
                if (newCategories.length === 0) {
                  return m;
                }
                return {
                  ...m,
                  categories: [
                    ...m.categories,
                    ...newCategories.filter((c) => !m.categories.includes(c)),
                  ],
                };
              }),
            };
          });
          showToast(UI_MESSAGES.family.categoryGranted, "success");
        }
      })
      .finally(() => {
        setIsApplyingAll(false);
      });
  }, [recommendations, matrix, creatorId, showToast]);

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
        <button
          type="button"
          className="min-h-11 rounded-full border border-border text-text-secondary text-lg px-6 py-3"
          onClick={handleBack}
        >
          戻る
        </button>
      </div>
    );
  }

  const members = matrix?.members ?? [];

  const recommendedSet = new Set(
    recommendations.map((r) => `${r.familyMemberId}-${r.categoryId}`),
  );

  const hasUnappliedRecommendations =
    recommendations.length > 0 &&
    matrix !== null &&
    recommendations.some((rec) => {
      const member = matrix.members.find(
        (m) => m.familyMemberId === rec.familyMemberId,
      );
      return (
        member !== undefined && !member.categories.includes(rec.categoryId)
      );
    });

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 pt-6 pb-4">
        <button
          type="button"
          className="min-h-11 flex items-center gap-2 text-lg text-accent-primary mb-3 transition-colors active:text-accent-primary-hover"
          onClick={handleBack}
          aria-label="戻る"
        >
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
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          戻る
        </button>

        <h1 className="text-2xl font-bold text-text-primary mb-1">
          {UI_MESSAGES.family.participantAccessTitle}
        </h1>
        <p className="text-base text-text-secondary">
          {creatorName}さんのノート — {members.length}人の参加者
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="space-y-3 max-w-lg mx-auto">
          {/* Recommendation banner */}
          {hasUnappliedRecommendations && (
            <div className="rounded-card border border-accent-secondary bg-accent-secondary/10 p-4 space-y-3">
              <p className="text-lg text-text-primary">
                {UI_MESSAGES.family.accessPresetsRecommendationHint}
              </p>
              <button
                type="button"
                className="w-full min-h-11 rounded-full bg-accent-secondary text-text-on-accent text-lg transition-colors disabled:opacity-50"
                disabled={isApplyingAll}
                onClick={handleApplyRecommendations}
              >
                {isApplyingAll
                  ? "設定中..."
                  : UI_MESSAGES.family.accessPresetsApplyAll}
              </button>
            </div>
          )}

          {members.length === 0 && (
            <p className="text-lg text-text-secondary">
              {UI_MESSAGES.family.noFamilyMembers}
            </p>
          )}

          {members.map((member) => (
            <ParticipantCard
              key={member.familyMemberId}
              member={member}
              isExpanded={expandedMembers.has(member.familyMemberId)}
              togglingCells={togglingCells}
              recommendedSet={recommendedSet}
              onToggleExpand={handleToggleExpand}
              onToggleAccess={handleToggleAccess}
            />
          ))}
        </div>
      </div>

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </div>
  );
}

// --- ParticipantCard sub-component ---

interface ParticipantCardProps {
  member: AccessMatrixMember;
  isExpanded: boolean;
  togglingCells: Set<string>;
  recommendedSet: Set<string>;
  onToggleExpand: (familyMemberId: string) => void;
  onToggleAccess: (member: AccessMatrixMember, categoryId: string) => void;
}

function ParticipantCard({
  member,
  isExpanded,
  togglingCells,
  recommendedSet,
  onToggleExpand,
  onToggleAccess,
}: ParticipantCardProps): ReactNode {
  const isRepresentativeMember = member.role === "representative";
  const accessCount = member.categories.length;

  const handleExpand = useCallback((): void => {
    onToggleExpand(member.familyMemberId);
  }, [onToggleExpand, member.familyMemberId]);

  return (
    <div className="rounded-card border border-border-light bg-bg-surface overflow-hidden">
      {/* Card header — always visible */}
      <button
        type="button"
        className={`w-full min-h-11 p-4 flex items-center gap-3 text-left transition-colors ${
          isRepresentativeMember
            ? ""
            : "active:bg-bg-surface-hover cursor-pointer"
        }`}
        onClick={isRepresentativeMember ? undefined : handleExpand}
        disabled={isRepresentativeMember}
        aria-expanded={isRepresentativeMember ? undefined : isExpanded}
        aria-label={
          isRepresentativeMember
            ? undefined
            : `${member.name}のアクセス設定を${isExpanded ? "閉じる" : "開く"}`
        }
      >
        {/* Expand/collapse indicator for members */}
        {!isRepresentativeMember && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 text-text-secondary flex-none transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m8.25 4.5 7.5 7.5-7.5 7.5"
            />
          </svg>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-medium text-text-primary">
              {member.name}
            </span>
            <RoleBadge
              role={isRepresentativeMember ? "representative" : "member"}
            />
            <span className="text-base text-text-secondary">
              ({member.relationshipLabel})
            </span>
          </div>
          <p className="text-base text-text-secondary mt-1">
            {isRepresentativeMember
              ? UI_MESSAGES.family.allCategoriesAccessible
              : `${accessCount}/${TOTAL_CATEGORIES}${UI_MESSAGES.family.accessSummary}`}
          </p>
        </div>
      </button>

      {/* Expanded category checkboxes for non-representative members */}
      {!isRepresentativeMember && isExpanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-border-light pt-3">
          {QUESTION_CATEGORIES.map((category) => {
            const hasAccess = member.categories.includes(category.id);
            const cellKey = `${member.familyMemberId}-${category.id}`;
            const isToggling = togglingCells.has(cellKey);
            const isRecommended = recommendedSet.has(cellKey);

            return (
              <CategoryCheckbox
                key={category.id}
                categoryId={category.id}
                label={category.label}
                icon={category.icon}
                checked={hasAccess}
                disabled={isToggling}
                isRecommended={isRecommended}
                member={member}
                onToggle={onToggleAccess}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- CategoryCheckbox sub-component ---

interface CategoryCheckboxProps {
  categoryId: string;
  label: string;
  icon: string;
  checked: boolean;
  disabled: boolean;
  isRecommended: boolean;
  member: AccessMatrixMember;
  onToggle: (member: AccessMatrixMember, categoryId: string) => void;
}

function CategoryCheckbox({
  categoryId,
  label,
  icon,
  checked,
  disabled,
  isRecommended,
  member,
  onToggle,
}: CategoryCheckboxProps): ReactNode {
  const handleChange = useCallback((): void => {
    onToggle(member, categoryId);
  }, [onToggle, member, categoryId]);

  return (
    <div>
      <label
        className={`flex items-center gap-3 min-h-11 px-2 rounded-lg transition-colors ${
          disabled ? "opacity-50" : "cursor-pointer active:bg-bg-surface-hover"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          className="w-5 h-5 accent-accent-primary flex-none"
          aria-label={`${member.name}に${label}のアクセスを${checked ? "取り消す" : "許可する"}`}
        />
        <span className="text-lg flex-none" aria-hidden="true">
          {icon}
        </span>
        <span className="text-lg text-text-primary">{label}</span>
        {isRecommended && !checked && (
          <span className="ml-auto text-base text-accent-secondary">推奨</span>
        )}
        {disabled && (
          <span className="ml-auto">
            <span className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin inline-block" />
          </span>
        )}
      </label>
      {isRecommended && !checked && (
        <p className="text-base text-accent-secondary pl-10">
          {UI_MESSAGES.family.accessPresetsRecommendationHint}
        </p>
      )}
    </div>
  );
}
