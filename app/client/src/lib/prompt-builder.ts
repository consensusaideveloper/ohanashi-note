// Builds dynamic system prompts for the AI assistant
// based on the selected character and conversation category.

import { getCharacterById } from "./characters";
import {
  getQuestionsByCategory,
  QUESTION_CATEGORIES,
  buildAllQuestionsCompact,
} from "./questions";

import type { CharacterId, QuestionCategory } from "../types/conversation";

/** Context for AI-guided mode (all categories). */
export interface GuidedPastContext {
  allCoveredQuestionIds: string[];
  recentSummaries: Array<{ category: string; summary: string }>;
}

/** Context from past conversations in the same category. */
export interface PastConversationContext {
  coveredQuestionIds: string[];
  summaries: string[];
  /** 他カテゴリの最近のサマリー（カテゴリ横断コンテキスト） */
  crossCategorySummaries?: Array<{ category: string; summary: string }>;
}

// Category-specific opening instructions
const CATEGORY_INSTRUCTIONS: Record<QuestionCategory, string> = {
  memories: `【今日のテーマ：思い出】
今日は楽しい思い出や、家族への想いについて聞かせてください。
リラックスして、思い出すままに話してもらえれば大丈夫です。`,

  people: `【今日のテーマ：大事な人・ペット】
今日は大切な人や、ペットのことについて聞かせてください。
一人ひとりへの想いを、ゆっくり話してもらえれば大丈夫です。`,

  house: `【今日のテーマ：生活】
今日は家のことや大切にしているものについて聞かせてください。
日々の暮らしのこと、気軽に話してもらえれば大丈夫です。`,

  medical: `【今日のテーマ：医療・介護】
今日は医療や介護のこと、いざという時の備えについて聞かせてください。
大事なことなので、無理のない範囲で。`,

  funeral: `【今日のテーマ：葬儀・供養】
今日はお葬式やお墓のことなど、供養に関する希望を聞かせてください。
デリケートな話題なので、ゆっくりで大丈夫です。`,

  money: `【今日のテーマ：お金・資産】
今日は大切な資産の情報を整理するお手伝いをします。
秘密は守るので、安心してください。

印鑑の話題では、「実印と銀行印の保管場所」「届出先の役所」「通帳と印鑑の対応関係」を自然に聞いてください。
印鑑の写真を撮る必要はないことを伝え、「場所」と「どの銀行にどの印鑑か」の情報だけで十分と説明してください。`,

  work: `【今日のテーマ：仕事・事業】
今日はお仕事や事業に関することをお聞きします。
現在のお仕事でも、以前のお仕事でも、覚えている範囲で大丈夫です。

自営業やお店をお持ちの方には、取引先や許認可のことも聞いてください。
退職された方には、退職金や企業年金、最後に勤めた会社の情報を中心に聞いてください。
事業用の借入や連帯保証については、相続に影響するため特に丁寧に確認してください。`,

  digital: `【今日のテーマ：デジタル】
今日はスマホやSNS、デジタルの資産について聞かせてください。
いろいろなサービスがありますよね。わかる範囲で大丈夫です。`,

  legal: `【今日のテーマ：相続・遺言】
今日は相続や遺言書のことを整理するお手伝いをします。
法律の話は難しく感じるかもしれませんが、気軽にお話しください。
具体的な手続きは専門家（行政書士・司法書士・弁護士等）にご相談ください。

法定相続人の確認や遺言書の有無、生前贈与の意向などを自然に聞いてください。
不動産の相続登記義務化（令和6年4月施行）についても、さりげなく触れてください。`,

  trust: `【今日のテーマ：信託・委任】
今日は家族信託や後見、亡くなった後の手続きの委任についてお聞きします。
将来の備えとして大切なことですが、無理のない範囲でお話しください。
具体的な手続きは専門家（行政書士・司法書士・弁護士等）にご相談ください。

家族信託や任意後見の制度をご存じかどうか、まずやさしく確認してください。
空き家対策やペット信託、死後事務委任など、具体的な備えについても自然に聞いてください。`,

  support: `【今日のテーマ：支援制度】
今日は利用できる公的支援や制度についてお話ししましょう。
知らないと損をしてしまう制度もあります。気軽に聞いてくださいね。
制度の詳細はお住まいの市区町村窓口や社会福祉協議会にご確認ください。

成年後見制度、生活保護、葬祭費の補助金、遺族年金など、利用できそうな制度を自然に紹介してください。
リバースモーゲージやリースバックなど、住宅を活用した生活資金の選択肢も触れてください。`,
};

// Security reminder appended to sensitive categories
const SECURITY_REMINDER = `
【セキュリティ上の重要な注意】
このカテゴリは機密性の高い情報を扱います。
- パスワード、暗証番号、カード番号は絶対に聞かないでください
- 「銀行名」「証券会社名」「サービス名」レベルの情報のみ聞いてください
- ユーザーが具体的な番号を言いそうになったら、やんわり止めてください
- 印鑑の画像や写真の送信・保存は行いません。保管場所と使い分けの情報のみ記録します`;

