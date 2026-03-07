import { ONBOARDING_COMPLETE_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";

export interface OnboardingSettingsSummary {
  userName: string;
  characterName: string;
  characterDescription: string;
  assistantName: string;
  fontSizeLabel: string;
  speakingSpeedLabel: string;
  silenceDurationLabel: string;
  confirmationLevelLabel: string;
}

interface OnboardingSettingsSummaryCardProps {
  summary: OnboardingSettingsSummary;
  compact?: boolean;
}

export function OnboardingSettingsSummaryCard({
  summary,
  compact = false,
}: OnboardingSettingsSummaryCardProps): ReactNode {
  const labelClass = compact
    ? "text-sm text-text-secondary flex-shrink-0"
    : "text-base text-text-secondary flex-shrink-0";
  const valueClass = compact
    ? "text-base text-text-primary font-medium"
    : "text-lg text-text-primary font-medium";
  const gapClass = compact ? "gap-2.5" : "gap-3";
  const spaceClass = compact ? "space-y-3" : "space-y-4";

  return (
    <div
      className={`w-full rounded-card bg-bg-surface shadow-sm ${compact ? "p-4" : "p-6"} ${spaceClass}`}
      aria-live="polite"
    >
      <div className={`flex items-center ${gapClass}`}>
        <span className={labelClass}>
          {ONBOARDING_COMPLETE_MESSAGES.nameLabel}
        </span>
        <span className={valueClass}>
          {summary.userName !== "" ? `${summary.userName}さん` : "―"}
        </span>
      </div>

      <div className={`flex items-center ${gapClass}`}>
        <span className={labelClass}>
          {ONBOARDING_COMPLETE_MESSAGES.characterLabel}
        </span>
        <div>
          <span className={valueClass}>{summary.characterName}</span>
          <span className="ml-2 text-sm text-text-secondary">
            {summary.characterDescription}
          </span>
        </div>
      </div>

      <div className={`flex items-center ${gapClass}`}>
        <span className={labelClass}>
          {ONBOARDING_COMPLETE_MESSAGES.assistantNameLabel}
        </span>
        <span className={valueClass}>{summary.assistantName}</span>
      </div>

      <div className={`flex items-center ${gapClass}`}>
        <span className={labelClass}>
          {ONBOARDING_COMPLETE_MESSAGES.fontSizeLabel}
        </span>
        <span className={valueClass}>{summary.fontSizeLabel}</span>
      </div>

      <div className={`flex items-center ${gapClass}`}>
        <span className={labelClass}>
          {ONBOARDING_COMPLETE_MESSAGES.speakingSpeedLabel}
        </span>
        <span className={valueClass}>{summary.speakingSpeedLabel}</span>
      </div>

      <div className={`flex items-center ${gapClass}`}>
        <span className={labelClass}>
          {ONBOARDING_COMPLETE_MESSAGES.silenceDurationLabel}
        </span>
        <span className={valueClass}>{summary.silenceDurationLabel}</span>
      </div>

      <div className={`flex items-center ${gapClass}`}>
        <span className={labelClass}>
          {ONBOARDING_COMPLETE_MESSAGES.confirmationLevelLabel}
        </span>
        <span className={valueClass}>{summary.confirmationLevelLabel}</span>
      </div>
    </div>
  );
}
