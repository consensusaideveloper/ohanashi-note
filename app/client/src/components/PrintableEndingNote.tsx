import { useState, useEffect, useCallback } from "react";

import { useEndingNote } from "../hooks/useEndingNote";
import { getUserProfile } from "../lib/storage";
import { SETTINGS_MESSAGES } from "../lib/constants";
import { logPrintEvent } from "../lib/family-api";
import { PrintableNoteLayout } from "./PrintableNoteLayout";

import type { ReactNode } from "react";

interface PrintableEndingNoteProps {
  onClose: () => void;
}

export function PrintableEndingNote({
  onClose,
}: PrintableEndingNoteProps): ReactNode {
  const { categories, flexibleNotes, isLoading, error, refresh } =
    useEndingNote();
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void getUserProfile().then((profile) => {
      if (profile !== null) {
        setUserName(profile.name);
        setUserId(profile.id ?? null);
      }
    });
  }, []);

  const handlePrint = useCallback((): void => {
    if (userId === null) return;
    logPrintEvent(userId, "note").catch((err: unknown) => {
      console.error("Failed to log creator print event:", {
        error: err instanceof Error ? err.message : "Unknown error",
        userId,
      });
    });
  }, [userId]);

  return (
    <PrintableNoteLayout
      title={SETTINGS_MESSAGES.print.title}
      subtitle={SETTINGS_MESSAGES.print.subtitle}
      userName={userName}
      categories={categories}
      flexibleNotes={flexibleNotes}
      isLoading={isLoading}
      error={error}
      onRefresh={refresh}
      onClose={onClose}
      onPrint={handlePrint}
    />
  );
}