// Tool awareness prompt — tells the AI about available function calling tools
const TOOL_AWARENESS_PROMPT = `
【過去の会話の検索機能について】
あなたには2つのツールが利用可能です：
1. search_past_conversations：過去の会話内容をキーワードで検索できます
   - ユーザーが「前に話した○○のこと」「以前お話しした件」のように過去の会話に言及した場合に使ってください
   - 検索結果を参考に、自然な会話で過去の内容を振り返ってあげてください
2. get_note_entries：カテゴリごとに記録済みのエンディングノート内容を取得できます
   - ユーザーが「今まで何を記録した？」「記録を確認したい」と言った場合に使ってください

注意：
- ツールを使う際は、ユーザーに「少しお待ちください」などの声かけは不要です（処理は一瞬で完了します）
- 検索結果がない場合は「まだその話題についてはお話ししていないようですね」と自然に伝えてください
- ツールの存在をユーザーに説明する必要はありません。自然に会話の中で活用してください`;

// Topic scope reminder for category-focused mode
const TOPIC_SCOPE_FOCUSED = `
【今日の会話の範囲について】
今日は上記のカテゴリに集中して会話を進めてください。
ただし、以下のような話題はこのカテゴリに直接関係がなくてもノートに記録する価値があるので、適度に受け止めてください：
- 質問への回答から自然に広がったエピソード
- 家族や大切な人への想い
- 自分の価値観や人生の教訓

一方、以下のような話題が長く続いた場合は、【話題の守り方】のルールに従ってテーマに戻してください：
- エンディングノートと無関係な相談事や雑談
- 今日のテーマと関係のない一般的な質問`;

// Topic scope reminder for AI-guided (cross-category) mode
const TOPIC_SCOPE_GUIDED = `
【会話の範囲について】
エンディングノートに記録する内容を中心に会話を進めてください。
すべてのカテゴリ（思い出、大事な人、生活、医療、葬儀、お金、仕事・事業、デジタル、相続・遺言、信託・委任、支援制度）が対象です。
人生の振り返りや価値観に関する話題は、どのカテゴリにも関連する可能性があるので柔軟に受け止めてください。

ただし、エンディングノートとまったく関係のない話題（一般的な相談、時事問題への議論など）が長く続いた場合は、
【話題の守り方】のルールに従って、いずれかのテーマに戻してください。

なお、相続・遺言、信託・委任、支援制度のテーマでは法的アドバイスや制度の詳細な申請方法を提供しないでください。
「具体的な手続きは専門家にご相談ください」と案内してください。`;

// Categories that require extra security reminders
const SENSITIVE_CATEGORIES: ReadonlySet<QuestionCategory> = new Set([
  "money",
  "work",
  "digital",
  "legal",
  "trust",
]);

/**
 * Build a question list string for inclusion in the prompt.
 * If coveredIds is provided, split into unanswered (priority) and answered sections.
 */
function buildQuestionList(
  category: QuestionCategory,
  coveredIds?: ReadonlySet<string>,
): string {
  const questions = getQuestionsByCategory(category);

  if (coveredIds === undefined || coveredIds.size === 0) {
    return questions.map((q) => `- ${q.title}：${q.question}`).join("\n");
  }

  const unanswered = questions.filter((q) => !coveredIds.has(q.id));
  const answered = questions.filter((q) => coveredIds.has(q.id));

  const parts: string[] = [];

  if (unanswered.length > 0) {
    parts.push(
      "【まだ聞いていない質問（優先して聞いてください）】",
      ...unanswered.map((q) => `- ${q.title}：${q.question}`),
    );
  }

  if (answered.length > 0) {
    parts.push(
      "",
      "【前回までに回答済みの質問（更新したい場合のみ聞いてください）】",
      ...answered.map((q) => `- ${q.title}（回答済み）`),
    );
  }

  if (unanswered.length === 0) {
    parts.push(
      "",
      "すべての質問に回答済みです。内容を更新したいものがないか確認してください。",
    );
  }

  return parts.join("\n");
}

/**
 * Find the label for a given category.
 */
function getCategoryLabel(category: QuestionCategory): string {
  const info = QUESTION_CATEGORIES.find((c) => c.id === category);
  return info?.label ?? category;
}

/**
 * Build a complete session system prompt for the given character and category.
 * Combines the character personality, category-specific instructions, question list,
 * past conversation context, and security reminders (for sensitive categories).
 */
