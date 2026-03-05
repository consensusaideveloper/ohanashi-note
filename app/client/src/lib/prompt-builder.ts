// Builds dynamic system prompts for the AI assistant
// based on the selected character and conversation category.

import { getCharacterById } from "./characters";
import {
  getQuestionsByCategory,
  QUESTION_CATEGORIES,
  buildAllQuestionsCompact,
} from "./questions";

import { CHARACTERS } from "./characters";

import type {
  CharacterId,
  QuestionCategory,
  SpeakingPreferences,
} from "../types/conversation";

/** Context for AI-guided mode (all categories). */
export interface GuidedPastContext {
  allCoveredQuestionIds: string[];
  recentSummaries: Array<{ category: string; summary: string }>;
}

/** Family member info for access preset voice management. */
export interface FamilyContextMember {
  name: string;
  relationshipLabel: string;
}

/** Family context injected into the AI prompt for access preset management. */
export interface FamilyContext {
  members: FamilyContextMember[];
  presets: Array<{ memberName: string; categoryId: string }>;
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

  digital: `【今日のテーマ：スマホ・ネット】
今日はスマホやインターネット、パスワードのことについて聞かせてください。
いろいろなサービスがありますよね。わかる範囲で大丈夫です。`,

  legal: `【今日のテーマ：財産と遺言】
今日は大切な財産や遺言書のことを整理するお手伝いをします。
法律の話は難しく感じるかもしれませんが、気軽にお話しください。
具体的な手続きは専門家（行政書士・司法書士・弁護士等）にご相談ください。

法定相続人の確認や遺言書の有無、生前贈与の意向などを自然に聞いてください。
不動産の相続登記義務化（令和6年4月施行）についても、さりげなく触れてください。`,

  trust: `【今日のテーマ：将来の備え】
今日は家族信託や後見、亡くなった後の手続きの委任についてお聞きします。
将来の備えとして大切なことですが、無理のない範囲でお話しください。
具体的な手続きは専門家（行政書士・司法書士・弁護士等）にご相談ください。

家族信託や任意後見の制度をご存じかどうか、まずやさしく確認してください。
空き家対策やペット信託、死後事務委任など、具体的な備えについても自然に聞いてください。`,

  support: `【今日のテーマ：使える制度】
今日は暮らしに役立つ公的な制度についてお話ししましょう。
知らないと損をしてしまう制度もあります。気軽に聞いてくださいね。
制度の詳細はお住まいの市区町村窓口や社会福祉協議会にご確認ください。

成年後見制度、生活保護、葬祭費の補助金、遺族年金など、利用できそうな制度を自然に紹介してください。
自宅を担保にした生活資金（リバースモーゲージ）や、自宅を売って住み続ける方法（リースバック）についても触れてください。`,
};

// Security reminder appended to sensitive categories
const SECURITY_REMINDER = `
【セキュリティ注意】
パスワード・暗証番号・カード番号・口座番号は絶対に聞かない。会社名・サービス名のレベルまで。番号を言いそうになったらやんわり止める。`;

