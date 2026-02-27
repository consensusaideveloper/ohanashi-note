import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import {
  getAccessMatrix,
  grantCategoryAccess,
  revokeCategoryAccess,
} from "../lib/family-api";
import { QUESTION_CATEGORIES } from "../lib/questions";
import { useToast } from "../hooks/useToast";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type { AccessMatrix, AccessMatrixMember } from "../lib/family-api";

interface CategoryAccessManagerProps {
  creatorId: string;
}

export function CategoryAccessManager({
  creatorId,
}: CategoryAccessManagerProps): ReactNode {
  const [matrix, setMatrix] = useState<AccessMatrix | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [togglingCells, setTogglingCells] = useState<Set<string>>(new Set());
  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const loadMatrix = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    void getAccessMatrix(creatorId)
      .then((data) => {
        setMatrix(data);
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
  onToggle: (member: AccessMatrixMember, categoryId: string) => void;
}

function MemberAccessCard({
  member,
  togglingCells,
  onToggle,
}: MemberAccessCardProps): ReactNode {
  return (
    <div className="rounded-card border border-border-light bg-bg-surface p-4 space-y-3">
      <p className="text-xl font-medium text-text-primary">{member.name}</p>

      <div className="space-y-2">
        {QUESTION_CATEGORIES.map((category) => {
          const hasAccess = member.categories.includes(category.id);
          const cellKey = `${member.familyMemberId}-${category.id}`;
          const isToggling = togglingCells.has(cellKey);

          return (
            <CategoryCheckbox
              key={category.id}
              categoryId={category.id}
              label={category.label}
              icon={category.icon}
              checked={hasAccess}
              disabled={isToggling}
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
  member: AccessMatrixMember;
  onToggle: (member: AccessMatrixMember, categoryId: string) => void;
}

function CategoryCheckbox({
  categoryId,
  label,
  icon,
  checked,
  disabled,
  member,
  onToggle,
}: CategoryCheckboxProps): ReactNode {
  const handleChange = useCallback((): void => {
    onToggle(member, categoryId);
  }, [onToggle, member, categoryId]);

  return (
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
      {disabled && (
        <span className="ml-auto">
          <span className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin inline-block" />
        </span>
      )}
    </label>
  );
}
