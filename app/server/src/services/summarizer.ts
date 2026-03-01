import OpenAI from "openai";
import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { sanitizeText } from "./sanitizer.js";
import {
  getAllQuestionsListJson,
  getQuestionListForCategory,
} from "../lib/questions.js";
import type { QuestionCategory } from "../types/conversation.js";

// --- Types ---

export interface PreviousNoteEntry {
  questionId: string;
  questionTitle: string;
  answer: string;
}

export interface SummarizeRequest {
  category: QuestionCategory | null;
  transcript: Array<{ role: "user" | "assistant"; text: string }>;
  /** Current note entries for relevant questions, enabling change-aware summaries. */
  previousNoteEntries?: PreviousNoteEntry[];
}

export interface NoteEntry {
  questionId: string;
  questionTitle: string;
  answer: string;
  sourceEvidence: string;
}

export interface KeyPoints {
  importantStatements: string[];
  decisions: string[];
  undecidedItems: string[];
}

export interface SummarizeResponse {
  summary: string;
  coveredQuestionIds: string[];
  noteEntries: NoteEntry[];
  extractedUserName?: string | null;
  oneLinerSummary: string;
  emotionAnalysis: string;
  discussedCategories: string[];
  keyPoints: KeyPoints;
  topicAdherence: "high" | "medium" | "low";
  offTopicSummary: string;
}

// --- Constants ---

const MAX_TRANSCRIPT_CHARS = 30_000;
const MODEL = "gpt-5-nano";
const TEMPERATURE = 1;

const RESPONSE_JSON_SCHEMA = {
  name: "summarize_response",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" as const },
      oneLinerSummary: { type: "string" as const },
      emotionAnalysis: { type: "string" as const },
      discussedCategories: {
        type: "array" as const,
        items: { type: "string" as const },
      },
      keyPoints: {
        type: "object" as const,
        properties: {
          importantStatements: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          decisions: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          undecidedItems: {
            type: "array" as const,
            items: { type: "string" as const },
          },
        },
        required: [
          "importantStatements",
          "decisions",
          "undecidedItems",
        ] as const,
        additionalProperties: false,
      },
      coveredQuestionIds: {
        type: "array" as const,
        items: { type: "string" as const },
      },
      noteEntries: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            questionId: { type: "string" as const },
            questionTitle: { type: "string" as const },
            answer: { type: "string" as const },
            sourceEvidence: { type: "string" as const },
          },
          required: [
            "questionId",
            "questionTitle",
            "answer",
            "sourceEvidence",
          ] as const,
          additionalProperties: false,
        },
      },
      extractedUserName: { type: ["string", "null"] as const },
      topicAdherence: {
        type: "string" as const,
        enum: ["high", "medium", "low"],
      },
      offTopicSummary: { type: "string" as const },
    },
    required: [
      "summary",
      "oneLinerSummary",
      "emotionAnalysis",
      "discussedCategories",
      "keyPoints",
      "coveredQuestionIds",
      "noteEntries",
      "extractedUserName",
      "topicAdherence",
      "offTopicSummary",
    ] as const,
    additionalProperties: false,
  },
};

// --- Helpers ---

function buildPreviousEntriesBlock(
  previousNoteEntries?: PreviousNoteEntry[],
): string {
  if (previousNoteEntries === undefined || previousNoteEntries.length === 0) {
    return "";
  }
  const lines = previousNoteEntries
    .map((e) => `- ${e.questionTitle}: ${e.answer}`)
    .join("\n");
  return `\n\n【以前の回答内容】
以前の会話でユーザーが記録した回答：
${lines}

ユーザーが以前の回答を更新・訂正した場合は、noteEntriesのanswerに変更後の最新内容を反映してください。
変更の経緯がわかる場合は「〇〇から△△に変更」のように変更内容を含めた簡潔な回答にしてください。`;
}

