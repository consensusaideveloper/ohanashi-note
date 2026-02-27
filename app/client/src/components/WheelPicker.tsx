import { useState, useRef, useEffect, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";
import { useWheelPicker } from "../hooks/useWheelPicker";

import type { ReactNode } from "react";

const ITEM_HEIGHT = 56;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const SPACER_HEIGHT = ITEM_HEIGHT * 2;

export interface WheelPickerOption {
  readonly value: string;
  readonly label: string;
}

interface WheelPickerProps {
  isOpen: boolean;
  options: readonly WheelPickerOption[];
  selectedValue: string;
  title: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function WheelPicker({
  isOpen,
  options,
  selectedValue,
  title,
  onConfirm,
  onCancel,
}: WheelPickerProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const initialIndex = Math.max(
    0,
    options.findIndex((o) => o.value === selectedValue),
  );

  const [tentativeIndex, setTentativeIndex] = useState(initialIndex);

  const { scrollContainerRef, selectedIndex, handleScroll, scrollToIndex } =
    useWheelPicker(options.length, initialIndex, isOpen);

  useEffect(() => {
    setTentativeIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      setTentativeIndex(initialIndex);
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, initialIndex]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>): void => {
      if (e.target === dialogRef.current) {
        onCancel();
      }
    },
    [onCancel],
  );

  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>): void => {
      e.preventDefault();
      onCancel();
    },
    [onCancel],
  );

  const handleConfirm = useCallback((): void => {
    const option = options[tentativeIndex];
    if (option !== undefined) {
      onConfirm(option.value);
    }
  }, [tentativeIndex, options, onConfirm]);

  const handleCancelClick = useCallback((): void => {
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(tentativeIndex + 1, options.length - 1);
        scrollToIndex(next);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(tentativeIndex - 1, 0);
        scrollToIndex(prev);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    },
    [tentativeIndex, options.length, scrollToIndex, handleConfirm],
  );

  const getItemClasses = (index: number): string => {
    const distance = Math.abs(index - tentativeIndex);
    if (distance === 0) return "text-text-primary font-semibold scale-105";
    if (distance === 1) return "text-text-secondary opacity-70";
    return "text-text-secondary opacity-40";
  };

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/40 bg-transparent p-0 w-full max-w-md m-auto mb-0 md:mb-auto"
      onClick={handleBackdropClick}
      onCancel={handleNativeCancel}
    >
      <div className="bg-bg-surface rounded-t-card md:rounded-card shadow-lg animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <button
            type="button"
            className="min-h-11 min-w-11 px-2 text-lg text-text-secondary transition-colors active:text-text-primary"
            onClick={handleCancelClick}
          >
            {UI_MESSAGES.wheelPicker.cancel}
          </button>
          <span className="text-xl font-semibold text-text-primary">
            {title}
          </span>
          <button
            type="button"
            className="min-h-11 min-w-11 px-2 text-lg font-semibold text-accent-primary transition-colors active:text-accent-primary-hover"
            onClick={handleConfirm}
          >
            {UI_MESSAGES.wheelPicker.confirm}
          </button>
        </div>

        {/* Wheel area */}
        <div
          className="relative overflow-hidden"
          style={{ height: WHEEL_HEIGHT }}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="listbox"
          aria-label={title}
          aria-activedescendant={`wheel-option-${String(tentativeIndex)}`}
        >
          {/* Top gradient fade */}
          <div
            className="wheel-fade-top absolute top-0 left-0 right-0 z-10 pointer-events-none"
            style={{ height: SPACER_HEIGHT }}
            aria-hidden="true"
          />

          {/* Center selection indicator */}
          <div
            className="absolute left-4 right-4 z-10 pointer-events-none border-y-2 border-accent-primary/30 bg-accent-primary/5 rounded-lg"
            style={{ top: SPACER_HEIGHT, height: ITEM_HEIGHT }}
            aria-hidden="true"
          />

          {/* Bottom gradient fade */}
          <div
            className="wheel-fade-bottom absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
            style={{ height: SPACER_HEIGHT }}
            aria-hidden="true"
          />

          {/* Scrollable list */}
          <div
            ref={scrollContainerRef}
            className="wheel-scroll absolute inset-0 overflow-y-auto overscroll-contain"
            onScroll={handleScroll}
          >
            {/* Top spacer */}
            <div style={{ height: SPACER_HEIGHT }} aria-hidden="true" />

            {/* Options */}
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`wheel-option-${String(index)}`}
                role="option"
                aria-selected={index === tentativeIndex}
                className={`flex items-center justify-center text-xl transition-all duration-150 select-none ${getItemClasses(index)}`}
                style={{
                  height: ITEM_HEIGHT,
                  scrollSnapAlign: "center" as const,
                }}
              >
                {option.label}
              </div>
            ))}

            {/* Bottom spacer */}
            <div style={{ height: SPACER_HEIGHT }} aria-hidden="true" />
          </div>
        </div>
      </div>
    </dialog>
  );
}
