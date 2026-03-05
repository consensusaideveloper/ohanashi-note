import type { QuestionCategory } from "../types/conversation.js";

type QuestionType = "single" | "accumulative";

interface Question {
  id: string;
  category: QuestionCategory;
  title: string;
  questionType: QuestionType;
}

export const QUESTIONS: Question[] = [
  // memories
  {
    id: "memories-08",
    category: "memories",
    title: "自分史・趣味・好きなもの",
    questionType: "accumulative",
  },
  {
    id: "memories-02",
    category: "memories",
    title: "一番楽しかった家族旅行",
    questionType: "accumulative",
  },
  {
    id: "memories-01",
    category: "memories",
    title: "子が生まれた日",
    questionType: "accumulative",
  },
  {
    id: "memories-07",
    category: "memories",
    title: "やりたいことリスト",
    questionType: "accumulative",
  },
  {
    id: "memories-09",
    category: "memories",
    title: "若い頃のエピソード",
    questionType: "accumulative",
  },
  {
    id: "memories-10",
    category: "memories",
    title: "働き盛りの頃の思い出（壮年期）",
    questionType: "accumulative",
  },

  // people
  {
    id: "people-01",
    category: "people",
    title: "大事な人",
    questionType: "accumulative",
  },
  {
    id: "memories-04",
    category: "people",
    title: "家族へのメッセージ",
    questionType: "accumulative",
  },
  {
    id: "people-02",
    category: "people",
    title: "一人ひとりへのメッセージ",
    questionType: "accumulative",
  },
  {
    id: "people-05",
    category: "people",
    title: "もしもの時に頼りたい人",
    questionType: "single",
  },
  {
    id: "medical-09",
    category: "people",
    title: "緊急連絡先",
    questionType: "accumulative",
  },
  {
    id: "medical-10",
    category: "people",
    title: "親族・友人の連絡先",
    questionType: "accumulative",
  },
  {
    id: "house-05",
    category: "people",
    title: "ペットの情報",
    questionType: "single",
  },
  {
    id: "house-06",
    category: "people",
    title: "ペットの引き取り",
    questionType: "single",
  },
  {
    id: "people-03",
    category: "people",
    title: "ペットの病歴・アレルギー",
    questionType: "single",
  },
  {
    id: "people-04",
    category: "people",
    title: "ペットの特徴と見分け方",
    questionType: "single",
  },

  // house
  {
    id: "house-01",
    category: "house",
    title: "家の管理",
    questionType: "single",
  },
  {
    id: "house-02",
    category: "house",
    title: "貴重品・コレクション",
    questionType: "accumulative",
  },
  {
    id: "house-03",
    category: "house",
    title: "誰かに譲りたいもの（形見分け）",
    questionType: "accumulative",
  },
  {
    id: "house-07",
    category: "house",
    title: "携帯電話・通信契約",
    questionType: "single",
  },
  {
    id: "house-04",
    category: "house",
    title: "内密に処分してほしいもの",
    questionType: "single",
  },

  // medical
  {
    id: "medical-01",
    category: "medical",
    title: "常用の薬",
    questionType: "accumulative",
  },
  {
    id: "medical-02",
    category: "medical",
    title: "かかりつけの病院",
    questionType: "accumulative",
  },
  {
    id: "medical-11",
    category: "medical",
    title: "アレルギー",
    questionType: "single",
  },
  {
    id: "medical-12",
    category: "medical",
    title: "病歴",
    questionType: "accumulative",
  },
  {
    id: "medical-03",
    category: "medical",
    title: "保険証・マイナンバー",
    questionType: "single",
  },
  {
    id: "medical-04",
    category: "medical",
    title: "介護の希望",
    questionType: "single",
  },
  {
    id: "medical-13",
    category: "medical",
    title: "もしもの備え・財産の管理",
    questionType: "single",
  },
  {
    id: "medical-05",
    category: "medical",
    title: "延命治療の希望",
    questionType: "single",
  },
  {
    id: "medical-07",
    category: "medical",
    title: "臓器提供の意思",
    questionType: "single",
  },
  {
    id: "medical-08",
    category: "medical",
    title: "基本情報の保管",
    questionType: "single",
  },
  {
    id: "medical-14",
    category: "medical",
    title: "延命治療の書類（尊厳死宣言書）",
    questionType: "single",
  },
  {
    id: "medical-15",
    category: "medical",
    title: "終末期の過ごし方",
    questionType: "single",
  },
  {
    id: "medical-16",
    category: "medical",
    title: "かかりつけ医との相談",
    questionType: "single",
  },

  // funeral
  {
    id: "funeral-01",
    category: "funeral",
    title: "葬儀の希望",
    questionType: "single",
  },
  {
    id: "funeral-02",
    category: "funeral",
    title: "宗教・菩提寺",
    questionType: "single",
  },
  {
    id: "funeral-03",
    category: "funeral",
    title: "お墓の準備",
    questionType: "single",
  },
  {
    id: "funeral-08",
    category: "funeral",
    title: "埋葬の方法",
    questionType: "single",
  },
  {
    id: "funeral-04",
    category: "funeral",
    title: "遺影の写真",
    questionType: "single",
  },
  {
    id: "funeral-05",
    category: "funeral",
    title: "訃報を伝える人",
    questionType: "accumulative",
  },
  {
    id: "funeral-06",
    category: "funeral",
    title: "葬儀に呼ぶ人・呼ばない人",
    questionType: "accumulative",
  },
  {
    id: "funeral-07",
    category: "funeral",
    title: "仏壇・神棚の管理",
    questionType: "single",
  },
  {
    id: "funeral-09",
    category: "funeral",
    title: "墓じまいの検討",
    questionType: "single",
  },
  {
    id: "funeral-10",
    category: "funeral",
    title: "永代供養の希望",
    questionType: "single",
  },
  {
    id: "funeral-11",
    category: "funeral",
    title: "散骨の希望",
    questionType: "single",
  },

  // money
  {
    id: "money-01",
    category: "money",
    title: "メインの銀行",
    questionType: "single",
  },
  {
    id: "money-02",
    category: "money",
    title: "その他の銀行口座",
    questionType: "accumulative",
  },
  {
    id: "money-03",
    category: "money",
    title: "通帳と印鑑の場所",
    questionType: "single",
  },
  {
    id: "money-16",
    category: "money",
    title: "株や投資のこと（有価証券）",
    questionType: "single",
  },
  {
    id: "money-04",
    category: "money",
    title: "生命保険",
    questionType: "single",
  },
  {
    id: "money-06",
    category: "money",
    title: "ローンの有無",
    questionType: "single",
  },
  {
    id: "money-07",
    category: "money",
    title: "不動産の権利証",
    questionType: "single",
  },
  {
    id: "money-08",
    category: "money",
    title: "年金と受給状況",
    questionType: "single",
  },
  {
    id: "money-09",
    category: "money",
    title: "クレジットカード",
    questionType: "accumulative",
  },
  {
    id: "money-10",
    category: "money",
    title: "個人間の貸し借り",
    questionType: "single",
  },
  {
    id: "money-11",
    category: "money",
    title: "ポイント・電子マネー",
    questionType: "accumulative",
  },
  {
    id: "money-17",
    category: "money",
    title: "その他の貴重品",
    questionType: "single",
  },
  {
    id: "money-13",
    category: "money",
    title: "利用中のサービス",
    questionType: "accumulative",
  },
  {
    id: "money-14",
    category: "money",
    title: "定期契約の解約",
    questionType: "accumulative",
  },
  {
    id: "money-15",
    category: "money",
    title: "相続の希望",
    questionType: "single",
  },
  {
    id: "money-18",
    category: "money",
    title: "実印の登録と保管",
    questionType: "single",
  },
  {
    id: "money-19",
    category: "money",
    title: "銀行届出印の使い分け",
    questionType: "single",
  },
  {
    id: "money-20",
    category: "money",
    title: "印鑑登録証の保管",
    questionType: "single",
  },

  // work
  {
    id: "work-01",
    category: "work",
    title: "現在のお仕事",
    questionType: "single",
  },
  {
    id: "work-02",
    category: "work",
    title: "勤務先・事業の連絡先",
    questionType: "single",
  },
  {
    id: "work-03",
    category: "work",
    title: "退職金・企業年金",
    questionType: "single",
  },
  {
    id: "work-04",
    category: "work",
    title: "取引先・お客様",
    questionType: "accumulative",
  },
  {
    id: "work-05",
    category: "work",
    title: "事業の継続・廃業の希望",
    questionType: "single",
  },
  {
    id: "work-06",
    category: "work",
    title: "仕事の免許や契約書（許認可）",
    questionType: "single",
  },
  {
    id: "work-07",
    category: "work",
    title: "事業用の借入・保証",
    questionType: "single",
  },
  {
    id: "work-08",
    category: "work",
    title: "顧問の専門家",
    questionType: "single",
  },
  {
    id: "work-09",
    category: "work",
    title: "自分の作品や特許（知的財産）",
    questionType: "single",
  },

  // digital
  {
    id: "digital-01",
    category: "digital",
    title: "仮想通貨（ネット上のお金）",
    questionType: "single",
  },
  {
    id: "digital-02",
    category: "digital",
    title: "ネット証券・つみたてNISA",
    questionType: "single",
  },
  {
    id: "digital-03",
    category: "digital",
    title: "パスワードメモの場所",
    questionType: "single",
  },
  {
    id: "digital-04",
    category: "digital",
    title: "SNSの死後対応",
    questionType: "single",
  },
  {
    id: "digital-05",
    category: "digital",
    title: "写真データの整理",
    questionType: "single",
  },
  {
    id: "digital-06",
    category: "digital",
    title: "亡くなった後のアカウント管理（追悼アカウント）",
    questionType: "single",
  },
  {
    id: "digital-08",
    category: "digital",
    title: "声や姿を残すこと",
    questionType: "single",
  },

  // legal
  {
    id: "legal-01",
    category: "legal",
    title: "ご家族の構成（法定相続人）",
    questionType: "single",
  },
  {
    id: "legal-02",
    category: "legal",
    title: "財産の整理（相続財産）",
    questionType: "single",
  },
  {
    id: "legal-03",
    category: "legal",
    title: "遺言書の種類と保管",
    questionType: "single",
  },
  {
    id: "legal-04",
    category: "legal",
    title: "遺言を届ける人",
    questionType: "single",
  },
  {
    id: "legal-05",
    category: "legal",
    title: "生きているうちに渡したい財産（生前贈与）",
    questionType: "single",
  },
  {
    id: "legal-06",
    category: "legal",
    title: "生命保険の活用",
    questionType: "single",
  },
  {
    id: "legal-07",
    category: "legal",
    title: "税金がかからない仕組みの活用",
    questionType: "single",
  },
  {
    id: "legal-08",
    category: "legal",
    title: "土地や家の名義変更（相続登記）",
    questionType: "single",
  },
  {
    id: "legal-09",
    category: "legal",
    title: "財産の分け方の希望（遺産分割）",
    questionType: "single",
  },
  {
    id: "legal-10",
    category: "legal",
    title: "寄付のご希望",
    questionType: "single",
  },
  {
    id: "legal-11",
    category: "legal",
    title: "借金の引き継ぎについて",
    questionType: "single",
  },
  {
    id: "legal-12",
    category: "legal",
    title: "養子縁組の意向",
    questionType: "single",
  },

  // trust
  {
    id: "trust-01",
    category: "trust",
    title: "家族信託の検討",
    questionType: "single",
  },
  {
    id: "trust-02",
    category: "trust",
    title: "財産を預ける人・預かる人（家族信託）",
    questionType: "single",
  },
  {
    id: "trust-03",
    category: "trust",
    title: "空き家対策",
    questionType: "single",
  },
  {
    id: "trust-04",
    category: "trust",
    title: "ペット信託",
    questionType: "single",
  },
  {
    id: "trust-05",
    category: "trust",
    title: "亡くなった後の手続きを頼む人（死後事務委任）",
    questionType: "single",
  },
  {
    id: "trust-06",
    category: "trust",
    title: "判断が難しくなった時の備え（任意後見）",
    questionType: "single",
  },
  {
    id: "trust-07",
    category: "trust",
    title: "後見人になってほしい人（任意後見受任者）",
    questionType: "single",
  },
  {
    id: "trust-08",
    category: "trust",
    title: "身元保証人",
    questionType: "single",
  },
  {
    id: "trust-09",
    category: "trust",
    title: "見守り契約",
    questionType: "single",
  },
  {
    id: "trust-10",
    category: "trust",
    title: "親なき後の備え",
    questionType: "single",
  },
  {
    id: "trust-11",
    category: "trust",
    title: "信頼できる専門家",
    questionType: "single",
  },

  // support
  {
    id: "support-01",
    category: "support",
    title: "判断が難しくなったときの支援",
    questionType: "single",
  },
  {
    id: "support-02",
    category: "support",
    title: "生活保護の相談",
    questionType: "single",
  },
  {
    id: "support-03",
    category: "support",
    title: "葬儀費用の補助金",
    questionType: "single",
  },
  {
    id: "support-04",
    category: "support",
    title: "自宅を使った生活資金の仕組み",
    questionType: "single",
  },
  {
    id: "support-05",
    category: "support",
    title: "自宅を売って住み続ける方法",
    questionType: "single",
  },
  {
    id: "support-06",
    category: "support",
    title: "遺族年金の確認",
    questionType: "single",
  },
  {
    id: "support-07",
    category: "support",
    title: "暮らしの手助けサービス（日常生活自立支援）",
    questionType: "single",
  },
  {
    id: "support-08",
    category: "support",
    title: "介護保険の利用状況",
    questionType: "single",
  },
];

/**
 * Returns a JSON-formatted string listing all questions for the given category.
 * Each entry includes `id`, `title`, and `type`.
 */
export function getQuestionListForCategory(category: QuestionCategory): string {
  const filtered = QUESTIONS.filter((q) => q.category === category).map(
    ({ id, title, questionType }) => ({ id, title, type: questionType }),
  );
  return JSON.stringify(filtered, null, 2);
}

/**
 * Returns a JSON-formatted string listing ALL questions regardless of category.
 * Each entry includes `id`, `category`, `title`, and `type`.
 */
export function getAllQuestionsListJson(): string {
  const all = QUESTIONS.map(({ id, category, title, questionType }) => ({
    id,
    category,
    title,
    type: questionType,
  }));
  return JSON.stringify(all, null, 2);
}