function buildSystemPrompt(
  category: QuestionCategory,
  questionListJson: string,
  previousNoteEntries?: PreviousNoteEntry[],
): string {
  return `あなたはエンディングノートの会話を分析し、構造化されたノートエントリーに変換するアシスタントです。

以下の会話は「${category}」カテゴリに関するものです。

このカテゴリには以下の質問項目があります：
${questionListJson}${buildPreviousEntriesBlock(previousNoteEntries)}

【タスク】
会話を分析し、以下のJSON形式で結果を返してください：

{
  "summary": "会話全体の要約（2〜3文、日本語）",
  "oneLinerSummary": "会話内容を一言で表す短い要約（20〜40文字）",
  "emotionAnalysis": "会話の雰囲気やユーザーの感情を一文で（温かく柔らかい表現で）",
  "discussedCategories": ["この会話で実際に話題にしたカテゴリIDの配列"],
  "keyPoints": {
    "importantStatements": ["ユーザーが語った重要な発言（0〜5個）"],
    "decisions": ["ユーザーが明確に決めたこと（0〜5個）"],
    "undecidedItems": ["まだ迷っている・決まっていないこと（0〜5個）"]
  },
  "coveredQuestionIds": ["会話の中でユーザーが実際に回答した質問のIDの配列"],
  "noteEntries": [
    {
      "questionId": "質問ID",
      "questionTitle": "質問タイトル",
      "answer": "ユーザーの回答を簡潔にまとめたもの",
      "sourceEvidence": "ユーザー発話からの根拠引用（原文のまま）"
    }
  ],
  "extractedUserName": "ユーザーの名前（検出できない場合はnull）",
  "topicAdherence": "会話がテーマに沿っていた度合い（high/medium/low）",
  "offTopicSummary": "テーマ外の話題があれば簡潔に記述（なければ空文字列）"
}

【ルール】
1. ユーザーが実際に回答した質問のみを含めてください。推測で項目を追加しないでください。
2. ユーザーの言葉を尊重しつつ、簡潔にまとめてください。
3. クレジットカード番号、口座番号、パスワードなどの機密情報は「[保護済み]」に置き換えてください。
4. 回答は日本語で記述してください。
5. noteEntriesの各項目のquestionIdは、上記の質問リストに含まれるIDのみを使用してください。
6. 必ず有効なJSONのみを返してください。説明文は不要です。
7. oneLinerSummaryは「〜についてお話ししました」のような形式で、一覧カードの一行プレビューに使います。40文字以内で。
8. emotionAnalysisは「穏やかな雰囲気で〜」のような温かい表現で。臨床的・評価的な表現は避けてください。
9. discussedCategoriesには、実際に話題に上がったカテゴリのIDを含めてください。有効値: memories, people, house, medical, funeral, money, work, digital, legal, trust, support
10. keyPointsの各配列は最大5個まで。該当がなければ空配列にしてください。
11. topicAdherenceの判断基準：
    - high: 会話のほぼ全体がエンディングノートに関連していた（自然な脱線含む）
    - medium: テーマ外の話題がいくつかあったが、メインはエンディングノートの内容だった
    - low: 会話の大部分がエンディングノートと無関係な話題だった
12. offTopicSummaryはテーマ外の話題があった場合のみ記述。なければ空文字列（""）にしてください。
13. noteEntries.answerは、ユーザー発話に含まれる事実のみで作成してください。アシスタントの提案・推測・一般論を事実として書かないでください。
14. noteEntries.sourceEvidenceには、ユーザー発話から10〜40文字程度を原文のまま引用してください（要約・改変しない）。
15. カテゴリが legal（相続・遺言）、trust（信託・委任）、support（支援制度）の場合、summaryの末尾に「※この記録は参考情報であり、法的効力はありません。正式な手続きには専門家にご相談ください。」と付記してください。

【カテゴリ別の分析ガイド】
- legal（相続・遺言）: 相続の希望、遺言書の有無や内容、遺産分割の意向、生前贈与の計画など、相続・遺言に関する具体的な希望や状況を重点的に抽出してください。
- trust（信託・委任）: 家族信託の検討状況、任意後見の希望、死後事務委任の意向、見守り契約など、信託・委任に関する具体的な希望や取り決めを重点的に抽出してください。
- support（支援制度）: 成年後見制度、生活保護、介護保険、リバースモーゲージなど、各種支援制度への認知度や利用意向を重点的に抽出してください。

【追加タスク - ユーザー名の検出】
会話の中でユーザーが自分の名前や呼び名を言っている場合、"extractedUserName" フィールドに記録してください。
例：「太郎です」「まさこって呼んでください」→ "太郎"、"まさこ"
名前が検出できない場合は null にしてください。`;
}

