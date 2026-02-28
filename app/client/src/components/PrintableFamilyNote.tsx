import { useCallback } from "react";

import { useFamilyEndingNote } from "../hooks/useFamilyEndingNote";
import { SETTINGS_MESSAGES } from "../lib/constants";
import { logPrintEvent } from "../lib/family-api";
import { PrintableNoteLayout } from "./PrintableNoteLayout";

import type { ReactNode } from "react";

interface PrintableFamilyNoteProps {
  creatorId: string;
  creatorName: string;
  onClose: () => void;
}

export function PrintableFamilyNote({
  creatorId,
  creatorName,
  onClose,
}: PrintableFamilyNoteProps): ReactNode {
  const { categories, isLoading, error, refresh } =
    useFamilyEndingNote(creatorId);

  const handlePrint = useCallback((): void => {
    logPrintEvent(creatorId, "note").catch((err: unknown) => {
      console.error("Failed to log print event:", {
        error: err instanceof Error ? err.message : "Unknown error",
        creatorId,
      });
    });
  }, [creatorId]);

  return (
    <PrintableNoteLayout
      title={`${creatorName}さんのエンディングノート`}
      subtitle={SETTINGS_MESSAGES.print.subtitle}
      categories={categories}
      isLoading={isLoading}
      error={error}
      onRefresh={refresh}
      onClose={onClose}
      onPrint={handlePrint}
    />
  );
}
