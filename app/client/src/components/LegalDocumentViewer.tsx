import { useCallback } from "react";

import { TERMS_CONSENT_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { LegalSection } from "../lib/legal-content";

interface LegalDocumentViewerProps {
  title: string;
  content: LegalSection[];
  onClose: () => void;
}

export function LegalDocumentViewer({
  title,
  content,
  onClose,
}: LegalDocumentViewerProps): ReactNode {
  const handlePrint = useCallback((): void => {
    window.print();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary overflow-y-auto">
      {/* Header bar */}
      <div className="print-hidden sticky top-0 bg-bg-primary/95 backdrop-blur-sm border-b border-border-light px-4 py-3 flex items-center justify-between z-10">
        <button
          type="button"
          className="min-h-11 min-w-11 flex items-center gap-2 rounded-full text-text-primary text-lg px-4 py-2 hover:bg-bg-surface-hover transition-colors"
          onClick={onClose}
          aria-label="戻る"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
          {TERMS_CONSENT_MESSAGES.backButton}
        </button>
        <button
          type="button"
          className="min-h-11 min-w-11 flex items-center gap-2 rounded-full text-accent-primary text-lg px-4 py-2 hover:bg-bg-surface-hover transition-colors"
          onClick={handlePrint}
          aria-label="印刷する"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 9.456l-.007-.056"
            />
          </svg>
          {TERMS_CONSENT_MESSAGES.printButton}
        </button>
      </div>

      {/* Document content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-text-primary mb-8">{title}</h1>

        <div className="space-y-8">
          {content.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-xl font-semibold text-text-primary">
                {section.heading}
              </h2>
              {section.paragraphs.map((paragraph, pIndex) => (
                <p
                  key={pIndex}
                  className="text-lg text-text-primary leading-relaxed"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