function buildGuidedSystemPrompt(
  allQuestionsJson: string,
  previousNoteEntries?: PreviousNoteEntry[],
): string {
  return `あなたはエンディングノートの会話を分析し、構造化されたノートエントリーに変換するアシスタントです。

以下の会話はカテゴリを横断した自由形式の会話です。複数のカテゴリにまたがる内容が含まれている可能性があります。

以下はすべてのカテゴリの質問項目一覧です：
${allQuestionsJson}${buildPreviousEntriesBlock(previousNoteEntries)}

【タスク】
会話を分析し、以下のJSON形式で結果を返してください：

{
  "summary": "会話全体の要約（2〜3文、日本語）",
  "oneLinerSummary": "会話内容を一言で表す短い要約（20〜40文字）",
  "emotionAnalysis": "会話の雰囲気やユーザーの感情を一文で（温かく柔らかい表現で）",
  "discussedCategories": ["この会話で実際に話題にしたカテゴリIDの配列"],
  "keyPoints": {
    "importantStatements": ["ユーザーが語った重要な発言（0〜5個）"],
    "decisions": ["ユーザーが明確に決めたこと（0〜5個）"],
    "undecidedItems": ["まだ迷っている・決まっていないこと（0〜5個）"]
  },
  "coveredQuestionIds": ["会話の中でユーザーが実際に回答した質問のIDの配列"],
  "noteEntries": [
    {
      "questionId": "質問ID",
      "questionTitle": "質問タイトル",
      "answer": "ユーザーの回答を簡潔にまとめたもの",
      "sourceEvidence": "ユーザー発話からの根拠引用（原文のまま）"
    }
  ],
  "extractedUserName": "ユーザーの名前（検出できない場合はnull）",
  "topicAdherence": "会話がテーマに沿っていた度合い（high/medium/low）",
  "offTopicSummary": "テーマ外の話題があれば簡潔に記述（なければ空文字列）"
}

【ルール】
1. ユーザーが実際に回答した質問のみを含めてください。推測で項目を追加しないでください。
2. ユーザーの言葉を尊重しつつ、簡潔にまとめてください。
3. クレジットカード番号、口座番号、パスワードなどの機密情報は「[保護済み]」に置き換えてください。
4. 回答は日本語で記述してください。
5. カテゴリを問わず、ユーザーの回答に該当する質問項目があればマッチさせてください。
6. noteEntriesの各項目のquestionIdは、上記の質問一覧に含まれるIDのみを使用してください。
7. 必ず有効なJSONのみを返してください。説明文は不要です。
8. oneLinerSummaryは「〜についてお話ししました」のような形式で、一覧カードの一行プレビューに使います。40文字以内で。
9. emotionAnalysisは「穏やかな雰囲気で〜」のような温かい表現で。臨床的・評価的な表現は避けてください。
10. discussedCategoriesには、実際に話題に上がったカテゴリのIDを含めてください。有効値: memories, people, house, medical, funeral, money, work, digital, legal, trust, support
11. keyPointsの各配列は最大5個まで。該当がなければ空配列にしてください。
12. topicAdherenceの判断基準：
    - high: 会話のほぼ全体がエンディングノートに関連していた（自然な脱線含む）
    - medium: テーマ外の話題がいくつかあったが、メインはエンディングノートの内容だった
    - low: 会話の大部分がエンディングノートと無関係な話題だった
13. offTopicSummaryはテーマ外の話題があった場合のみ記述。なければ空文字列（""）にしてください。
14. noteEntries.answerは、ユーザー発話に含まれる事実のみで作成してください。アシスタントの提案・推測・一般論を事実として書かないでください。
15. noteEntries.sourceEvidenceには、ユーザー発話から10〜40文字程度を原文のまま引用してください（要約・改変しない）。
16. 会話内容が legal（相続・遺言）、trust（信託・委任）、support（支援制度）のカテゴリに関連する場合、summaryの末尾に「※この記録は参考情報であり、法的効力はありません。正式な手続きには専門家にご相談ください。」と付記してください。

【追加タスク - ユーザー名の検出】
会話の中でユーザーが自分の名前や呼び名を言っている場合、"extractedUserName" フィールドに記録してください。
例：「太郎です」「まさこって呼んでください」→ "太郎"、"まさこ"
名前が検出できない場合は null にしてください。`;
}

