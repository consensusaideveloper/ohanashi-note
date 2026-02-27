import { useRef, useState, useCallback, useEffect } from "react";

const ITEM_HEIGHT = 56;

interface UseWheelPickerReturn {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  selectedIndex: number;
  handleScroll: () => void;
  scrollToIndex: (index: number) => void;
}

export function useWheelPicker(
  optionCount: number,
  initialIndex: number,
  isOpen: boolean,
): UseWheelPickerReturn {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useEffect(() => {
    if (!isOpen) return;
    const container = scrollContainerRef.current;
    if (container === null) return;

    requestAnimationFrame(() => {
      container.scrollTo({
        top: initialIndex * ITEM_HEIGHT,
        behavior: "instant" as ScrollBehavior,
      });
      setSelectedIndex(initialIndex);
    });
  }, [isOpen, initialIndex]);

  const handleScroll = useCallback((): void => {
    const container = scrollContainerRef.current;
    if (container === null) return;
    const scrollTop = container.scrollTop;
    const index = Math.round(scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(index, optionCount - 1));
    setSelectedIndex(clamped);
  }, [optionCount]);

  const scrollToIndex = useCallback((index: number): void => {
    const container = scrollContainerRef.current;
    if (container === null) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    container.scrollTo({
      top: index * ITEM_HEIGHT,
      behavior: prefersReducedMotion ? "instant" : "smooth",
    });
  }, []);

  return { scrollContainerRef, selectedIndex, handleScroll, scrollToIndex };
}
