import OpenAI from "openai";

import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

// --- Types ---

interface NoteEntryInput {
  questionId: string;
  questionTitle: string;
  answer: string;
  category: string;
}

export interface GeneratedTodo {
  title: string;
  description: string;
  sourceCategory: string;
  sourceQuestionId: string;
  sourceAnswer: string;
  priority: "high" | "medium" | "low";
}

interface AiTodoResponse {
  todos: GeneratedTodo[];
}

// --- Constants ---

const MODEL = "gpt-5-nano";
const MAX_ANSWER_LENGTH = 500;

/** Categories where TODOs are typically not actionable. */
const SKIP_CATEGORIES = new Set(["memories"]);

// --- Prompt ---

const SYSTEM_PROMPT = `あなたはエンディングノート（終活ノート）の内容を分析し、ご遺族が対応すべき「やること」を整理するアシスタントです。

## ルール
1. 各ノート項目の回答内容を読み、ご遺族が具体的に行動すべきことをTODOとして出力してください。
2. 1つの回答から複数のTODOを作成してもかまいません。
3. 曖昧な回答や情報が不足している場合は、「確認する」「調べる」系のTODOを作成してください。
4. TODOのタイトルは短く簡潔に（20文字以内が理想）。
5. TODOの説明は具体的な手順や注意点を含めてください（100文字程度）。
6. 優先度は以下の基準で設定：
   - high: 期限がある、法的手続き、金融関連、葬儀関連など緊急性の高いもの
   - medium: 重要だが緊急でないもの（家の管理、デジタル整理など）
   - low: 時間に余裕があるもの（形見分け、メッセージの共有など）
7. 感情的な記録（思い出、メッセージ）からはTODOを作成しないでください。
8. 回答が空や「特になし」の場合はTODOを作成しないでください。

## 出力形式
以下のJSON形式で出力してください：
{
  "todos": [
    {
      "title": "TODOタイトル",
      "description": "具体的な説明・手順",
      "sourceCategory": "元のカテゴリID",
      "sourceQuestionId": "元の質問ID",
      "sourceAnswer": "元の回答（短縮版）",
      "priority": "high|medium|low"
    }
  ]
}

TODOが1つもない場合は {"todos": []} を返してください。`;

// --- Response validation ---

function isValidTodoResponse(data: unknown): data is AiTodoResponse {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj["todos"])) return false;

  for (const item of obj["todos"] as unknown[]) {
    if (typeof item !== "object" || item === null) return false;
    const todo = item as Record<string, unknown>;
    if (typeof todo["title"] !== "string") return false;
    if (typeof todo["description"] !== "string") return false;
    if (typeof todo["sourceCategory"] !== "string") return false;
    if (typeof todo["sourceQuestionId"] !== "string") return false;
    if (typeof todo["priority"] !== "string") return false;
    if (!["high", "medium", "low"].includes(todo["priority"])) {
      return false;
    }
  }

  return true;
}

// --- Main function ---

/**
 * Generate actionable TODOs from ending note entries using AI analysis.
 * Filters out non-actionable categories (e.g. memories) before sending to AI.
 */
export async function generateTodosFromNotes(
  noteEntries: NoteEntryInput[],
): Promise<GeneratedTodo[]> {
  // Filter out non-actionable categories and empty answers
  const actionableEntries = noteEntries.filter(
    (entry) =>
      !SKIP_CATEGORIES.has(entry.category) &&
      entry.answer.trim().length > 0 &&
      entry.answer.trim() !== "特になし",
  );

  if (actionableEntries.length === 0) {
    logger.info("No actionable note entries found for TODO generation");
    return [];
  }

  // Truncate long answers
  const truncatedEntries = actionableEntries.map((entry) => ({
    questionId: entry.questionId,
    questionTitle: entry.questionTitle,
    category: entry.category,
    answer:
      entry.answer.length > MAX_ANSWER_LENGTH
        ? entry.answer.slice(0, MAX_ANSWER_LENGTH) + "..."
        : entry.answer,
  }));

  const config = loadConfig();
  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  const userMessage = JSON.stringify(truncatedEntries, null, 2);

  logger.info("Generating TODOs from note entries", {
    entryCount: truncatedEntries.length,
    categories: [...new Set(truncatedEntries.map((e) => e.category))],
  });

  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("AIからの応答が空でした");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    logger.error("Failed to parse AI response as JSON", {
      content: content.slice(0, 500),
    });
    throw new Error("AIからの応答を解析できませんでした");
  }

  if (!isValidTodoResponse(parsed)) {
    logger.error("AI response does not match expected structure", {
      content: content.slice(0, 500),
    });
    throw new Error("AIからの応答が期待する形式ではありませんでした");
  }

  // Ensure sourceAnswer is populated from original entries
  const entryMap = new Map(
    actionableEntries.map((e) => [e.questionId, e.answer]),
  );

  const todosWithAnswers = parsed.todos.map((todo) => ({
    ...todo,
    sourceAnswer:
      typeof todo.sourceAnswer === "string" && todo.sourceAnswer.length > 0
        ? todo.sourceAnswer
        : (entryMap.get(todo.sourceQuestionId) ?? ""),
  }));

  logger.info("TODO generation complete", {
    generatedCount: todosWithAnswers.length,
  });

  return todosWithAnswers;
}