function truncateTranscript(
  transcript: Array<{ role: string; text: string }>,
): string {
  let result = "";
  for (const entry of transcript) {
    const roleLabel = entry.role === "user" ? "ユーザー" : "アシスタント";
    const line = `${roleLabel}: ${entry.text}\n`;
    if (result.length + line.length > MAX_TRANSCRIPT_CHARS) {
      // Add as much of the last entry as fits
      const remaining = MAX_TRANSCRIPT_CHARS - result.length;
      if (remaining > 0) {
        result += line.slice(0, remaining);
      }
      break;
    }
    result += line;
  }
  return result;
}

function normalizeForGrounding(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[「」『』"'`.,!?！？。、…・〜ー～()［］[\]{}]/g, "");
}

function filterGroundedNoteEntries(
  noteEntries: NoteEntry[],
  userTranscript: Array<{ role: "user" | "assistant"; text: string }>,
): NoteEntry[] {
  const userCorpus = normalizeForGrounding(
    userTranscript
      .filter((entry) => entry.role === "user")
      .map((entry) => entry.text)
      .join(""),
  );
  if (userCorpus.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const grounded: NoteEntry[] = [];

  for (const entry of noteEntries) {
    const evidence = entry.sourceEvidence.trim();
    const normalizedEvidence = normalizeForGrounding(evidence);
    if (normalizedEvidence.length < 2) continue;
    if (!userCorpus.includes(normalizedEvidence)) continue;

    const dedupeKey = `${entry.questionId}:${normalizeForGrounding(entry.answer)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    grounded.push({
      ...entry,
      sourceEvidence: evidence,
    });
  }

  return grounded;
}

const VALID_CATEGORY_SET = new Set([
  "memories",
  "people",
  "house",
  "medical",
  "funeral",
  "money",
  "work",
  "digital",
  "legal",
  "trust",
  "support",
]);

function validateStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== "string") return false;
  }
  return true;
}

function validateKeyPoints(value: unknown): value is KeyPoints {
  if (typeof value !== "object" || value === null) return false;
  const kp = value as Record<string, unknown>;
  if (!validateStringArray(kp["importantStatements"])) return false;
  if (!validateStringArray(kp["decisions"])) return false;
  if (!validateStringArray(kp["undecidedItems"])) return false;
  return true;
}

function validateResponse(data: unknown): data is SummarizeResponse {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj["summary"] !== "string") return false;
  if (typeof obj["oneLinerSummary"] !== "string") return false;
  if (typeof obj["emotionAnalysis"] !== "string") return false;

  if (!validateStringArray(obj["coveredQuestionIds"])) return false;

  // Validate discussedCategories contains only valid category IDs
  if (!Array.isArray(obj["discussedCategories"])) return false;
  for (const cat of obj["discussedCategories"]) {
    if (typeof cat !== "string" || !VALID_CATEGORY_SET.has(cat)) return false;
  }

  if (!validateKeyPoints(obj["keyPoints"])) return false;

  if (!Array.isArray(obj["noteEntries"])) return false;
  for (const entry of obj["noteEntries"]) {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (typeof e["questionId"] !== "string") return false;
    if (typeof e["questionTitle"] !== "string") return false;
    if (typeof e["answer"] !== "string") return false;
    if (typeof e["sourceEvidence"] !== "string") return false;
  }

  // extractedUserName is optional: string or null
  if (
    "extractedUserName" in obj &&
    obj["extractedUserName"] !== null &&
    typeof obj["extractedUserName"] !== "string"
  ) {
    return false;
  }

  // Validate topicAdherence
  if (typeof obj["topicAdherence"] !== "string") return false;
  const VALID_ADHERENCE_VALUES = new Set(["high", "medium", "low"]);
  if (!VALID_ADHERENCE_VALUES.has(obj["topicAdherence"])) return false;

  // Validate offTopicSummary
  if (typeof obj["offTopicSummary"] !== "string") return false;

  return true;
}

// --- Main function ---

export async function summarizeConversation(
  request: SummarizeRequest,
): Promise<SummarizeResponse> {
  const config = loadConfig();

  const openai = new OpenAI({
    apiKey: config.openaiApiKey,
  });

  // Sanitize transcript entries
  const sanitizedTranscript = request.transcript.map((entry) => ({
    role: entry.role,
    text: sanitizeText(entry.text),
  }));
  const userOnlyTranscript = sanitizedTranscript.filter(
    (entry) => entry.role === "user" && entry.text.trim().length > 0,
  );
  const transcriptForAnalysis =
    userOnlyTranscript.length > 0
      ? userOnlyTranscript
      : [{ role: "user" as const, text: "（ユーザー発話なし）" }];

  let systemPrompt: string;
  if (request.category !== null) {
    const questionListJson = getQuestionListForCategory(request.category);
    systemPrompt = buildSystemPrompt(
      request.category,
      questionListJson,
      request.previousNoteEntries,
    );
  } else {
    const allQuestionsJson = getAllQuestionsListJson();
    systemPrompt = buildGuidedSystemPrompt(
      allQuestionsJson,
      request.previousNoteEntries,
    );
  }
  const userMessage = truncateTranscript(transcriptForAnalysis);

  logger.info("Summarization request", {
    category: request.category,
    transcriptLength: request.transcript.length,
    userTranscriptLength: userOnlyTranscript.length,
    truncatedChars: userMessage.length,
  });

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    response_format: { type: "json_schema", json_schema: RESPONSE_JSON_SCHEMA },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    logger.error("Failed to parse OpenAI response as JSON", {
      content: content.slice(0, 500),
    });
    throw new Error("Invalid JSON response from OpenAI");
  }

  if (!validateResponse(parsed)) {
    logger.error("OpenAI response does not match expected structure", {
      content: content.slice(0, 500),
    });
    throw new Error("Invalid response structure from OpenAI");
  }

  const groundedNoteEntries = filterGroundedNoteEntries(
    parsed.noteEntries,
    userOnlyTranscript,
  );
  const groundedQuestionIdSet = new Set(
    groundedNoteEntries.map((entry) => entry.questionId),
  );
  const coveredQuestionIds = parsed.coveredQuestionIds.filter((questionId) =>
    groundedQuestionIdSet.has(questionId),
  );

  const finalized: SummarizeResponse = {
    ...parsed,
    noteEntries: groundedNoteEntries,
    coveredQuestionIds,
  };

  logger.info("Summarization complete", {
    category: request.category,
    coveredQuestions: finalized.coveredQuestionIds.length,
    noteEntries: finalized.noteEntries.length,
    topicAdherence: finalized.topicAdherence,
    offTopicSummary: finalized.offTopicSummary,
  });

  return finalized;
}
