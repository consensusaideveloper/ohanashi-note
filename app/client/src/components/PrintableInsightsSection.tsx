import type { ReactNode } from "react";
import type { FlexibleNoteItem } from "../lib/flexible-notes";

interface PrintableInsightsSectionProps {
  items: FlexibleNoteItem[];
}

function formatRecordedAt(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function PrintableInsightsSection({
  items,
}: PrintableInsightsSectionProps): ReactNode {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="print-no-break mb-8">
      <h2 className="text-xl font-semibold text-text-primary mb-2">
        会話から見えたこと
      </h2>
      <p className="text-base text-text-secondary mb-4">
        質問項目に直接当てはまらない、好きなことや思い出、人となりのメモ
      </p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="border-l-2 border-border pl-3">
            <p className="text-base text-text-primary leading-relaxed">
              {item.text}
            </p>
            <p className="text-sm text-text-secondary mt-1">
              {formatRecordedAt(item.recordedAt)}の会話
              {item.mentionCount > 1
                ? ` ・ ${item.mentionCount}回出てきた話題`
                : ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