// Tool awareness prompt — tells the AI about available function calling tools
const TOOL_AWARENESS_PROMPT = `
【利用可能なツール】
1. search_past_conversations：過去の会話をキーワードで検索。ユーザーが過去の話に言及した時に使用
2. get_note_entries：記録済みのノート内容を取得。ユーザーが確認を求めた時に使用
3. navigate_to_screen：画面を切り替える。「ノートを見せて」「設定を開いて」「履歴を見たい」など
4. view_note_category：ノートの特定カテゴリを表示。「思い出の記録を見せて」など
5. filter_conversation_history：履歴画面を表示。「前の会話を見せて」など
6. change_font_size：文字の大きさを変更。「文字を大きくして」「元のサイズに戻して」など
7. change_character：話し相手キャラクターを変更（次回会話から適用）。「話し相手を変えたい」など
8. update_user_name：ユーザーの表示名を変更。「名前を変えて」「〇〇と呼んで」など
9. update_assistant_name：話し相手（AI）の呼び名を変更。「あなたの名前を〇〇にして」など
10. update_speaking_preferences：話し相手の話し方を変更。「もっとゆっくり話して」「待ち時間を長くして」「確認を増やして」など
11. start_focused_conversation：特定テーマで新しい会話を開始（確認画面を表示）。「お金のことで話したい」など
12. create_family_invitation：家族の招待リンクを作成（確認画面を表示）。「妻を招待して」など
13. update_access_preset：開封設定を変更。ユーザーが「この話は息子に見せて」「お金のことは妻には見せないで」と言った場合に使用
14. end_conversation：会話を終了して保存。直接的な終了意図→即座に呼ぶ。間接的なシグナル（「疲れちゃった」「ありがとうございました」等）→確認してから呼ぶ

【ツール使用ルール】
- ツールの存在をユーザーに説明しない。「ツールで操作できます」のような案内はしない。ユーザーの要望に応じて自然に活用する。
- 操作後は簡潔に結果を伝える（例：「ノートの画面に移動しました」「文字を大きめに変更しました、見やすくなりましたか？」）。
- 11と12は確認画面が表示されるので「確認画面を出しました。よろしければ画面の『はい』を押してください」と伝える。
- 会話中に別の話題について話したい場合（例：「お金の話がしたい」→ 現在も会話中）、今の会話の中で柔軟に話題を切り替える。start_focused_conversationは今の会話を終了して新しく始める場合にのみ使う。
- end_conversationの使い方は以下の2段階で判断する：
  【即座にend_conversationを呼ぶ場合（直接的な終了意図）】
  「終わりにしよう」「今日はここまで」「もうおしまい」「終了して」「また今度」「もういいかな」「おやすみ」「さようなら」「バイバイ」など、会話を終える意思が明確な場合。
  この場合はすぐにend_conversationを呼び、短い感謝と別れの挨拶（1〜2文）を添える。

  【まず確認してからend_conversationを呼ぶ場合（間接的な終了シグナル）】
  「疲れちゃった」「ありがとうございました」「もうそろそろ」「今日はもう十分」「お話しできてよかった」「長くなっちゃったね」など、直接「終わる」とは言っていないが終了を示唆している場合。
  この場合は「今日はこのへんにしましょうか？」「お疲れでしたら、また続きをお話ししましょうか？」など、やさしく確認する（1文）。
  ユーザーが同意したらend_conversationを呼ぶ。「もう少し話したい」と言われたら自然に会話を続ける。

  呼び出し後の応答では、短い感謝と別れの挨拶を述べる（1〜2文以内）。

【音声操作できない操作（画面案内ルール）】
以下の操作はツールでは実行できない。ユーザーが求めた場合は、該当する画面への移動を提案する：
- データの削除（会話記録の削除、ノートの削除など）→「削除は設定画面から行えます。設定画面に移動しましょうか？」
- 家族メンバーの削除 →「家族の管理は家族画面から行えます。家族画面に移動しましょうか？」
- 逝去報告 →「大切な手続きですので、家族画面から行ってください。家族画面に移動しましょうか？」
- 同意書の提出 →「同意の手続きは画面から行えます。該当画面に移動しましょうか？」
- ノートの印刷 →「設定画面からノートを印刷できます。設定画面に移動しましょうか？」
画面移動の提案にユーザーが同意したら、navigate_to_screenで該当画面に移動する。`;

