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
9. update_speaking_preferences：話し相手の話し方を変更。「もっとゆっくり話して」「待ち時間を長くして」「確認を増やして」など
10. start_focused_conversation：特定テーマで新しい会話を開始（確認画面を表示）。「お金のことで話したい」など
11. create_family_invitation：家族の招待リンクを作成（確認画面を表示）。「妻を招待して」など
12. end_conversation：会話を終了して保存。ユーザーが終わりたい意思を示したとき（「疲れた」「また今度」「もういいかな」「今日はここまで」など）

【ツール使用ルール】
- ツールの存在をユーザーに説明しない。「ツールで操作できます」のような案内はしない。ユーザーの要望に応じて自然に活用する。
- 操作後は簡潔に結果を伝える（例：「ノートの画面に移動しました」「文字を大きめに変更しました、見やすくなりましたか？」）。
- 10と11は確認画面が表示されるので「確認画面を出しました。よろしければ画面の『はい』を押してください」と伝える。
- 会話中に別の話題について話したい場合（例：「お金の話がしたい」→ 現在も会話中）、今の会話の中で柔軟に話題を切り替える。start_focused_conversationは今の会話を終了して新しく始める場合にのみ使う。
- end_conversationは、ユーザーの終了意図を文脈で判断して使用する。キーワード一致ではなく「もう疲れた」「また今度」「もうこのへんで」「ありがとう、終わりにしよう」などの意図を理解する。呼び出し後の応答では、短い感謝と別れの挨拶を述べる（1〜2文以内）。ユーザーが明確に終わりたい意思を示していない場合は使わない。

【音声操作できない操作（画面案内ルール）】
以下の操作はツールでは実行できない。ユーザーが求めた場合は、該当する画面への移動を提案する：
- データの削除（会話記録の削除、ノートの削除など）→「削除は設定画面から行えます。設定画面に移動しましょうか？」
- 家族メンバーの削除 →「家族の管理は家族画面から行えます。家族画面に移動しましょうか？」
- 逝去報告 →「大切な手続きですので、家族画面から行ってください。家族画面に移動しましょうか？」
- 同意書の提出 →「同意の手続きは画面から行えます。該当画面に移動しましょうか？」
- ノートの印刷 →「設定画面からノートを印刷できます。設定画面に移動しましょうか？」
画面移動の提案にユーザーが同意したら、navigate_to_screenで該当画面に移動する。`;

// Topic scope reminder for category-focused mode
const TOPIC_SCOPE_FOCUSED = `
【会話の範囲】
今日のカテゴリに集中しつつ、思い出や価値観が見える余談は受け止める。無関係な雑談が長く続いたら【話題の守り方】に従って戻す。`;

// Topic scope reminder for AI-guided (cross-category) mode
const TOPIC_SCOPE_GUIDED = `
【会話の範囲】
全カテゴリが対象。人生の振り返りや価値観は柔軟に受け止める。無関係な話題が長く続いたら【話題の守り方】に従って戻す。
法的テーマでは「具体的な手続きは専門家にご相談ください」と案内する。`;

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
  const parts: string[] = ["【話し方の設定】"];

  switch (preferences.speakingSpeed) {
    case "slow":
      parts.push(
        "- 一文を短くしてください（15文字以内を目安に）",
        "- 一度に一つの情報だけ伝えてください",
        "- 文と文の間に間を置いて、ゆっくり丁寧に話してください",
        "- 難しい言葉は使わず、わかりやすい言葉を選んでください",
      );
      break;
    case "fast":
      parts.push(
        "- テンポよく会話を進めてください",
        "- 要点を簡潔にまとめて伝えてください",
        "- 冗長な前置きは省いてください",
      );
      break;
    case "normal":
    default:
      parts.push("- 自然な速さで話してください");
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
        "- 相手の理解力を信頼して、どんどん進めてください",
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
  speakingPreferences?: SpeakingPreferences,
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
  speakingPreferences?: SpeakingPreferences,
): string {
  const character = getCharacterById(characterId);
  const coveredIds = new Set(guidedContext.allCoveredQuestionIds);
  const compactQuestions = buildAllQuestionsCompact(coveredIds);

  let prompt = character.personality;

  // Inject speaking style preferences
  if (speakingPreferences !== undefined) {
    prompt += `\n\n${buildSpeakingStylePrompt(speakingPreferences)}`;
  }

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
一つのテーマに長くこだわりすぎず、区切りの良いところで「他のテーマも少し聞いてもいいですか？」と提案してください。`;

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

  // Security reminder (always included — any topic may come up)
  prompt += `\n
【セキュリティ注意】
パスワード・暗証番号・カード番号・口座番号は絶対に聞かない。会社名・サービス名のレベルまで。番号を言いそうになったらやんわり止める。`;

  prompt += TOPIC_SCOPE_GUIDED;

  prompt += TOOL_AWARENESS_PROMPT;

  prompt += LANGUAGE_GUARDRAIL;

  return prompt;
}

