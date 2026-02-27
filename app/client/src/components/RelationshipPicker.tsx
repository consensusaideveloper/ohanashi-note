import { useCallback } from "react";

import type { ReactNode } from "react";

interface RelationshipPickerProps {
  value: string;
  label: string;
  onRelationshipChange: (relationship: string) => void;
  onLabelChange: (label: string) => void;
}

const RELATIONSHIP_OPTIONS: readonly {
  readonly value: string;
  readonly label: string;
}[] = [
  { value: "spouse", label: "配偶者" },
  { value: "child", label: "子" },
  { value: "sibling", label: "兄弟姉妹" },
  { value: "grandchild", label: "孫" },
  { value: "other", label: "その他" },
] as const;

export function RelationshipPicker({
  value,
  label,
  onRelationshipChange,
  onLabelChange,
}: RelationshipPickerProps): ReactNode {
  const handleSelectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>): void => {
      const selected = e.target.value;
      onRelationshipChange(selected);
      const option = RELATIONSHIP_OPTIONS.find((o) => o.value === selected);
      if (option !== undefined) {
        onLabelChange(option.label);
      }
    },
    [onRelationshipChange, onLabelChange],
  );

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      onLabelChange(e.target.value);
    },
    [onLabelChange],
  );

  return (
    <div className="space-y-3">
      <label
        className="block text-lg text-text-primary"
        htmlFor="relationship-select"
      >
        続柄
      </label>
      <select
        id="relationship-select"
        className="w-full rounded-card border border-border-light bg-bg-surface px-4 py-3 text-lg text-text-primary focus:outline-none focus:border-accent-primary"
        value={value}
        onChange={handleSelectChange}
      >
        <option value="" disabled>
          選択してください
        </option>
        {RELATIONSHIP_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label
        className="block text-lg text-text-primary"
        htmlFor="relationship-label"
      >
        呼び方
      </label>
      <input
        id="relationship-label"
        type="text"
        className="w-full rounded-card border border-border-light bg-bg-surface px-4 py-3 text-lg text-text-primary focus:outline-none focus:border-accent-primary"
        placeholder="例：長男、妻"
        value={label}
        onChange={handleLabelChange}
      />
    </div>
  );
}