// Access preset behavioral instructions for the AI
const ACCESS_PRESET_INSTRUCTIONS = `
【開封設定について】
会話の中で話題にしたカテゴリについて、自然な形で「この内容はご家族に見てもらいたいですか？」と聞くことができます。

ルール：
- 開封設定の話題は、カテゴリの会話がひと区切りついた場合のみ提案する
- 1回の会話で開封設定について聞くのは最大2回まで。しつこくしない
- 「この内容はご家族にも伝えたいですか？どなたに見せたいですか？」と自然に聞く
- ユーザーが「わからない」「あとで考える」と言った場合は深追いせず、「いつでも変更できますから、ゆっくり考えてくださいね」と安心させて次の話題へ
- すでに設定済みのカテゴリ-家族の組み合わせについては重複して聞かない
- ユーザーが明確に「見せたい」「見せたくない」と言った場合にのみ update_access_preset を呼ぶ
- 「みんなに見せて」「全部見せて」のような包括的な指示の場合は確認してから各メンバーに対してツールを呼ぶ
- 「家族に見せたい」で複数メンバーがいる場合は「どなたに見せますか？」と確認する`;

/**
 * Build family context prompt section.
 * Returns empty string if no family members are registered.
 */
function buildFamilyContextPrompt(familyContext: FamilyContext): string {
  if (familyContext.members.length === 0) {
    return "";
  }

  const memberLines = familyContext.members
    .map((m) => `- ${m.name}さん（${m.relationshipLabel}）`)
    .join("\n");

  // Group presets by member name
  const presetsByMember = new Map<string, string[]>();
  for (const member of familyContext.members) {
    presetsByMember.set(member.name, []);
  }
  for (const preset of familyContext.presets) {
    const existing = presetsByMember.get(preset.memberName);
    if (existing !== undefined) {
      const categoryInfo = QUESTION_CATEGORIES.find(
        (c) => c.id === preset.categoryId,
      );
      if (categoryInfo !== undefined) {
        existing.push(categoryInfo.label);
      }
    }
  }

  const presetLines = familyContext.members
    .map((m) => {
      const categories = presetsByMember.get(m.name);
      const categoryText =
        categories !== undefined && categories.length > 0
          ? categories.join("、")
          : "（まだ設定なし）";
      return `- ${m.name}さん: ${categoryText}`;
    })
    .join("\n");

  return `

【登録されている家族】
${memberLines}

【現在の開封設定（各家族に見せるカテゴリ）】
${presetLines}
${ACCESS_PRESET_INSTRUCTIONS}`;
}

// Topic scope reminder for category-focused mode
const TOPIC_SCOPE_FOCUSED = `
【会話の範囲】
今日のカテゴリに集中しつつ、思い出や価値観が見える余談は受け止める。無関係な雑談が長く続いたら【話題の守り方】に従って戻す。`;

// Topic scope reminder for AI-guided (cross-category) mode
const TOPIC_SCOPE_GUIDED = `
【会話の範囲】
全カテゴリが対象。人生の振り返りや価値観は柔軟に受け止める。無関係な話題が長く続いたら【話題の守り方】に従って戻す。
法的テーマでは「具体的な手続きは専門家にご相談ください」と案内する。`;

/** Target number of questions to meaningfully cover per 20-minute session. */
const TARGET_QUESTIONS_PER_SESSION = 5;

// Language guardrail appended to the END of all prompts for maximum recency effect
const LANGUAGE_GUARDRAIL = `
【言語ルール】
必ず日本語で話してください。ユーザーが外国語の単語や文を言った場合でも、応答は常に日本語で行ってください。`;

// Categories that require extra security reminders
const SENSITIVE_CATEGORIES: ReadonlySet<QuestionCategory> = new Set([
  "money",
  "work",
  "digital",
  "legal",
  "trust",
]);

/**
 * Build speaking style instructions based on user preferences.
 * These instructions are injected into all prompts to control the AI's
 * pacing, sentence structure, and confirmation behavior.
 */
