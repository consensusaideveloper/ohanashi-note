import type { QuestionCategory } from "../types/conversation.js";

interface Question {
  id: string;
  category: QuestionCategory;
  title: string;
}

export const QUESTIONS: Question[] = [
  // memories
  {
    id: "memories-08",
    category: "memories",
    title: "自分史・趣味・好きなもの",
  },
  { id: "memories-02", category: "memories", title: "一番楽しかった家族旅行" },
  { id: "memories-01", category: "memories", title: "子が生まれた日" },
  { id: "memories-07", category: "memories", title: "やりたいことリスト" },
  { id: "memories-06", category: "memories", title: "いつもの挨拶" },
  { id: "memories-09", category: "memories", title: "若い頃のエピソード" },
  { id: "memories-10", category: "memories", title: "壮年期のエピソード" },

  // people
  { id: "people-01", category: "people", title: "大事な人" },
  { id: "memories-04", category: "people", title: "家族へのメッセージ" },
  { id: "people-02", category: "people", title: "一人ひとりへのメッセージ" },
  { id: "people-05", category: "people", title: "もしもの時に頼りたい人" },
  { id: "medical-09", category: "people", title: "緊急連絡先" },
  { id: "medical-10", category: "people", title: "親族・友人の連絡先" },
  { id: "house-05", category: "people", title: "ペットの情報" },
  { id: "house-06", category: "people", title: "ペットの引き取り" },
  { id: "people-03", category: "people", title: "ペットの病歴・アレルギー" },
  { id: "people-04", category: "people", title: "ペットの特徴と見分け方" },

  // house
  { id: "house-01", category: "house", title: "家の管理" },
  { id: "house-02", category: "house", title: "貴重品・コレクション" },
  { id: "house-03", category: "house", title: "私物の整理・形見分け" },
  { id: "house-07", category: "house", title: "携帯電話・通信契約" },
  { id: "house-04", category: "house", title: "見られたくないもの" },

  // medical
  { id: "medical-01", category: "medical", title: "常用の薬" },
  { id: "medical-02", category: "medical", title: "かかりつけの病院" },
  { id: "medical-11", category: "medical", title: "アレルギー" },
  { id: "medical-12", category: "medical", title: "病歴" },
  { id: "medical-03", category: "medical", title: "保険証・マイナンバー" },
  { id: "medical-04", category: "medical", title: "介護の希望" },
  { id: "medical-13", category: "medical", title: "認知症・成年後見の備え" },
  {
    id: "medical-05",
    category: "medical",
    title: "延命治療・終末医療の希望",
  },
  { id: "medical-07", category: "medical", title: "臓器提供の意思" },
  { id: "medical-08", category: "medical", title: "基本情報の保管" },
  { id: "medical-14", category: "medical", title: "尊厳死宣言書" },
  { id: "medical-15", category: "medical", title: "終末期の過ごし方" },
  { id: "medical-16", category: "medical", title: "かかりつけ医との相談" },

  // funeral
  { id: "funeral-01", category: "funeral", title: "葬儀の希望" },
  { id: "funeral-02", category: "funeral", title: "宗教・菩提寺" },
  { id: "funeral-03", category: "funeral", title: "お墓の準備" },
  { id: "funeral-08", category: "funeral", title: "埋葬の方法" },
  { id: "funeral-04", category: "funeral", title: "遺影の写真" },
  { id: "funeral-05", category: "funeral", title: "訃報を伝える人" },
  { id: "funeral-06", category: "funeral", title: "参列と連絡の制限" },
  { id: "funeral-07", category: "funeral", title: "仏壇・神棚の管理" },
  { id: "funeral-09", category: "funeral", title: "墓じまいの検討" },
  { id: "funeral-10", category: "funeral", title: "永代供養の希望" },
  { id: "funeral-11", category: "funeral", title: "散骨の希望" },

  // money
  { id: "money-01", category: "money", title: "メインの銀行" },
  { id: "money-02", category: "money", title: "その他の銀行口座" },
  { id: "money-03", category: "money", title: "通帳と印鑑の場所" },
  { id: "money-16", category: "money", title: "有価証券・投資" },
  { id: "money-04", category: "money", title: "生命保険" },
  { id: "money-06", category: "money", title: "ローンの有無" },
  { id: "money-07", category: "money", title: "不動産の権利証" },
  { id: "money-08", category: "money", title: "年金と受給状況" },
  { id: "money-09", category: "money", title: "クレジットカード" },
  { id: "money-10", category: "money", title: "個人間の貸し借り" },
  { id: "money-11", category: "money", title: "ポイント・電子マネー" },
  { id: "money-17", category: "money", title: "その他の貴重品" },
  { id: "money-13", category: "money", title: "利用中のサービス" },
  { id: "money-14", category: "money", title: "定期契約の解約" },
  { id: "money-15", category: "money", title: "相続の希望" },
  { id: "money-18", category: "money", title: "実印の登録と保管" },
  { id: "money-19", category: "money", title: "銀行届出印の使い分け" },
  { id: "money-20", category: "money", title: "印鑑登録証の保管" },

  // work
  { id: "work-01", category: "work", title: "現在のお仕事" },
  { id: "work-02", category: "work", title: "勤務先・事業の連絡先" },
  { id: "work-03", category: "work", title: "退職金・企業年金" },
  { id: "work-04", category: "work", title: "取引先・お客様" },
  { id: "work-05", category: "work", title: "事業の継続・廃業の希望" },
  { id: "work-06", category: "work", title: "仕事の契約・許認可" },
  { id: "work-07", category: "work", title: "事業用の借入・保証" },
  { id: "work-08", category: "work", title: "顧問の専門家" },
  { id: "work-09", category: "work", title: "著作物・知的財産" },

  // digital
  { id: "digital-01", category: "digital", title: "暗号資産・NFT" },
  { id: "digital-02", category: "digital", title: "ネット証券・NISA" },
  { id: "digital-03", category: "digital", title: "パスワードメモの場所" },
  { id: "digital-04", category: "digital", title: "SNSの死後対応" },
  { id: "digital-05", category: "digital", title: "写真データの整理" },
  { id: "digital-06", category: "digital", title: "追悼アカウント設定" },
  { id: "digital-08", category: "digital", title: "AIによる再現" },

  // legal
  { id: "legal-01", category: "legal", title: "法定相続人の確認" },
  { id: "legal-02", category: "legal", title: "相続財産の全体像" },
  { id: "legal-03", category: "legal", title: "遺言書の種類と保管" },
  { id: "legal-04", category: "legal", title: "遺言執行者の指定" },
  { id: "legal-05", category: "legal", title: "生前贈与の意向" },
  { id: "legal-06", category: "legal", title: "生命保険の活用" },
  { id: "legal-07", category: "legal", title: "相続税対策の状況" },
  { id: "legal-08", category: "legal", title: "不動産の相続登記" },
  { id: "legal-09", category: "legal", title: "遺産分割の希望" },
  { id: "legal-10", category: "legal", title: "遺贈寄付の希望" },
  { id: "legal-11", category: "legal", title: "相続放棄の検討" },
  { id: "legal-12", category: "legal", title: "養子縁組の意向" },

  // trust
  { id: "trust-01", category: "trust", title: "家族信託の検討" },
  { id: "trust-02", category: "trust", title: "信託の役割分担" },
  { id: "trust-03", category: "trust", title: "空き家対策" },
  { id: "trust-04", category: "trust", title: "ペット信託" },
  { id: "trust-05", category: "trust", title: "死後事務委任" },
  { id: "trust-06", category: "trust", title: "任意後見の検討" },
  { id: "trust-07", category: "trust", title: "任意後見受任者" },
  { id: "trust-08", category: "trust", title: "身元保証人" },
  { id: "trust-09", category: "trust", title: "見守り契約" },
  { id: "trust-10", category: "trust", title: "親なき後の備え" },
  { id: "trust-11", category: "trust", title: "信頼できる専門家" },

  // support
  { id: "support-01", category: "support", title: "成年後見制度の理解" },
  { id: "support-02", category: "support", title: "生活保護の相談" },
  { id: "support-03", category: "support", title: "葬儀費用の補助金" },
  { id: "support-04", category: "support", title: "リバースモーゲージ" },
  { id: "support-05", category: "support", title: "リースバック" },
  { id: "support-06", category: "support", title: "遺族年金の確認" },
  { id: "support-07", category: "support", title: "日常生活自立支援" },
  { id: "support-08", category: "support", title: "介護保険の利用状況" },
];

/**
 * Returns a JSON-formatted string listing all questions for the given category.
 * Each entry includes `id` and `title`.
 */
export function getQuestionListForCategory(category: QuestionCategory): string {
  const filtered = QUESTIONS.filter((q) => q.category === category).map(
    ({ id, title }) => ({ id, title }),
  );
  return JSON.stringify(filtered, null, 2);
}

/**
 * Returns a JSON-formatted string listing ALL questions regardless of category.
 * Each entry includes `id`, `category`, and `title`.
 */
export function getAllQuestionsListJson(): string {
  const all = QUESTIONS.map(({ id, category, title }) => ({
    id,
    category,
    title,
  }));
  return JSON.stringify(all, null, 2);
}
