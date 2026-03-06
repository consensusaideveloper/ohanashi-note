import { useMemo } from "react";

import type { ReactNode } from "react";
import type { FlexibleNoteItem, InsightCategory } from "../lib/flexible-notes";

const INSIGHT_CATEGORY_LABELS: Record<InsightCategory, string> = {
  hobbies: "趣味・好み",
  values: "価値観",
  relationships: "人間関係",
  memories: "思い出",
  concerns: "気がかり",
  other: "その他",
};

const CATEGORY_DISPLAY_ORDER: readonly InsightCategory[] = [
  "hobbies",
  "values",
  "relationships",
  "memories",
  "concerns",
  "other",
];

interface PrintableInsightsSectionProps {
  items: FlexibleNoteItem[];
}

function formatRecordedAt(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function groupByCategory(items: FlexibleNoteItem[]): Array<{
  category: InsightCategory;
  label: string;
  items: FlexibleNoteItem[];
}> {
  const map = new Map<InsightCategory, FlexibleNoteItem[]>();

  for (const item of items) {
    const existing = map.get(item.category);
    if (existing !== undefined) {
      existing.push(item);
    } else {
      map.set(item.category, [item]);
    }
  }

  const groups: Array<{
    category: InsightCategory;
    label: string;
    items: FlexibleNoteItem[];
  }> = [];

  for (const category of CATEGORY_DISPLAY_ORDER) {
    const categoryItems = map.get(category);
    if (categoryItems !== undefined && categoryItems.length > 0) {
      groups.push({
        category,
        label: INSIGHT_CATEGORY_LABELS[category],
        items: categoryItems,
      });
    }
  }

  return groups;
}

export function PrintableInsightsSection({
  items,
}: PrintableInsightsSectionProps): ReactNode {
  const groups = useMemo(() => groupByCategory(items), [items]);

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
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.category}>
            <h3 className="text-base font-semibold text-text-secondary mb-2">
              {group.label}
            </h3>
            <div className="space-y-3">
              {group.items.map((item) => (
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
          </div>
        ))}
      </div>
    </section>
  );
}
