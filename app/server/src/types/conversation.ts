export type QuestionCategory =
  | "memories"
  | "people"
  | "house"
  | "medical"
  | "funeral"
  | "money"
  | "work"
  | "digital"
  | "legal"
  | "trust"
  | "support";

export type InsightCategory =
  | "hobbies"
  | "values"
  | "relationships"
  | "memories"
  | "concerns"
  | "other";

export type InsightImportance = "high" | "medium" | "low";

export interface InsightStatement {
  text: string;
  category: InsightCategory;
  importance: InsightImportance;
}

/** Extracts display text from an InsightStatement or legacy string format. */
export function getInsightText(item: InsightStatement | string): string {
  return typeof item === "string" ? item : item.text;
}

/** Normalizes a legacy string or InsightStatement to InsightStatement. */
export function normalizeInsightStatement(
  item: InsightStatement | string,
): InsightStatement {
  if (typeof item === "string") {
    return { text: item, category: "other", importance: "medium" };
  }
  return item;
}