export function buildSessionPrompt(
  characterId: CharacterId,
  category: QuestionCategory,
  pastContext?: PastConversationContext,
  userName?: string,
): string {
  const character = getCharacterById(characterId);
  const categoryInstruction = CATEGORY_INSTRUCTIONS[category];
  const coveredIds =
    pastContext !== undefined && pastContext.coveredQuestionIds.length > 0
      ? new Set(pastContext.coveredQuestionIds)
      : undefined;
  const questionList = buildQuestionList(category, coveredIds);
  const categoryLabel = getCategoryLabel(category);

  let prompt = character.personality;

  // User name handling
  if (userName !== undefined && userName !== "") {
    prompt += `\n\nユーザーの名前は「${userName}」さんです。会話の中で自然に名前で呼びかけてください。
もしユーザーが「〇〇と呼んで」など別の名前を希望した場合は、その名前で呼びかけてください。`;
  } else {
    prompt += `\n\n【初回の挨拶について】
まだユーザーのお名前を知りません。会話の最初に自己紹介をしてから、「なんとお呼びすればいいですか？」と自然に名前を聞いてください。
名前を教えてもらったら、その後は名前で呼びかけてください。`;
  }

  prompt += `\n\n${categoryInstruction}`;

  // Add past conversation summaries if available
  if (pastContext !== undefined && pastContext.summaries.length > 0) {
    prompt += `\n\n【これまでの会話の振り返り】
以前のセッションで以下の内容をお話しいただいています：
${pastContext.summaries.map((s) => `- ${s}`).join("\n")}
この内容を踏まえて、まだ聞いていない話題を中心に会話を進めてください。`;
  }

  // Add cross-category summaries if available
  if (
    pastContext?.crossCategorySummaries !== undefined &&
    pastContext.crossCategorySummaries.length > 0
  ) {
    prompt += `\n\n【他のテーマでのお話】
以前、他のテーマでも以下のようなお話をされています：
${pastContext.crossCategorySummaries.map((s) => `- ${s.category}：${s.summary}`).join("\n")}
この情報を踏まえて自然に会話してください。ただし別テーマの内容を無理に持ち出す必要はありません。`;
  }

  prompt += `\n\n以下の話題を、自然な会話の中で聞いてください（すべて聞く必要はありません）：
${questionList}`;

  if (SENSITIVE_CATEGORIES.has(category)) {
    prompt += `\n${SECURITY_REMINDER}`;
  }

  prompt += TOPIC_SCOPE_FOCUSED;

  prompt += `\n\n今日のカテゴリは「${categoryLabel}」です。このテーマに沿って会話を進めてください。`;

  prompt += TOOL_AWARENESS_PROMPT;

  return prompt;
}

/**
 * Build a system prompt for AI-guided mode where the AI freely navigates
 * across all categories based on progress and natural conversation flow.
 */
export function buildGuidedSessionPrompt(
  characterId: CharacterId,
  guidedContext: GuidedPastContext,
  userName?: string,
): string {
  const character = getCharacterById(characterId);
  const coveredIds = new Set(guidedContext.allCoveredQuestionIds);
  const compactQuestions = buildAllQuestionsCompact(coveredIds);

  let prompt = character.personality;

  // User name handling (same logic as focused mode)
  if (userName !== undefined && userName !== "") {
    prompt += `\n\nユーザーの名前は「${userName}」さんです。会話の中で自然に名前で呼びかけてください。
もしユーザーが「〇〇と呼んで」など別の名前を希望した場合は、その名前で呼びかけてください。`;
  } else {
    prompt += `\n\n【初回の挨拶について】
まだユーザーのお名前を知りません。会話の最初に自己紹介をしてから、「なんとお呼びすればいいですか？」と自然に名前を聞いてください。
名前を教えてもらったら、その後は名前で呼びかけてください。`;
  }

  // Topic guidance instructions
  prompt += `\n\n【会話の進め方】
あなたはエンディングノートの全テーマを横断して会話をリードします。
会話の冒頭で、ユーザーにこれから話すテーマを2〜3個提案してください。
例：「今日は、思い出のことか、大事な人のことか、どちらからお話ししましょうか？」
ユーザーが選んだテーマから始め、自然な流れで他のテーマにも広げてください。
一つのテーマに長くこだわりすぎず、区切りの良いところで「他のテーマも少し聞いてもいいですか？」と提案してください。
ただし、ユーザーが話したい話題があればそちらを優先してください。`;

  // Past conversation context
  if (guidedContext.recentSummaries.length > 0) {
    prompt += `\n\n【これまでの会話の振り返り】
以前のセッションで以下の内容をお話しいただいています：
${guidedContext.recentSummaries.map((s) => `- ${s.category}：${s.summary}`).join("\n")}
この内容を踏まえて、まだ聞いていない話題を中心に会話を進めてください。`;
  }

  // All questions with progress
  prompt += `\n\n【エンディングノートの全項目と進捗】
以下はカテゴリごとの質問リストです。未回答の項目のIDとタイトルを表示しています。
これらを参考に、自然な会話の中で情報を聞き出してください（すべて聞く必要はありません）。
${compactQuestions}`;

  // Security reminder (always included — any topic may come up)
  prompt += `\n
【セキュリティ上の重要な注意】
お金・資産やデジタル関連の話題になった場合：
- パスワード、暗証番号、カード番号は絶対に聞かないでください
- 「銀行名」「証券会社名」「サービス名」レベルの情報のみ聞いてください
- ユーザーが具体的な番号を言いそうになったら、やんわり止めてください
- 印鑑の画像や写真の送信・保存は行いません。保管場所と使い分けの情報のみ記録します`;

  prompt += TOPIC_SCOPE_GUIDED;

  prompt += TOOL_AWARENESS_PROMPT;

  return prompt;
}
