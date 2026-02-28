import { useState, useEffect } from "react";

import { useEndingNote } from "../hooks/useEndingNote";
import { getUserProfile } from "../lib/storage";
import { SETTINGS_MESSAGES } from "../lib/constants";
import { PrintableNoteLayout } from "./PrintableNoteLayout";

import type { ReactNode } from "react";

interface PrintableEndingNoteProps {
  onClose: () => void;
}

export function PrintableEndingNote({
  onClose,
}: PrintableEndingNoteProps): ReactNode {
  const { categories, isLoading, error, refresh } = useEndingNote();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    void getUserProfile().then((profile) => {
      if (profile !== null) {
        setUserName(profile.name);
      }
    });
  }, []);

  return (
    <PrintableNoteLayout
      title={SETTINGS_MESSAGES.print.title}
      subtitle={SETTINGS_MESSAGES.print.subtitle}
      userName={userName}
      categories={categories}
      isLoading={isLoading}
      error={error}
      onRefresh={refresh}
      onClose={onClose}
    />
  );
}
