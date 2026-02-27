import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";

interface LifecycleStatusBannerProps {
  status: string;
  creatorName: string;
}

interface StatusConfig {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  active: {
    label: UI_MESSAGES.family.lifecycleActive,
    bgClass: "bg-success-light",
    textClass: "text-success",
    borderClass: "border-success/30",
  },
  death_reported: {
    label: UI_MESSAGES.family.lifecycleDeath,
    bgClass: "bg-warning-light",
    textClass: "text-warning",
    borderClass: "border-warning/30",
  },
  consent_gathering: {
    label: UI_MESSAGES.family.lifecycleConsent,
    bgClass: "bg-info-light",
    textClass: "text-info",
    borderClass: "border-info/30",
  },
  opened: {
    label: UI_MESSAGES.family.lifecycleOpened,
    bgClass: "bg-opened-light",
    textClass: "text-opened",
    borderClass: "border-opened/30",
  },
};

const DEFAULT_STATUS_CONFIG: StatusConfig = {
  label: "",
  bgClass: "bg-bg-surface-hover",
  textClass: "text-text-secondary",
  borderClass: "border-border-light",
};

export function LifecycleStatusBanner({
  status,
  creatorName,
}: LifecycleStatusBannerProps): ReactNode {
  const config = STATUS_CONFIG[status] ?? DEFAULT_STATUS_CONFIG;

  return (
    <div
      className={`rounded-card border px-4 py-3 flex items-center gap-3 ${config.bgClass} ${config.borderClass}`}
    >
      <span
        className={`inline-block w-3 h-3 rounded-full ${config.textClass} bg-current flex-none`}
      />
      <p className={`text-lg font-medium ${config.textClass}`}>
        {creatorName}さん: {config.label}
      </p>
    </div>
  );
}
