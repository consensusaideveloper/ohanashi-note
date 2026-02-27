import { useState, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { WheelPicker } from "./WheelPicker";
import { WheelPickerTrigger } from "./WheelPickerTrigger";

import type { ReactNode } from "react";
import type { WheelPickerOption } from "./WheelPicker";

interface RelationshipPickerProps {
  value: string;
  label: string;
  onRelationshipChange: (relationship: string) => void;
  onLabelChange: (label: string) => void;
}

const RELATIONSHIP_OPTIONS: readonly WheelPickerOption[] = [
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
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleOpenPicker = useCallback((): void => {
    setIsPickerOpen(true);
  }, []);

  const handleClosePicker = useCallback((): void => {
    setIsPickerOpen(false);
  }, []);

  const handlePickerConfirm = useCallback(
    (selectedValue: string): void => {
      onRelationshipChange(selectedValue);
      const option = RELATIONSHIP_OPTIONS.find(
        (o) => o.value === selectedValue,
      );
      if (option !== undefined) {
        onLabelChange(option.label);
      }
      setIsPickerOpen(false);
    },
    [onRelationshipChange, onLabelChange],
  );

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      onLabelChange(e.target.value);
    },
    [onLabelChange],
  );

  const displayValue =
    RELATIONSHIP_OPTIONS.find((o) => o.value === value)?.label ?? "";

  return (
    <div className="space-y-3">
      <label
        className="block text-lg text-text-primary"
        htmlFor="relationship-select"
      >
        続柄
      </label>
      <WheelPickerTrigger
        id="relationship-select"
        displayValue={displayValue}
        placeholder="選択してください"
        onClick={handleOpenPicker}
      />

      <WheelPicker
        isOpen={isPickerOpen}
        options={RELATIONSHIP_OPTIONS}
        selectedValue={value}
        title={UI_MESSAGES.wheelPicker.relationshipTitle}
        onConfirm={handlePickerConfirm}
        onCancel={handleClosePicker}
      />

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