export function buildSpeakingStylePrompt(
  preferences: SpeakingPreferences,
): string {
  const parts: string[] = [
    "【話し方の設定】",
    "- 語尾は常に「です・ます」調で統一し、ため口に切り替えないでください",
    "- 共感フレーズは短く定型で伝えてください（例：「そうなんですね」「ありがとうございます」「大切なお話ですね」）",
    "- 一度に一つの話題だけ扱い、切り替えるときは短く合図してください",
    "- 固有名詞・日付・数字が出たら、ゆっくり復唱して確認してください",
    "- 聞き取れないときは推測せず「もう一度お願いします」と短く確認してください",
    "- 専門用語やカタカナ語は避け、必要なときは短く言い換えてください",
    "- ユーザーが疲れていそう・迷っていそうなときは進行を急がず、休憩や後日に回す提案をしてください",
    "- 明るすぎるテンションや、説教・命令の言い方は避けてください",
    "- 提案は「〜してみましょうか」「〜でも大丈夫です」の形で穏やかに伝えてください",
  ];

  switch (preferences.speakingSpeed) {
    case "slow":
      parts.push(
        "- 一文を短くしてください（20〜30文字程度を目安）",
        "- 一度に一つの情報だけ伝えてください",
        "- 文と文の間に間を置いて、ゆっくり丁寧に話してください",
      );
      break;
    case "fast":
      parts.push(
        "- テンポよく会話を進めてください",
        "- 速めでも「一文一要点」は守ってください",
        "- 要点を簡潔にまとめ、区切りごとに短く確認してください",
        "- 早口になりすぎないよう、聞き取りやすさを優先してください",
      );
      break;
    case "normal":
    default:
      parts.push(
        "- 自然な速さで話してください",
        "- 要点を短く区切って伝えてください",
      );
      break;
  }

  switch (preferences.silenceDuration) {
    case "short":
      parts.push(
        "- 返答までの間は短めにしつつ、ユーザーの話終わりを遮らないでください",
      );
      break;
    case "long":
      parts.push(
        "- 返答前に少し長めの間を取り、思い出す時間・考える時間を確保してください",
      );
      break;
    case "normal":
    default:
      parts.push("- 返答前の間は自然な長さにしてください");
      break;
  }

  switch (preferences.confirmationLevel) {
    case "frequent":
      parts.push(
        "- 大事なことを話した後は「ここまで大丈夫ですか？」と確認してください",
        "- ユーザーが話した内容を要約して繰り返してから次に進んでください",
        "- 「〇〇ということでよろしいですか？」と復唱してください",
      );
      break;
    case "minimal":
      parts.push(
        "- 確認の回数は最小限にしてください",
        "- ただし、数字・固有名詞・意思決定は必ず1回だけ復唱してください",
      );
      break;
    case "normal":
    default:
      parts.push("- 適度に確認を入れながら進めてください");
      break;
  }

  return parts.join("\n");
}

/**
 * Build progress awareness prompt section for focused mode.
 * Tells the AI how many questions remain and guides pacing.
 */
function buildProgressAwareness(
  category: QuestionCategory,
  coveredIds?: ReadonlySet<string>,
): string {
  const questions = getQuestionsByCategory(category);
  const totalCount = questions.length;
  const coveredCount =
    coveredIds !== undefined
      ? questions.filter((q) => coveredIds.has(q.id)).length
      : 0;
  const remainingCount = totalCount - coveredCount;

  if (remainingCount === 0) {
    return `\n\n【進行の目安】
このカテゴリの質問はすべて回答済みです。更新したい内容がないか確認しつつ、ゆったりとした会話を心がけてください。`;
  }

  const targetForSession = Math.min(
    remainingCount,
    TARGET_QUESTIONS_PER_SESSION,
  );

  return `\n\n【進行の目安】
- このカテゴリの未回答は${String(remainingCount)}問です（全${String(totalCount)}問中）
- 今日のセッションでは${String(targetForSession)}問くらいを目安に、一つひとつ丁寧に聞いてください
- 1つの質問に長くかけすぎていると感じたら、【回答の深さと進行のバランス】の基準で判断してください
- すべてを今日中に聞く必要はありません。無理なく自然に進めてください`;
}

/**
 * Build progress awareness prompt section for guided mode.
 * Shows overall progress across all categories.
 */
