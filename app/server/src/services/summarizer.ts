import OpenAI from "openai";
import { loadConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { sanitizeText } from "./sanitizer.js";
import { getAllQuestionsListJson, getQuestionById } from "../lib/questions.js";
import type { QuestionCategory } from "../types/conversation.js";

// --- Types ---

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

export interface NoteUpdateProposal {
  questionId: string;
  questionTitle: string;
  category: QuestionCategory;
  questionType: "single" | "accumulative";
  proposalType: "add" | "update";
  previousAnswer: string | null;
  proposedAnswer: string;
  sourceEvidence: string;
}

export interface KeyPoints {
  importantStatements: InsightStatement[];
  decisions: string[];
  undecidedItems: string[];
}

export interface SummarizeResponse {
  summary: string;
  coveredQuestionIds: string[];
  noteEntries: NoteEntry[];
  noteUpdateProposals: NoteUpdateProposal[];
  extractedUserName?: string | null;
  oneLinerSummary: string;
  discussedCategories: string[];
  keyPoints: KeyPoints;
  topicAdherence: "high" | "medium" | "low";
  offTopicSummary: string;
}

// --- Constants ---

const MAX_TRANSCRIPT_CHARS = 30_000;
const DISCUSSED_CATEGORY_ENUM = [
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
] as const;

const DISCUSSED_CATEGORY_ALIAS_MAP: Readonly<Record<string, QuestionCategory>> =
  {
    relationship: "people",
    relationships: "people",
    finance: "money",
    finances: "money",
  };
const NON_SUBSTANTIVE_IMPORTANT_STATEMENT_PATTERNS = [
  "こんにちは",
  "こんばんは",
  "おはよう",
  "よろしく",
  "ありがとうございます",
  "ありがとう",
  "わかりました",
  "そうですね",
  "大丈夫です",
  "今日はここまで",
  "今日は会話を終",
  "会話を終",
  "会話を終了",
  "お話を終",
  "話を終",
  "ここで終",
  "ここまでにする",
  "また今度",
  "またこんど",
  "いったん終",
  "次の画面",
  "画面を切り替",
  "設定を完了",
  "設定が完了",
  "設定を終",
  "設定を済ませ",
  "話す速さ",
  "待ち時間",
  "確認の頻度",
  "文字の大きさ",
  "話し相手",
  "キャラクター",
] as const;
const NON_SUBSTANTIVE_DECISION_PATTERNS = [
  "今日はここまで",
  "今日は会話を終",
  "会話を終",
  "会話を終了",
  "お話を終",
  "話を終",
  "ここで終",
  "ここまでにする",
  "また今度",
  "またこんど",
  "いったん終",
  "次の画面",
  "画面を切り替",
  "設定を完了",
  "設定が完了",
  "設定を終",
  "設定を済ませ",
  "話す速さ",
  "待ち時間",
  "確認の頻度",
  "文字の大きさ",
  "話し相手",
  "キャラクター",
] as const;

const RESPONSE_JSON_SCHEMA = {
  name: "summarize_response",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" as const },
      oneLinerSummary: { type: "string" as const },
      discussedCategories: {
        type: "array" as const,
        items: {
          type: "string" as const,
          enum: DISCUSSED_CATEGORY_ENUM,
        },
      },
      keyPoints: {
        type: "object" as const,
        properties: {
          importantStatements: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                text: { type: "string" as const },
                category: {
                  type: "string" as const,
                  enum: [
                    "hobbies",
                    "values",
                    "relationships",
                    "memories",
                    "concerns",
                    "other",
                  ],
                },
                importance: {
                  type: "string" as const,
                  enum: ["high", "medium", "low"],
                },
              },
              required: ["text", "category", "importance"] as const,
              additionalProperties: false,
            },
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
  allQuestionsJson: string,
  previousNoteEntries?: PreviousNoteEntry[],
): string {
  return `あなたはエンディングノートの会話を分析し、構造化されたノートエントリーに変換するアシスタントです。

以下の会話は「${category}」カテゴリを主テーマにしたものです。
会話中に他カテゴリの内容が含まれる場合があります。その場合は主テーマへ無理に当てはめず、内容に最も合うカテゴリで整理してください。

以下は全カテゴリの質問項目一覧です：
${allQuestionsJson}${buildPreviousEntriesBlock(previousNoteEntries)}

【タスク】
会話を分析し、以下のJSON形式で結果を返してください：

{
  "summary": "会話全体の要約（2〜3文、日本語）",
  "oneLinerSummary": "会話内容を一言で表す短い要約（20〜40文字）",
  "discussedCategories": ["この会話で実際に話題にしたカテゴリIDの配列"],
  "keyPoints": {
    "importantStatements": [
      {
        "text": "ユーザーが語った、人物像の理解に役立つ発言",
        "category": "hobbies | values | relationships | memories | concerns | other",
        "importance": "high | medium | low"
      }
    ],
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
5. noteEntriesの各項目のquestionIdは、上記の質問一覧に含まれるIDのみを使用してください。
5.1. 主テーマ（${category}）に沿った内容を優先して抽出しつつ、会話中に他カテゴリへ明確に該当する内容が出た場合は、そのカテゴリのquestionIdで記録してください（主テーマへ無理に寄せない）。
6. 必ず有効なJSONのみを返してください。説明文は不要です。
7. oneLinerSummaryは「〜についてお話ししました」のような形式で、一覧カードの一行プレビューに使います。40文字以内で。
8. discussedCategoriesには、実際に話題に上がったカテゴリのIDを含めてください。有効値: memories, people, house, medical, funeral, money, work, digital, legal, trust, support。主テーマだけに固定せず、実際の話題に合わせて列挙してください。
9. keyPointsのdecisions, undecidedItemsは最大5個まで。importantStatementsは最大7個まで。該当がなければ空配列にしてください。
9.2. keyPoints.importantStatements には、質問項目に直接は入らなくても後から人物像の理解に役立つ内容を優先してください。「この人はどんな人だったのか」を家族が知る手がかりになるかを判断基準にしてください。
9.3. 各importantStatementにはcategoryとimportanceを付与してください。
  categoryの選び方：
    - hobbies: 趣味・好み・好き嫌い・お気に入り・食の好み
    - values: 価値観・大切にしていること・こだわり・信条・人生観
    - relationships: 家族・友人・ペット・人間関係にまつわる話
    - memories: 印象的な体験・若い頃の話・忘れられない思い出
    - concerns: 心配事・気になっていること・不安
    - other: 上記に当てはまらないが人物像の理解に役立つもの
  importanceの判断基準：
    - high: その人の人格や人生の核心に関わる内容（深い価値観、人生を変えた出来事、強い想い）
    - medium: 顕著な特徴や好み（日常の習慣、はっきりした好き嫌い、大切にしている関係）
    - low: 状況的・一時的な内容（その日の出来事、軽い感想、文脈なしでは意味が薄い発言）
9.4. keyPoints.importantStatements には、あいさつ、相づち、会話の進行、画面操作、アプリ設定、単なる短い返事を含めないでください。
9.5. keyPoints.decisions には、エンディングノートの内容として意味のある決定事項だけを入れてください。会話終了、また今度にする、次の画面へ進む、アプリ設定を変える、といった会話操作・画面操作・設定操作は含めないでください。
10. topicAdherenceの判断基準：
    - high: 会話のほぼ全体がエンディングノートに関連していた（自然な脱線含む）
    - medium: テーマ外の話題がいくつかあったが、メインはエンディングノートの内容だった
    - low: 会話の大部分がエンディングノートと無関係な話題だった
11. offTopicSummaryはテーマ外の話題があった場合のみ記述。なければ空文字列（""）にしてください。
12. noteEntries.answerは、ユーザー発話に含まれる事実のみで作成してください。アシスタントの提案・推測・一般論を事実として書かないでください。
13. noteEntries.sourceEvidenceには、ユーザー発話から3〜40文字程度を原文のまま引用してください（要約・改変しない）。短い返答（「はい」「あります」など）の場合は1〜2文字でも可。
14. ユーザーの返答が短くても、直前までの会話文脈（質問内容）を踏まえてquestionIdを判断して構いません。ただしanswerは必ずユーザーの発言内容に基づいてください。
15. 会話内容が legal（相続・遺言）、trust（信託・委任）、support（支援制度）のカテゴリに関連する場合、summaryの末尾に「※この記録は参考情報であり、法的効力はありません。正式な手続きには専門家にご相談ください。」と付記してください。
16. 質問リストの各項目には type が含まれます。type: "accumulative" の質問（思い出、大事な人、連絡先リストなど）は複数の回答が並立できます。この種の質問では、ユーザーが以前の回答と明らかに同一の項目について話していない限り、常に新しいnoteEntryとして追加してください。以前の回答を上書き・統合しないでください。

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
  "discussedCategories": ["この会話で実際に話題にしたカテゴリIDの配列"],
  "keyPoints": {
    "importantStatements": [
      {
        "text": "ユーザーが語った、人物像の理解に役立つ発言",
        "category": "hobbies | values | relationships | memories | concerns | other",
        "importance": "high | medium | low"
      }
    ],
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
9. discussedCategoriesには、実際に話題に上がったカテゴリのIDを含めてください。有効値: memories, people, house, medical, funeral, money, work, digital, legal, trust, support
10. keyPointsのdecisions, undecidedItemsは最大5個まで。importantStatementsは最大7個まで。該当がなければ空配列にしてください。
10.2. keyPoints.importantStatements には、質問項目に直接は入らなくても後から人物像の理解に役立つ内容を優先してください。「この人はどんな人だったのか」を家族が知る手がかりになるかを判断基準にしてください。
10.3. 各importantStatementにはcategoryとimportanceを付与してください。
  categoryの選び方：
    - hobbies: 趣味・好み・好き嫌い・お気に入り・食の好み
    - values: 価値観・大切にしていること・こだわり・信条・人生観
    - relationships: 家族・友人・ペット・人間関係にまつわる話
    - memories: 印象的な体験・若い頃の話・忘れられない思い出
    - concerns: 心配事・気になっていること・不安
    - other: 上記に当てはまらないが人物像の理解に役立つもの
  importanceの判断基準：
    - high: その人の人格や人生の核心に関わる内容（深い価値観、人生を変えた出来事、強い想い）
    - medium: 顕著な特徴や好み（日常の習慣、はっきりした好き嫌い、大切にしている関係）
    - low: 状況的・一時的な内容（その日の出来事、軽い感想、文脈なしでは意味が薄い発言）
10.4. keyPoints.importantStatements には、あいさつ、相づち、会話の進行、画面操作、アプリ設定、単なる短い返事を含めないでください。
10.5. keyPoints.decisions には、エンディングノートの内容として意味のある決定事項だけを入れてください。会話終了、また今度にする、次の画面へ進む、アプリ設定を変える、といった会話操作・画面操作・設定操作は含めないでください。
11. topicAdherenceの判断基準：
    - high: 会話のほぼ全体がエンディングノートに関連していた（自然な脱線含む）
    - medium: テーマ外の話題がいくつかあったが、メインはエンディングノートの内容だった
    - low: 会話の大部分がエンディングノートと無関係な話題だった
12. offTopicSummaryはテーマ外の話題があった場合のみ記述。なければ空文字列（""）にしてください。
13. noteEntries.answerは、ユーザー発話に含まれる事実のみで作成してください。アシスタントの提案・推測・一般論を事実として書かないでください。
14. noteEntries.sourceEvidenceには、ユーザー発話から3〜40文字程度を原文のまま引用してください（要約・改変しない）。短い返答（「はい」「あります」など）の場合は1〜2文字でも可。
15. ユーザーの返答が短くても、直前までの会話文脈（質問内容）を踏まえてquestionIdを判断して構いません。ただしanswerは必ずユーザーの発言内容に基づいてください。
16. 会話内容が legal（相続・遺言）、trust（信託・委任）、support（支援制度）のカテゴリに関連する場合、summaryの末尾に「※この記録は参考情報であり、法的効力はありません。正式な手続きには専門家にご相談ください。」と付記してください。
17. 質問リストの各項目には type が含まれます。type: "accumulative" の質問（思い出、大事な人、連絡先リストなど）は複数の回答が並立できます。この種の質問では、ユーザーが以前の回答と明らかに同一の項目について話していない限り、常に新しいnoteEntryとして追加してください。以前の回答を上書き・統合しないでください。

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

export function filterSubstantiveDecisions(decisions: string[]): string[] {
  const filtered: string[] = [];
  const seen = new Set<string>();

  for (const decision of decisions) {
    const normalized = normalizeForGrounding(decision);
    if (normalized.length === 0) continue;

    const isNonSubstantive = NON_SUBSTANTIVE_DECISION_PATTERNS.some((pattern) =>
      normalized.includes(normalizeForGrounding(pattern)),
    );
    if (isNonSubstantive) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    filtered.push(decision.trim());
  }

  return filtered;
}

export function filterMeaningfulImportantStatements(
  statements: InsightStatement[],
): InsightStatement[] {
  const filtered: InsightStatement[] = [];
  const seen = new Set<string>();

  for (const statement of statements) {
    const trimmed = statement.text.trim();
    const normalized = normalizeForGrounding(trimmed);
    if (normalized.length < 3) continue;

    const isNonSubstantive = NON_SUBSTANTIVE_IMPORTANT_STATEMENT_PATTERNS.some(
      (pattern) => normalized.includes(normalizeForGrounding(pattern)),
    );
    if (isNonSubstantive) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    filtered.push({ ...statement, text: trimmed });
  }

  return filtered;
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

export function shouldFallbackToUngroundedEntries(
  category: QuestionCategory | null,
  modelNoteEntries: NoteEntry[],
  groundedNoteEntries: NoteEntry[],
): boolean {
  void category;
  void modelNoteEntries;
  void groundedNoteEntries;
  return false;
}

export function selectTranscriptForAnalysis(
  sanitizedTranscript: Array<{ role: "user" | "assistant"; text: string }>,
): Array<{ role: "user" | "assistant"; text: string }> {
  const hasUserUtterance = sanitizedTranscript.some(
    (entry) => entry.role === "user" && entry.text.trim().length > 0,
  );
  if (hasUserUtterance) {
    return sanitizedTranscript;
  }
  return [{ role: "user", text: "（ユーザー発話なし）" }];
}

const VALID_CATEGORY_SET = new Set<string>(DISCUSSED_CATEGORY_ENUM);

function questionIdToCategory(questionId: string): QuestionCategory | null {
  const idx = questionId.lastIndexOf("-");
  if (idx <= 0) {
    return null;
  }
  const maybeCategory = questionId.slice(0, idx);
  if (VALID_CATEGORY_SET.has(maybeCategory)) {
    return maybeCategory as QuestionCategory;
  }
  return null;
}

export function normalizeDiscussedCategories(
  categories: string[],
): QuestionCategory[] {
  const normalized: QuestionCategory[] = [];
  const seen = new Set<QuestionCategory>();

  for (const raw of categories) {
    const lower = raw.trim().toLowerCase();
    const direct = VALID_CATEGORY_SET.has(lower)
      ? (lower as QuestionCategory)
      : null;
    const mapped = direct ?? DISCUSSED_CATEGORY_ALIAS_MAP[lower] ?? null;
    if (mapped === null || seen.has(mapped)) {
      continue;
    }
    seen.add(mapped);
    normalized.push(mapped);
  }

  return normalized;
}

function inferDiscussedCategoriesFromNoteEntries(
  noteEntries: NoteEntry[],
): QuestionCategory[] {
  const inferred: QuestionCategory[] = [];
  const seen = new Set<QuestionCategory>();

  for (const entry of noteEntries) {
    const category = questionIdToCategory(entry.questionId);
    if (category === null || seen.has(category)) {
      continue;
    }
    seen.add(category);
    inferred.push(category);
  }

  return inferred;
}

function validateStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== "string") return false;
  }
  return true;
}

const VALID_INSIGHT_CATEGORIES = new Set<string>([
  "hobbies",
  "values",
  "relationships",
  "memories",
  "concerns",
  "other",
]);

const VALID_INSIGHT_IMPORTANCES = new Set<string>(["high", "medium", "low"]);

function validateInsightStatementArray(
  value: unknown,
): value is InsightStatement[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== "object" || item === null) return false;
    const obj = item as Record<string, unknown>;
    if (typeof obj["text"] !== "string") return false;
    if (
      typeof obj["category"] !== "string" ||
      !VALID_INSIGHT_CATEGORIES.has(obj["category"])
    )
      return false;
    if (
      typeof obj["importance"] !== "string" ||
      !VALID_INSIGHT_IMPORTANCES.has(obj["importance"])
    )
      return false;
  }
  return true;
}

function validateKeyPoints(value: unknown): value is KeyPoints {
  if (typeof value !== "object" || value === null) return false;
  const kp = value as Record<string, unknown>;
  if (!validateInsightStatementArray(kp["importantStatements"])) return false;
  if (!validateStringArray(kp["decisions"])) return false;
  if (!validateStringArray(kp["undecidedItems"])) return false;
  return true;
}

function validateResponse(data: unknown): data is SummarizeResponse {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj["summary"] !== "string") return false;
  if (typeof obj["oneLinerSummary"] !== "string") return false;

  if (!validateStringArray(obj["coveredQuestionIds"])) return false;

  // Validate discussedCategories shape (normalization happens later)
  if (!Array.isArray(obj["discussedCategories"])) return false;
  for (const cat of obj["discussedCategories"]) {
    if (typeof cat !== "string") return false;
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

  if (
    "noteUpdateProposals" in obj &&
    obj["noteUpdateProposals"] !== undefined
  ) {
    return false;
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

function normalizeProposalText(value: string): string {
  return value
    .trim()
    .replace(/[\s\u3000]+/g, " ")
    .toLowerCase();
}

export function buildNoteUpdateProposals(
  noteEntries: NoteEntry[],
  previousNoteEntries?: PreviousNoteEntry[],
): NoteUpdateProposal[] {
  if (noteEntries.length === 0) {
    return [];
  }

  const previousByQuestion = new Map<string, PreviousNoteEntry[]>();
  for (const entry of previousNoteEntries ?? []) {
    const existing = previousByQuestion.get(entry.questionId);
    if (existing !== undefined) {
      existing.push(entry);
    } else {
      previousByQuestion.set(entry.questionId, [entry]);
    }
  }

  const proposals: NoteUpdateProposal[] = [];
  const seenSingleQuestionIds = new Set<string>();
  const seenAccumulativeKeys = new Set<string>();

  for (const entry of noteEntries) {
    const question = getQuestionById(entry.questionId);
    const category =
      question?.category ?? questionIdToCategory(entry.questionId);
    if (question === undefined || category === null) {
      continue;
    }

    const previousEntriesForQuestion =
      previousByQuestion.get(entry.questionId) ?? [];
    const normalizedAnswer = normalizeProposalText(entry.answer);

    if (question.questionType === "single") {
      if (seenSingleQuestionIds.has(entry.questionId)) {
        continue;
      }
      seenSingleQuestionIds.add(entry.questionId);

      const latestPrevious =
        previousEntriesForQuestion[previousEntriesForQuestion.length - 1];
      if (
        latestPrevious !== undefined &&
        normalizeProposalText(latestPrevious.answer) === normalizedAnswer
      ) {
        continue;
      }

      proposals.push({
        questionId: entry.questionId,
        questionTitle: question.title,
        category,
        questionType: question.questionType,
        proposalType: latestPrevious === undefined ? "add" : "update",
        previousAnswer: latestPrevious?.answer ?? null,
        proposedAnswer: entry.answer.trim(),
        sourceEvidence: entry.sourceEvidence.trim(),
      });
      continue;
    }

    const duplicateExists = previousEntriesForQuestion.some(
      (previousEntry) =>
        normalizeProposalText(previousEntry.answer) === normalizedAnswer,
    );
    if (duplicateExists) {
      continue;
    }

    const dedupeKey = `${entry.questionId}:${normalizedAnswer}`;
    if (seenAccumulativeKeys.has(dedupeKey)) {
      continue;
    }
    seenAccumulativeKeys.add(dedupeKey);

    proposals.push({
      questionId: entry.questionId,
      questionTitle: question.title,
      category,
      questionType: question.questionType,
      proposalType: "add",
      previousAnswer: null,
      proposedAnswer: entry.answer.trim(),
      sourceEvidence: entry.sourceEvidence.trim(),
    });
  }

  const singleProposals = proposals.filter(
    (proposal) => proposal.questionType === "single",
  );
  const accumulativeProposals = proposals.filter(
    (proposal) => proposal.questionType === "accumulative",
  );

  return [...singleProposals, ...accumulativeProposals].slice(0, 2);
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
    selectTranscriptForAnalysis(sanitizedTranscript);

  let systemPrompt: string;
  if (request.category !== null) {
    const allQuestionsJson = getAllQuestionsListJson();
    systemPrompt = buildSystemPrompt(
      request.category,
      allQuestionsJson,
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
    model: config.openaiModels.summarizer,
    temperature: config.openaiModels.summarizerTemperature,
    transcriptLength: request.transcript.length,
    userTranscriptLength: userOnlyTranscript.length,
    truncatedChars: userMessage.length,
  });

  const completion = await openai.chat.completions.create({
    model: config.openaiModels.summarizer,
    temperature: config.openaiModels.summarizerTemperature,
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
  const usedUngroundedFallback = shouldFallbackToUngroundedEntries(
    request.category,
    parsed.noteEntries,
    groundedNoteEntries,
  );
  const finalizedNoteEntries = usedUngroundedFallback
    ? parsed.noteEntries.map((entry) => ({
        ...entry,
        sourceEvidence: entry.sourceEvidence.trim(),
      }))
    : groundedNoteEntries;

  if (usedUngroundedFallback) {
    logger.warn(
      "Grounding removed all note entries in focused mode; falling back to model output",
      {
        category: request.category,
        modelEntries: parsed.noteEntries.length,
      },
    );
  } else if (
    request.category !== null &&
    parsed.noteEntries.length > 0 &&
    groundedNoteEntries.length === 0
  ) {
    logger.warn("Discarded ungrounded note entries in focused mode", {
      category: request.category,
      modelEntries: parsed.noteEntries.length,
    });
  }

  const groundedQuestionIdSet = new Set(
    finalizedNoteEntries.map((entry) => entry.questionId),
  );
  const coveredQuestionIds = parsed.coveredQuestionIds.filter((questionId) =>
    groundedQuestionIdSet.has(questionId),
  );
  const finalizedImportantStatements = filterMeaningfulImportantStatements(
    parsed.keyPoints.importantStatements,
  );
  const normalizedDiscussedCategories = normalizeDiscussedCategories(
    parsed.discussedCategories,
  );
  if (
    parsed.discussedCategories.length > 0 &&
    normalizedDiscussedCategories.length < parsed.discussedCategories.length
  ) {
    logger.warn("Dropped/normalized unsupported discussed categories", {
      rawCategories: parsed.discussedCategories,
      normalizedCategories: normalizedDiscussedCategories,
    });
  }
  const inferredDiscussedCategories =
    inferDiscussedCategoriesFromNoteEntries(finalizedNoteEntries);
  const finalizedDiscussedCategories =
    normalizedDiscussedCategories.length > 0
      ? normalizedDiscussedCategories
      : inferredDiscussedCategories.length > 0
        ? inferredDiscussedCategories
        : request.category !== null
          ? [request.category]
          : [];

  const finalized: SummarizeResponse = {
    ...parsed,
    discussedCategories: finalizedDiscussedCategories,
    noteEntries: finalizedNoteEntries,
    noteUpdateProposals: buildNoteUpdateProposals(
      finalizedNoteEntries,
      request.previousNoteEntries,
    ),
    coveredQuestionIds,
    keyPoints: {
      ...parsed.keyPoints,
      importantStatements: finalizedImportantStatements,
      decisions: filterSubstantiveDecisions(parsed.keyPoints.decisions),
    },
  };

  logger.info("Summarization complete", {
    category: request.category,
    coveredQuestions: finalized.coveredQuestionIds.length,
    noteEntries: finalized.noteEntries.length,
    importantStatements: finalized.keyPoints.importantStatements.length,
    topicAdherence: finalized.topicAdherence,
    offTopicSummary: finalized.offTopicSummary,
  });

  return finalized;
}
