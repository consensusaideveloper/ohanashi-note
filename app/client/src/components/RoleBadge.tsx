import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";

interface RoleBadgeProps {
  role: "representative" | "member";
}

export function RoleBadge({ role }: RoleBadgeProps): ReactNode {
  const isRepresentative = role === "representative";

  const label = isRepresentative
    ? UI_MESSAGES.family.representativeLabel
    : UI_MESSAGES.family.memberLabel;

  const classes = isRepresentative
    ? "bg-accent-primary-light text-accent-primary-hover"
    : "bg-bg-surface-hover text-text-secondary";

  return (
    <span
      className={`inline-block rounded-full px-3 py-0.5 text-base font-medium ${classes}`}
    >
      {label}
    </span>
  );
}