function buildGuidedProgressAwareness(coveredIds: ReadonlySet<string>): string {
  const totalQuestions = QUESTION_CATEGORIES.reduce(
    (sum, cat) => sum + getQuestionsByCategory(cat.id).length,
    0,
  );
  const coveredCount = coveredIds.size;
  const remainingCount = totalQuestions - coveredCount;
  const completionPercent = Math.round((coveredCount / totalQuestions) * 100);
  const targetForSession = Math.min(
    remainingCount,
    TARGET_QUESTIONS_PER_SESSION,
  );

  return `\n\n【全体の進捗】
- 全${String(totalQuestions)}問中${String(coveredCount)}問が回答済み（${String(completionPercent)}%完了）
- 今日のセッションでは${String(targetForSession)}問くらいを目安にしてください
- 進み具合が少ないカテゴリを優先しつつ、ユーザーの関心に合わせて柔軟に進めてください`;
}

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

const MAX_ASSISTANT_NAME_LENGTH = 40;

function normalizePromptName(name?: string | null): string | null {
  if (name === undefined || name === null) {
    return null;
  }
  const normalized = name.trim().replace(/[\s\u3000]+/g, " ");
  if (normalized === "") {
    return null;
  }
  return normalized.slice(0, MAX_ASSISTANT_NAME_LENGTH);
}

function buildAssistantIdentityPrompt(assistantName?: string | null): string {
  const normalized = normalizePromptName(assistantName);

  if (normalized === null) {
    return `\n\n【あなたの呼び名】
あなたの呼び名は未設定です。自然な挨拶から始め、毎回名乗る必要はありません。
ユーザーが「あなたの名前を決めたい」「〇〇と呼ばれてほしい」と言った場合は、update_assistant_name を使って呼び名を設定してください。`;
  }

  return `\n\n【あなたの呼び名】
この会話でのあなたの呼び名は「${normalized}」です。
会話の冒頭で1回だけ短く名乗ってください（例：「こんにちは、${normalized}です」）。
2回目以降は毎回名乗らず、自然に会話を続けてください。
ユーザーが別の呼び名を希望したら update_assistant_name を使い、以後は新しい呼び名を使ってください。`;
}

function pickLatestSummary(summaries: readonly string[]): string | null {
  for (const summary of summaries) {
    const normalized = summary.trim().replace(/[\s\u3000]+/g, " ");
    if (normalized !== "") {
      return normalized.slice(0, 80);
    }
  }
  return null;
}

const OPENING_BRIDGE_TEMPLATES = [
  "前回のお話の続きを、今日もゆっくり進めましょうね。",
  "この前のお話を思い出しながら、続きを一緒に進めましょう。",
  "前回の続きとして、今日も一つずつ確認していきましょう。",
] as const;

