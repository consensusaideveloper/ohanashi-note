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
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type {
  AccessMatrix,
  AccessMatrixMember,
  AccessPresetRecommendation,
} from "../lib/family-api";

interface CategoryAccessManagerProps {
  creatorId: string;
}

export function CategoryAccessManager({
  creatorId,
}: CategoryAccessManagerProps): ReactNode {
  const [matrix, setMatrix] = useState<AccessMatrix | null>(null);
  const [recommendations, setRecommendations] = useState<
    AccessPresetRecommendation[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [togglingCells, setTogglingCells] = useState<Set<string>>(new Set());
  const [isApplyingAll, setIsApplyingAll] = useState(false);
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

  const handleRetry = useCallback((): void => {
    loadMatrix();
  }, [loadMatrix]);

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
          // Update local state
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

    // Find recommendations that haven't been granted yet
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
      <div className="flex items-center justify-center py-8">
        <p className="text-lg text-text-secondary">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  const members = matrix?.members ?? [];

  // Build a set of recommended (familyMemberId, categoryId) pairs for quick lookup
  const recommendedSet = new Set(
    recommendations.map((r) => `${r.familyMemberId}-${r.categoryId}`),
  );

  // Check if there are any un-applied recommendations
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
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {UI_MESSAGES.family.accessManagerTitle}
        </h2>
        <p className="text-lg text-text-secondary mt-1">
          {UI_MESSAGES.family.accessManagerDescription}
        </p>
      </div>

      {recommendations.length > 0 && hasUnappliedRecommendations && (
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
        <MemberAccessCard
          key={member.familyMemberId}
          member={member}
          togglingCells={togglingCells}
          recommendedSet={recommendedSet}
          onToggle={handleToggleAccess}
        />
      ))}

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </section>
  );
}

// --- MemberAccessCard sub-component ---

interface MemberAccessCardProps {
  member: AccessMatrixMember;
  togglingCells: Set<string>;
  recommendedSet: Set<string>;
  onToggle: (member: AccessMatrixMember, categoryId: string) => void;
}

function MemberAccessCard({
  member,
  togglingCells,
  recommendedSet,
  onToggle,
}: MemberAccessCardProps): ReactNode {
  const isRepresentativeMember = member.role === "representative";

  return (
    <div className="rounded-card border border-border-light bg-bg-surface p-4 space-y-3">
      <p className="text-xl font-medium text-text-primary">{member.name}</p>
      {isRepresentativeMember && (
        <p className="text-base text-text-secondary">
          {UI_MESSAGES.family.representativeFullAccess}
        </p>
      )}

      <div className="space-y-2">
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
              disabled={isToggling || isRepresentativeMember}
              isRecommended={isRecommended}
              member={member}
              onToggle={onToggle}
            />
          );
        })}
      </div>
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
        {disabled && member.role !== "representative" && (
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