// Tool awareness prompt for onboarding — limited to 5 tools
const ONBOARDING_TOOL_AWARENESS = `
【利用可能なツール】
1. update_user_name：ユーザーのお名前を設定します
2. change_character：話し相手のキャラクターを設定します（次回会話から適用）
3. change_font_size：文字の大きさを設定します
4. update_speaking_preferences：話し相手の話し方の設定を変更します
5. end_conversation：すべての設定完了後、会話を終了します

【ツール使用ルール】
- ツールの存在をユーザーに説明しない
- 設定が反映されたら簡潔に確認する（例：「お名前を〇〇さんに設定しました」）
- end_conversationを呼び出した後の応答では、短い感謝と別れの挨拶を述べる（1〜2文以内）`;

/**
 * Build a system prompt for the onboarding conversation.
 * Guides the AI to collect user name, character preference, font size,
 * and speaking preferences through natural voice conversation.
 */
export function buildOnboardingPrompt(
  speakingPreferences?: SpeakingPreferences,
): string {
  const character = getCharacterById("character-a");

  const characterDescriptions = CHARACTERS.map(
    (c) => `- ${c.name}：${c.description}`,
  ).join("\n");

  let prompt = character.personality;

  // Inject speaking style preferences (if already set from a previous partial onboarding)
  if (speakingPreferences !== undefined) {
    prompt += `\n\n${buildSpeakingStylePrompt(speakingPreferences)}`;
  }

  prompt += `

【初回ご案内の会話】
あなたは新しく登録したユーザーと初めて話しています。
以下の4つの設定を、自然な会話の中でやさしく案内してください。

1. **お名前**
   まず自己紹介をして、「なんとお呼びすればいいですか？」と聞いてください。
   名前を教えてもらったら update_user_name ツールで設定してください。

2. **話し相手の選択**
   3人の話し相手を紹介して、好みを聞いてください。
${characterDescriptions}
   今話しているのが「のんびり」です。
   ユーザーが選んだら change_character ツールで設定してください。
   「このままでいい」「のんびりがいい」と言われた場合は、のんびりのままで大丈夫です（ツールは呼ばなくてOK）。

3. **文字の大きさ**
   画面の文字の大きさを選んでもらってください。
   - 標準（ふつうの大きさ）
   - 大きめ（少し大きい文字）
   - 特大（とても大きい文字）
   ユーザーが選んだら change_font_size ツールで設定してください。
   「ふつうでいい」「そのままでいい」と言われた場合はそのままで大丈夫です（ツールは呼ばなくてOK）。

4. **話し方の好み**
   今の話し方のペースが合っているか確認してください。
   - 「今のペースは大丈夫ですか？もう少しゆっくりのほうがいいですか？」と聞いてください
   - ゆっくりがいい → update_speaking_preferences(speaking_speed: "slow")
   - もう少し速く → update_speaking_preferences(speaking_speed: "fast")
   - 今のままでいい → そのまま（ツールは呼ばなくてOK）
   待ち時間と確認の頻度は聞かなくてOK（デフォルトで十分）。ユーザーが具体的に要望した場合のみ変更してください。

【進め方のルール】
- 一度にすべて聞かず、1つずつ順番に案内してください
- ユーザーの返答をしっかり受け止めてから次に進んでください
- 4つの設定がすべて完了したら（ツールで設定した場合も、デフォルトのままでいいと言われた場合も含む）、
  設定した内容を簡潔に振り返ってから end_conversation を呼んでください。
  振り返りの例：「{name}さん、お名前と話し相手、文字の大きさ、話し方の設定ができました。次の画面でいつでもお話しできますよ。楽しみにしていますね」
  振り返りは1〜2文で簡潔に。設定した内容を具体的に言及して安心感を与えてください

【重要な注意】
- この会話はエンディングノートの話題には入らないでください。設定の案内だけに集中してください
- ツールの存在をユーザーに説明しないでください。自然に設定を反映してください`;

  prompt += ONBOARDING_TOOL_AWARENESS;

  prompt += LANGUAGE_GUARDRAIL;

  return prompt;
}