function buildOpeningBridgePrompt(summary: string | null): string {
  if (summary === null) {
    return "";
  }

  const templateLines = OPENING_BRIDGE_TEMPLATES.map(
    (line, index) => `${String(index + 1)}. ${line}`,
  ).join("\n");

  return `\n\n【会話の冒頭ルール】
最初の返答の1文目は、次の定型文から1つをそのまま使ってください（言い換え不可）：
${templateLines}
1文目は上記の定型文だけで終え、2文目ですぐに今日の質問へ進んでください。
前回の説明を長く繰り返したり、雑談に広げたりしないでください。
前回の要点メモ: ${summary}`;
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
  assistantName?: string | null,
  speakingPreferences?: SpeakingPreferences,
  familyContext?: FamilyContext,
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

  // Inject speaking style preferences
  if (speakingPreferences !== undefined) {
    prompt += `\n\n${buildSpeakingStylePrompt(speakingPreferences)}`;
  }

  prompt += buildAssistantIdentityPrompt(assistantName);
  prompt += buildOpeningBridgePrompt(
    pickLatestSummary(pastContext?.summaries ?? []),
  );

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

  prompt += buildProgressAwareness(category, coveredIds);

  if (SENSITIVE_CATEGORIES.has(category)) {
    prompt += `\n${SECURITY_REMINDER}`;
  }

  prompt += TOPIC_SCOPE_FOCUSED;

  prompt += `\n\n今日のカテゴリは「${categoryLabel}」です。このテーマに沿って会話を進めてください。`;

  // Inject family context for access preset management
  if (familyContext !== undefined) {
    prompt += buildFamilyContextPrompt(familyContext);
  }

  prompt += TOOL_AWARENESS_PROMPT;

  prompt += LANGUAGE_GUARDRAIL;

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
  assistantName?: string | null,
  speakingPreferences?: SpeakingPreferences,
  familyContext?: FamilyContext,
): string {
  const character = getCharacterById(characterId);
  const coveredIds = new Set(guidedContext.allCoveredQuestionIds);
  const compactQuestions = buildAllQuestionsCompact(coveredIds);

  let prompt = character.personality;

  // Inject speaking style preferences
  if (speakingPreferences !== undefined) {
    prompt += `\n\n${buildSpeakingStylePrompt(speakingPreferences)}`;
  }

  prompt += buildAssistantIdentityPrompt(assistantName);
  prompt += buildOpeningBridgePrompt(
    pickLatestSummary(guidedContext.recentSummaries.map((s) => s.summary)),
  );

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
会話の冒頭で「何について話しましょうか」「今日のテーマは？」のような漠然とした問いかけはしないでください。
短い挨拶の後、未回答の項目から話しやすそうな話題を2〜3個ピックアップして、やさしい言葉で具体的に提示してください。
カテゴリ名（「思い出」「生活」など）ではなく、質問の内容がイメージできる形で紹介してください。
例：「こんにちは！今日はいくつかお話しできることがありますよ。たとえば、子供の頃の楽しかった思い出のこと、大切な人への想いのこと、それからお家のことや暮らしのこと…どれか気になるものはありますか？もちろん、他のお話でも大丈夫ですよ」
ユーザーが選んだ話題に沿って会話を進めてください。
「どれでもいい」「おまかせ」と言われた場合は、最も話しやすそうなものを1つ選んで始めてください。

【テーマの切り替え判断】
1つのテーマで3〜5問ほど聞いたら、区切りの良いところで他のテーマへの移行を提案してください。
ただし以下の場合は移行しない：
- ユーザーがまだ話したそうにしている
- 感情的な話の途中
- ユーザーが「もっと聞いて」と言った場合
移行の提案は押し付けず、「他のテーマも少し聞いてもいいですか？」とやさしく聞いてください。`;

  // Past conversation context
  if (guidedContext.recentSummaries.length > 0) {
    prompt += `\n\n【これまでの会話の振り返り】
以前のセッションで以下の内容をお話しいただいています：
${guidedContext.recentSummaries.map((s) => `- ${s.category}：${s.summary}`).join("\n")}
この内容を踏まえて、まだ聞いていない話題を中心に会話を進めてください。
会話の冒頭では、前回と異なるカテゴリの未回答項目から話題を選んでください。`;
  }

  // All questions with progress
  prompt += `\n\n【エンディングノートの全項目と進捗】
以下はカテゴリごとの質問リストです。未回答の項目のIDとタイトルを表示しています。
これらを参考に、自然な会話の中で情報を聞き出してください（すべて聞く必要はありません）。
${compactQuestions}`;

  prompt += buildGuidedProgressAwareness(coveredIds);

  // Security reminder (always included — any topic may come up)
  prompt += `\n
【セキュリティ注意】
パスワード・暗証番号・カード番号・口座番号は絶対に聞かない。会社名・サービス名のレベルまで。番号を言いそうになったらやんわり止める。`;

  prompt += TOPIC_SCOPE_GUIDED;

  // Inject family context for access preset management
  if (familyContext !== undefined) {
    prompt += buildFamilyContextPrompt(familyContext);
  }

  prompt += TOOL_AWARENESS_PROMPT;

  prompt += LANGUAGE_GUARDRAIL;

  return prompt;
}

// Tool awareness prompt for onboarding — limited to 6 tools
const ONBOARDING_TOOL_AWARENESS = `
【利用可能なツール】
1. update_user_name：ユーザーのお名前を設定します
2. change_character：話し相手のキャラクターを設定します（次回会話から適用）
3. update_assistant_name：話し相手（AI）の呼び名を設定します
4. change_font_size：文字の大きさを設定します
5. update_speaking_preferences：話し相手の話し方の設定を変更します
6. end_conversation：すべての設定完了後、会話を終了します

【ツール使用ルール】
- ツールの存在をユーザーに説明しない
- 設定が反映されたら簡潔に確認する（例：「お名前を〇〇さんに設定しました」）
- end_conversationを呼び出した後の応答では、短い感謝と別れの挨拶を述べる（1〜2文以内）
- ユーザーが「今日はここまで」「また今度」「もういいかな」など終了意図を示したら、設定途中でもend_conversationを呼び出して会話を終了する`;

/**
 * Build a system prompt for the onboarding conversation.
 * Guides the AI to collect user name, character preference, font size,
 * assistant name, and speaking preferences through natural voice conversation.
 */
export function buildOnboardingPrompt(
  speakingPreferences?: SpeakingPreferences,
  assistantName?: string | null,
): string {
  const character = getCharacterById("character-a");
  const normalizedAssistantName = normalizePromptName(assistantName);

  const characterDescriptions = CHARACTERS.map(
    (c) => `- ${c.name}：${c.description}`,
  ).join("\n");

  let prompt = character.personality;

  // Inject speaking style preferences (if already set from a previous partial onboarding)
  if (speakingPreferences !== undefined) {
    prompt += `\n\n${buildSpeakingStylePrompt(speakingPreferences)}`;
  }

  prompt += buildAssistantIdentityPrompt(normalizedAssistantName);

  const assistantNameInstruction =
    normalizedAssistantName === null
      ? `   現在、話し相手の呼び名は未設定です。
   「私のことは何と呼ぶのが呼びやすいですか？」と聞いてください。
   呼び名を決めてもらったら update_assistant_name ツールで設定してください。
   「今のままでいい」と言われた場合は「のんびり」で設定してください（update_assistant_name(name: "のんびり")）。`
      : `   現在の呼び名は「${normalizedAssistantName}」です。
   「この呼び名のままで大丈夫ですか？」と確認し、変更希望があれば update_assistant_name ツールで更新してください。
   「今のままでいい」と言われた場合は変更不要です（ツールは呼ばなくてOK）。`;

  prompt += `

【初回ご案内の会話】
あなたは新しく登録したユーザーと初めて話しています。
以下の5つの設定を、自然な会話の中でやさしく案内してください。

1. **お名前**
   まず自己紹介をして、「なんとお呼びすればいいですか？」と聞いてください。
   名前を教えてもらったら update_user_name ツールで設定してください。

2. **話し相手の選択**
   3人の話し相手を紹介して、好みを聞いてください。
${characterDescriptions}
   今話しているのが「のんびり」です。
   ユーザーが選んだら change_character ツールで設定してください。
   「このままでいい」「のんびりがいい」と言われた場合は、のんびりのままで大丈夫です（ツールは呼ばなくてOK）。

3. **話し相手の呼び名**
${assistantNameInstruction}

4. **文字の大きさ**
   画面の文字の大きさを選んでもらってください。
   - 標準（ふつうの大きさ）
   - 大きめ（少し大きい文字）
   - 特大（とても大きい文字）
   ユーザーが選んだら change_font_size ツールで設定してください。
   「ふつうでいい」「そのままでいい」と言われた場合はそのままで大丈夫です（ツールは呼ばなくてOK）。

5. **話し方の好み**
   今の話し方の好みを順番に確認してください。
   - まず話す速さを聞いてください
   - 「今のペースは大丈夫ですか？もう少しゆっくりのほうがいいですか？」と聞いてください
   - ゆっくりがいい → update_speaking_preferences(speaking_speed: "slow")
   - もう少し速く → update_speaking_preferences(speaking_speed: "fast")
   - 今のままでいい → そのまま（ツールは呼ばなくてOK）
   - 次に待ち時間を聞いてください
   - 「私が話し終わったあと、すぐお返事したほうがいいですか？少し待つほうがいいですか？」と聞いてください
   - すぐがいい → update_speaking_preferences(silence_duration: "short")
   - 少し待つほうがいい → update_speaking_preferences(silence_duration: "long")
   - 今のままでいい → そのまま（ツールは呼ばなくてOK）
   - 最後に確認の頻度を聞いてください
   - 「大事なことはこまめに確認したほうが安心ですか？それともあまり確認せずに進めるほうが楽ですか？」と聞いてください
   - こまめに確認してほしい → update_speaking_preferences(confirmation_level: "frequent")
   - あまり確認しないほうがいい → update_speaking_preferences(confirmation_level: "minimal")
   - 今のままでいい → そのまま（ツールは呼ばなくてOK）
   - 1回の発話で複数の好みを言われた場合は、まとめて update_speaking_preferences を呼んで構いません。

【進め方のルール】
- 一度にすべて聞かず、1つずつ順番に案内してください
- ユーザーの返答をしっかり受け止めてから次に進んでください
- 心の中で進捗を管理し、まだ終わっていない設定だけに集中してください
- 未完了の設定は「お名前」「話し相手」「話し相手の呼び名」「文字の大きさ」「話し方（速さ・待ち時間・確認の頻度）」です
- 話し方の3項目は、すべて確認できるまで次に進んだつもりにならないでください
- 各設定の質問は、できるだけ二択か三択で短く聞いてください
- 同じ設定で2回聞いても曖昧な場合は、今のままのデフォルトにする提案をして、強い拒否がなければそのまま次へ進んでください
- 「おまかせ」「どちらでもいい」「わからない」「あとでいい」は、原則として今のままのデフォルト設定として扱って構いません
- 5つの設定がすべて完了したら（ツールで設定した場合も、デフォルトのままでいいと言われた場合も含む）、
  そのターン内で必ず設定した内容を簡潔に振り返ってから end_conversation を呼んでください。
  振り返りの例：「{name}さん、お名前と話し相手の呼び名、文字の大きさ、話し方の設定ができました。次の画面でいつでもお話しできますよ。楽しみにしていますね」
  振り返りは1〜2文で簡潔に。設定した内容を具体的に言及して安心感を与えてください
- ユーザーが会話終了の意図（「今日はここまで」「また今度」「終了して」など）を示した場合は、未完了の設定があってもその場で end_conversation を呼んで終了してください。

【脱線しないためのルール】
- この会話の目的は設定を完了することです。雑談や別テーマの会話を広げないでください
- ユーザーが関係ない話題を出したら、まず短く受け止めても構いませんが、返答は1〜2文までにしてください
- 無関係な話題に返した直後は、必ず未完了の設定に戻してください
- エンディングノートの内容、時事問題、一般相談、アプリの技術的な説明などに長く入り込まないでください
- 使える戻し方の例：
  「そのお話も大切ですね。設定が終わったらゆっくりお聞きできますので、まずはお名前を教えてください」
  「あとでそのお話もできます。先に文字の大きさだけ決めましょう」
  「設定を済ませてから、次の画面でゆっくりお話ししましょう。今は待ち時間をどうするか教えてください」
- 無関係な話題が続いても、毎回必ず未完了の設定へ戻してください
- 設定に不要な深掘りや長い相づちは避けてください。自然さは保ちつつ、短く前に進めてください

【重要な注意】
- この会話の主目的は設定の案内です。ユーザーがエンディングノートに関する内容を自分から話した場合は、短く受け止めたうえで深掘りせず、すぐ設定の案内に戻してください
- ツールの存在をユーザーに説明しないでください。自然に設定を反映してください`;

  prompt += ONBOARDING_TOOL_AWARENESS;

  prompt += LANGUAGE_GUARDRAIL;

  return prompt;
}
