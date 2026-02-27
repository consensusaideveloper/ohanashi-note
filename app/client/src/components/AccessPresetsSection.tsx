import { useState, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { QUESTION_CATEGORIES } from "../lib/questions";
import {
  listAccessPresets,
  createAccessPreset,
  deleteAccessPreset,
} from "../lib/family-api";
import { useToast } from "../hooks/useToast";
import { Toast } from "./Toast";

import type { ReactNode } from "react";
import type { FamilyMember, AccessPreset } from "../lib/family-api";

interface AccessPresetsSectionProps {
  members: FamilyMember[];
  membersLoading: boolean;
}

export function AccessPresetsSection({
  members,
  membersLoading,
}: AccessPresetsSectionProps): ReactNode {
  const [presets, setPresets] = useState<AccessPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const { toastMessage, toastVariant, isToastVisible, showToast, hideToast } =
    useToast();

  const loadPresets = useCallback((): void => {
    setLoading(true);
    setError(false);
    void listAccessPresets()
      .then((data) => {
        setPresets(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load access presets:", { error: err });
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handleSelectMember = useCallback((memberId: string): void => {
    setSelectedMemberId((prev) => (prev === memberId ? null : memberId));
  }, []);

  const handleToggleCategory = useCallback(
    (familyMemberId: string, categoryId: string): void => {
      const existing = presets.find(
        (p) =>
          p.familyMemberId === familyMemberId && p.categoryId === categoryId,
      );

      if (existing) {
        void deleteAccessPreset(existing.id)
          .then(() => {
            setPresets((prev) => prev.filter((p) => p.id !== existing.id));
            showToast(UI_MESSAGES.family.accessPresetRemoved, "success");
          })
          .catch((err: unknown) => {
            console.error("Failed to remove access preset:", {
              error: err,
              presetId: existing.id,
            });
            showToast(
              UI_MESSAGES.familyError.accessPresetRemoveFailed,
              "error",
            );
          });
      } else {
        void createAccessPreset({ familyMemberId, categoryId })
          .then((created) => {
            const member = members.find((m) => m.id === familyMemberId);
            setPresets((prev) => [
              ...prev,
              {
                id: created.id,
                familyMemberId: created.familyMemberId,
                categoryId: created.categoryId,
                memberName: member?.name ?? "",
                createdAt: new Date().toISOString(),
              },
            ]);
            showToast(UI_MESSAGES.family.accessPresetAdded, "success");
          })
          .catch((err: unknown) => {
            console.error("Failed to add access preset:", {
              error: err,
              familyMemberId,
              categoryId,
            });
            showToast(UI_MESSAGES.familyError.accessPresetAddFailed, "error");
          });
      }
    },
    [presets, members, showToast],
  );

  const handleRetry = useCallback((): void => {
    loadPresets();
  }, [loadPresets]);

  if (membersLoading || members.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-secondary">
          {UI_MESSAGES.family.accessPresetsSectionTitle}
        </h2>
        <p className="text-lg text-text-secondary">
          {UI_MESSAGES.family.accessPresetsNoMembers}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-secondary">
        {UI_MESSAGES.family.accessPresetsSectionTitle}
      </h2>
      <p className="text-lg text-text-secondary">
        {UI_MESSAGES.family.accessPresetsDescription}
      </p>

      {loading && <p className="text-lg text-text-secondary">読み込み中...</p>}

      {error && (
        <div className="rounded-card border border-error-light bg-error-light p-4 space-y-3">
          <p className="text-lg text-error">
            {UI_MESSAGES.familyError.accessPresetsFailed}
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

      {!loading && !error && (
        <div className="space-y-3">
          {members.map((member) => {
            const isSelected = selectedMemberId === member.id;
            const memberPresets = presets.filter(
              (p) => p.familyMemberId === member.id,
            );
            const presetCount = memberPresets.length;

            return (
              <div
                key={member.id}
                className="rounded-card border border-border-light bg-bg-surface overflow-hidden"
              >
                <button
                  type="button"
                  className="w-full p-4 flex items-center justify-between gap-3 min-h-11 text-left transition-colors active:bg-bg-surface-hover"
                  onClick={() => handleSelectMember(member.id)}
                  aria-expanded={isSelected}
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xl font-medium text-text-primary truncate">
                      {member.name}
                    </p>
                    <p className="text-base text-text-secondary">
                      {member.relationshipLabel}
                      {presetCount > 0 &&
                        ` — ${String(presetCount)}カテゴリ設定済み`}
                    </p>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 flex-none text-text-secondary transition-transform ${
                      isSelected ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m19 9-7 7-7-7"
                    />
                  </svg>
                </button>

                {isSelected && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border-light pt-3">
                    {QUESTION_CATEGORIES.map((cat) => {
                      const isChecked = memberPresets.some(
                        (p) => p.categoryId === cat.id,
                      );

                      return (
                        <button
                          key={cat.id}
                          type="button"
                          role="checkbox"
                          aria-checked={isChecked}
                          className="flex items-center gap-3 w-full min-h-11 text-left"
                          onClick={() =>
                            handleToggleCategory(member.id, cat.id)
                          }
                        >
                          <span
                            className={`flex-none w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                              isChecked
                                ? "bg-accent-primary border-accent-primary"
                                : "bg-bg-surface border-border"
                            }`}
                          >
                            {isChecked && (
                              <svg
                                className="w-4 h-4 text-text-on-accent"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </span>
                          <span className="text-lg text-text-primary">
                            {cat.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Toast
        message={toastMessage}
        variant={toastVariant}
        isVisible={isToastVisible}
        onDismiss={hideToast}
      />
    </section>
  );
}
