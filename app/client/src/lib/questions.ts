// Ending note question definitions organized by category.
// All 63 questions based on the Hokkaido Administrative Scrivener Association
// ending note (2023) adapted for natural voice conversation.

import type { QuestionCategory } from "../types/conversation";

export interface EndingNoteQuestion {
  id: string;
  category: QuestionCategory;
  title: string;
  question: string;
  sensitive: boolean;
}

export interface CategoryInfo {
  id: QuestionCategory;
  label: string;
  description: string;
  icon: string;
  disclaimer?: string;
}

// Category metadata in display order
export const QUESTION_CATEGORIES: readonly CategoryInfo[] = [
  {
    id: "memories",
    label: "思い出",
    description: "楽しかった思い出や家族への想いについてお話ししましょう",
    icon: "\u{1F4D6}",
  },
  {
    id: "people",
    label: "大事な人・ペット",
    description:
      "大切な方やペットのこと、伝えたいメッセージについてお話ししましょう",
    icon: "\u{1F91D}",
  },
  {
    id: "house",
    label: "生活",
    description: "お家のことや大切なものについてお話ししましょう",
    icon: "\u{1F3E0}",
  },
  {
    id: "medical",
    label: "医療・介護",
    description: "いざという時に備えて、医療や介護のことをお話ししましょう",
    icon: "\u{1F3E5}",
  },
  {
    id: "funeral",
    label: "葬儀・供養",
    description: "お葬式やお墓のご希望についてお話ししましょう",
    icon: "\u{1F56F}\uFE0F",
  },
  {
    id: "money",
    label: "お金・資産",
    description: "大切な資産の情報を整理しましょう（秘密は守ります）",
    icon: "\u{1F4B0}",
  },
  {
    id: "work",
    label: "仕事・事業",
    description: "お仕事や事業のことを整理しましょう",
    icon: "\u{1F4BC}",
  },
  {
    id: "digital",
    label: "スマホ・ネット",
    description: "スマホやインターネット、パスワードのことをお話ししましょう",
    icon: "\u{1F4F1}",
  },
  {
    id: "legal",
    label: "財産と遺言",
    description: "大切な財産や遺言書のことを整理しましょう",
    icon: "\u2696\uFE0F",
    disclaimer:
      "このアプリはお気持ちや希望を記録するためのものです。法律の手続きには使えませんので、くわしいことは専門家（弁護士や司法書士など）にご相談ください。",
  },
  {
    id: "trust",
    label: "将来の備え",
    description:
      "判断が難しくなったときや、亡くなった後のことについて備えましょう",
    icon: "\u{1F4CB}",
    disclaimer:
      "このアプリはお気持ちや希望を記録するためのものです。法律の手続きには使えませんので、くわしいことは専門家（弁護士や司法書士など）にご相談ください。",
  },
  {
    id: "support",
    label: "使える制度",
    description: "暮らしに役立つ公的な制度についてお話ししましょう",
    icon: "\u{1F3DB}\uFE0F",
    disclaimer:
      "制度の詳細や申請方法は、お住まいの市区町村窓口や社会福祉協議会にご確認ください。",
  },
] as const;

// All ending note questions across 11 categories
const QUESTIONS: readonly EndingNoteQuestion[] = [
  // --- Memories (7 questions) ---
  {
    id: "memories-08",
    category: "memories",
    title: "自分史・趣味・好きなもの",
    question:
      "学歴・職歴、好きな食べ物・音楽・旅行先など、あなたの人となりを教えてください。",
    sensitive: false,
  },
  {
    id: "memories-02",
    category: "memories",
    title: "一番楽しかった家族旅行",
    question: "今までで一番楽しかった家族旅行は、どこへの旅行ですか？",
    sensitive: false,
  },
  {
    id: "memories-01",
    category: "memories",
    title: "子が生まれた日",
    question: "お子さんが生まれた日のこと、覚えていることを教えてください。",
    sensitive: false,
  },
  {
    id: "memories-07",
    category: "memories",
    title: "やりたいことリスト",
    question:
      "まだやっていないけど、やりたいことはありますか？（旅行、会いたい人など）",
    sensitive: false,
  },
  {
    id: "memories-06",
    category: "memories",
    title: "いつもの挨拶",
    question: "さようならの代わりに、いつもの「行ってきます」の言葉を。",
    sensitive: false,
  },
  {
    id: "memories-09",
    category: "memories",
    title: "若い頃のエピソード",
    question:
      "10代から30代の頃に、一番印象に残っている出来事やエピソードを教えてください。",
    sensitive: false,
  },
  {
    id: "memories-10",
    category: "memories",
    title: "壮年期のエピソード",
    question:
      "40代から60代の頃に、一番がんばったことや忘れられない出来事はありますか？",
    sensitive: false,
  },

  // --- People (10 questions) ---
  {
    id: "people-01",
    category: "people",
    title: "大事な人",
    question:
      "あなたにとって特に大事な人を教えてください。家族でも友人でも、お世話になった方でも大丈夫です。",
    sensitive: false,
  },
  {
    id: "memories-04",
    category: "people",
    title: "家族へのメッセージ",
    question: "家族へ伝えたいことがあれば、教えてください。",
    sensitive: false,
  },
  {
    id: "people-02",
    category: "people",
    title: "一人ひとりへのメッセージ",
    question: "大事な方それぞれに、伝えたいメッセージはありますか？",
    sensitive: false,
  },
  {
    id: "people-05",
    category: "people",
    title: "もしもの時に頼りたい人",
    question: "いざという時に、身の回りのことをお願いしたい人はいますか？",
    sensitive: false,
  },
  {
    id: "medical-09",
    category: "people",
    title: "緊急連絡先",
    question:
      "緊急時に連絡してほしい人（親族以外も含む）は誰ですか？連絡先を教えてください。",
    sensitive: false,
  },
  {
    id: "medical-10",
    category: "people",
    title: "親族・友人の連絡先",
    question:
      "親族や親しい友人の連絡先リストはありますか？訃報連絡や形見分けの際に参考にしたいです。",
    sensitive: false,
  },
  {
    id: "house-05",
    category: "people",
    title: "ペットの情報",
    question:
      "ペットを飼っていますか？かかりつけの動物病院や好きな餌などを教えてください。",
    sensitive: false,
  },
  {
    id: "house-06",
    category: "people",
    title: "ペットの引き取り",
    question: "万が一の時、ペットは誰に引き取ってほしいですか？",
    sensitive: false,
  },
  {
    id: "people-03",
    category: "people",
    title: "ペットの病歴・アレルギー",
    question:
      "ペットの持病やアレルギー、かかった病気の記録があれば教えてください。",
    sensitive: false,
  },
  {
    id: "people-04",
    category: "people",
    title: "ペットの特徴と見分け方",
    question:
      "ペットの特徴や見分けるポイント（模様、性格など）を教えてください。迷子になった時にも役立ちます。",
    sensitive: false,
  },

  // --- House (5 questions) ---
  {
    id: "house-01",
    category: "house",
    title: "家の管理",
    question: "この家に、何か特別な管理方法や注意点はありますか？",
    sensitive: false,
  },
  {
    id: "house-02",
    category: "house",
    title: "貴重品・コレクション",
    question: "貴金属や時計、大切にしているコレクションなどはありますか？",
    sensitive: false,
  },
  {
    id: "house-03",
    category: "house",
    title: "私物の整理・形見分け",
    question: "衣類や思い出の品で、誰かに譲りたいものや処分してほしいものは？",
    sensitive: false,
  },
  {
    id: "house-07",
    category: "house",
    title: "携帯電話・通信契約",
    question:
      "携帯電話やインターネット回線の契約会社と、解約時の注意点を教えてください。",
    sensitive: false,
  },
  {
    id: "house-04",
    category: "house",
    title: "処分してほしいもの",
    question:
      "家族に見せずに処分してほしいものや、特別にしまってあるものはありますか？",
    sensitive: true,
  },

  // --- Medical (13 questions) ---
  {
    id: "medical-01",
    category: "medical",
    title: "常用の薬",
    question: "普段飲んでいる薬（常備薬）の名前を教えてください。",
    sensitive: false,
  },
  {
    id: "medical-02",
    category: "medical",
    title: "かかりつけの病院",
    question: "かかりつけの病院をすべて教えてください。",
    sensitive: false,
  },
  {
    id: "medical-11",
    category: "medical",
    title: "アレルギー",
    question:
      "食べ物や薬のアレルギーはありますか？何に気をつけるべきか教えてください。",
    sensitive: false,
  },
  {
    id: "medical-12",
    category: "medical",
    title: "病歴",
    question: "これまでにかかった大きな病気や手術の経験はありますか？",
    sensitive: false,
  },
  {
    id: "medical-03",
    category: "medical",
    title: "保険証・マイナンバー",
    question: "健康保険証やマイナンバーカードはどこに保管していますか？",
    sensitive: false,
  },
  {
    id: "medical-04",
    category: "medical",
    title: "介護の希望",
    question:
      "介護が必要になったとき、どこで過ごしたいですか？費用や世話をお願いしたい人について希望はありますか？",
    sensitive: false,
  },
  {
    id: "medical-13",
    category: "medical",
    title: "もしもの備え・財産の管理",
    question:
      "万が一、ご自身で判断が難しくなったときに備えて、財産の管理やいろいろな手続きを誰にお願いしたいですか？",
    sensitive: true,
  },
  {
    id: "medical-05",
    category: "medical",
    title: "延命治療・終末医療の希望",
    question:
      "意識がなくなった時の延命治療や、最期の過ごし方（緩和ケアなど）についてお考えはありますか？",
    sensitive: true,
  },
  {
    id: "medical-07",
    category: "medical",
    title: "臓器提供の意思",
    question: "臓器提供について、どう考えていますか？",
    sensitive: true,
  },
  {
    id: "medical-08",
    category: "medical",
    title: "基本情報の保管",
    question:
      "生年月日、本籍、運転免許証などの基本情報はどこで確認できますか？",
    sensitive: false,
  },
  {
    id: "medical-14",
    category: "medical",
    title: "延命治療のご意思",
    question:
      "延命治療を望まない場合の「尊厳死宣言書（リヴィング・ウイル）」を作成されていますか？",
    sensitive: true,
  },
  {
    id: "medical-15",
    category: "medical",
    title: "終末期の過ごし方",
    question:
      "最期の時間をどこで、どのように過ごしたいですか？（自宅、病院、ホスピスなど）",
    sensitive: true,
  },
  {
    id: "medical-16",
    category: "medical",
    title: "かかりつけ医との相談",
    question:
      "終末期の医療について、かかりつけのお医者さんと話し合ったことはありますか？",
    sensitive: false,
  },

  // --- Funeral (11 questions) ---
  {
    id: "funeral-01",
    category: "funeral",
    title: "葬儀の希望",
    question:
      "葬儀について希望はありますか？規模（家族葬、一般葬、一日葬、直葬）や、葬儀を依頼したい会社がもしあれば教えてください。",
    sensitive: false,
  },
  {
    id: "funeral-02",
    category: "funeral",
    title: "宗教・菩提寺",
    question:
      "お世話になっているお寺（菩提寺）や、信仰している宗教はありますか？",
    sensitive: false,
  },
  {
    id: "funeral-03",
    category: "funeral",
    title: "お墓の準備",
    question:
      "お墓はすでに準備されていますか？場所はどこですか？お墓じまい（墓所の返還）についてお考えはありますか？",
    sensitive: false,
  },
  {
    id: "funeral-08",
    category: "funeral",
    title: "埋葬の方法",
    question:
      "埋葬の方法に希望はありますか？（一般的なお墓、納骨堂、樹木葬、散骨など）",
    sensitive: false,
  },
  {
    id: "funeral-04",
    category: "funeral",
    title: "遺影の写真",
    question: "遺影に使ってほしい、お気に入りの写真はありますか？",
    sensitive: false,
  },
  {
    id: "funeral-05",
    category: "funeral",
    title: "訃報を伝える人",
    question: "亡くなったことを、できるだけ早く伝えてほしい人は誰ですか？",
    sensitive: false,
  },
  {
    id: "funeral-06",
    category: "funeral",
    title: "参列と連絡の制限",
    question: "葬儀に呼びたい人、連絡を控えたい人はいますか？",
    sensitive: false,
  },
  {
    id: "funeral-07",
    category: "funeral",
    title: "仏壇・神棚の管理",
    question: "仏壇や神棚、ご先祖様のお守りは今後どうしてほしいですか？",
    sensitive: false,
  },
  {
    id: "funeral-09",
    category: "funeral",
    title: "墓じまいの検討",
    question:
      "お墓の管理が難しくなった場合、墓じまい（墓所の返還）を検討されていますか？",
    sensitive: false,
  },
  {
    id: "funeral-10",
    category: "funeral",
    title: "永代供養の希望",
    question:
      "お墓参りをしてくれる方がいない場合に備えて、永代供養を検討されていますか？",
    sensitive: false,
  },
  {
    id: "funeral-11",
    category: "funeral",
    title: "散骨の希望",
    question: "海や山への散骨に興味はありますか？",
    sensitive: false,
  },

  // --- Money (18 questions) ---
  {
    id: "money-01",
    category: "money",
    title: "メインの銀行",
    question:
      "メインで使っている銀行はどこですか？（銀行名・支店名など。暗証番号やパスワードは入力しないでください）",
    sensitive: true,
  },
  {
    id: "money-02",
    category: "money",
    title: "その他の銀行口座",
    question:
      "他に口座を持っている銀行をすべて教えてください。（銀行名・支店名のみ）",
    sensitive: true,
  },
  {
    id: "money-03",
    category: "money",
    title: "通帳と印鑑の場所",
    question:
      "通帳と届出印は、どこに保管していますか？金庫や引き出しなど、ご家族がわかる場所にありますか？",
    sensitive: true,
  },
  {
    id: "money-16",
    category: "money",
    title: "有価証券・投資",
    question:
      "株式や投資信託、債券など、証券会社で運用している資産はありますか？（証券会社名のみ教えてください）",
    sensitive: true,
  },
  {
    id: "money-04",
    category: "money",
    title: "生命保険",
    question:
      "生命保険に入っていますか？保険会社名と、証券の保管場所を教えてください。",
    sensitive: false,
  },
  {
    id: "money-06",
    category: "money",
    title: "ローンの有無",
    question: "住宅ローンや、その他のローンは残っていますか？",
    sensitive: true,
  },
  {
    id: "money-07",
    category: "money",
    title: "不動産の権利証",
    question: "不動産の権利証（登記識別情報）はどこにありますか？",
    sensitive: true,
  },
  {
    id: "money-08",
    category: "money",
    title: "年金と受給状況",
    question: "年金はどこから受け取っていますか？",
    sensitive: false,
  },
  {
    id: "money-09",
    category: "money",
    title: "クレジットカード",
    question:
      "クレジットカードは何枚持っていますか？カード会社名を教えてください。（カード番号やセキュリティコードは入力しないでください）",
    sensitive: true,
  },
  {
    id: "money-10",
    category: "money",
    title: "個人間の貸し借り",
    question: "人とお金の貸し借りはありますか？（貸している・借りている両方）",
    sensitive: true,
  },
  {
    id: "money-11",
    category: "money",
    title: "ポイント・電子マネー",
    question:
      "貯めているポイントやマイル、電子マネーの残高などはありますか？（サービス名のみ）",
    sensitive: false,
  },
  {
    id: "money-17",
    category: "money",
    title: "その他の貴重品",
    question:
      "金庫の中身や、家族が把握していない貴重な資産（美術品、骨董品、貴金属など）はありますか？",
    sensitive: true,
  },
  {
    id: "money-13",
    category: "money",
    title: "利用中のサービス",
    question:
      "有料で利用しているサービス（サブスク、習い事など）を教えてください。",
    sensitive: false,
  },
  {
    id: "money-14",
    category: "money",
    title: "定期契約の解約",
    question:
      "電気・ガス・新聞など、定期的に支払っている契約で解約が必要なものは？",
    sensitive: false,
  },
  {
    id: "money-15",
    category: "money",
    title: "相続の希望",
    question:
      "特定の財産を誰に譲りたいなど、相続について希望はありますか？（法的効力はありませんが参考として）",
    sensitive: true,
  },
  {
    id: "money-18",
    category: "money",
    title: "実印の登録と保管",
    question:
      "実印（市区町村に届け出た印鑑）はお持ちですか？どこの役所に届け出ていて、印鑑はどこに保管していますか？",
    sensitive: true,
  },
  {
    id: "money-19",
    category: "money",
    title: "銀行届出印の使い分け",
    question:
      "銀行届出印は、すべての銀行で同じ印鑑を使っていますか？それとも銀行ごとに違う印鑑ですか？",
    sensitive: true,
  },
  {
    id: "money-20",
    category: "money",
    title: "印鑑登録証の保管",
    question:
      "印鑑登録証（カード）はどこに保管していますか？マイナンバーカードでコンビニ取得できる設定にしていますか？",
    sensitive: true,
  },

  // --- Work (9 questions) ---
  {
    id: "work-01",
    category: "work",
    title: "現在のお仕事",
    question:
      "今もお仕事をされていますか？会社員、自営業、パートなど、働き方を教えてください。以前のお仕事についても教えてください。",
    sensitive: false,
  },
  {
    id: "work-02",
    category: "work",
    title: "勤務先・事業の連絡先",
    question:
      "勤務先やご自身の事業の名称、連絡先を教えてください。退職された方は、最後に勤めた会社の情報をお願いします。",
    sensitive: false,
  },
  {
    id: "work-03",
    category: "work",
    title: "退職金・企業年金",
    question:
      "退職金や企業年金はありますか？受け取り済みか、これから受け取るものがあるか教えてください。",
    sensitive: true,
  },
  {
    id: "work-04",
    category: "work",
    title: "取引先・お客様",
    question:
      "お仕事でお付き合いのある取引先やお客様はいますか？主な連絡先を教えてください。",
    sensitive: false,
  },
  {
    id: "work-05",
    category: "work",
    title: "事業の継続・廃業の希望",
    question:
      "ご自身の事業やお店をお持ちの方へ。万が一の時、事業はどうしてほしいですか？後を継いでほしい人はいますか？",
    sensitive: false,
  },
  {
    id: "work-06",
    category: "work",
    title: "仕事の契約・許認可",
    question:
      "お仕事に必要な免許や許可証、業務上の契約書などはありますか？保管場所を教えてください。",
    sensitive: false,
  },
  {
    id: "work-07",
    category: "work",
    title: "事業用の借入・保証",
    question:
      "事業に関する借入金や、誰かの連帯保証人になっていることはありますか？",
    sensitive: true,
  },
  {
    id: "work-08",
    category: "work",
    title: "顧問の専門家",
    question:
      "お仕事やお金のことで相談している専門家（税理士、弁護士、社労士など）はいますか？連絡先を教えてください。",
    sensitive: false,
  },
  {
    id: "work-09",
    category: "work",
    title: "著作物・知的財産",
    question:
      "ご自身が書いた本や作品、特許、商標など、知的財産に当たるものはありますか？どう引き継いでほしいですか？",
    sensitive: false,
  },

  // --- Digital (7 questions) ---
  {
    id: "digital-01",
    category: "digital",
    title: "仮想通貨（ネット上のお金）",
    question:
      "ビットコインなどの仮想通貨（インターネット上のお金）を持っていますか？どのサービスを使っていますか？（取引所やアプリの名前だけ教えてください。パスワードや秘密鍵は入力しないでください）",
    sensitive: true,
  },
  {
    id: "digital-02",
    category: "digital",
    title: "ネット証券・つみたてNISA",
    question:
      "楽天証券やSBI証券などのネット証券の口座や、つみたてNISA（少額から始められる非課税の投資制度）の口座はありますか？（証券会社名だけ教えてください。口座番号やパスワードは入力しないでください）",
    sensitive: true,
  },
  {
    id: "digital-03",
    category: "digital",
    title: "パスワードメモの場所",
    question:
      "パスワードを書いたメモや、信頼できる人に託しているものはありますか？どこにありますか？（パスワード自体は書かないでください。場所だけ教えてください）",
    sensitive: true,
  },
  {
    id: "digital-04",
    category: "digital",
    title: "SNSの死後対応",
    question:
      "InstagramやX（Twitter）、LINEなどのアカウントを持っていますか？亡くなった後どうしたいですか？（削除・追悼アカウント化など）",
    sensitive: false,
  },
  {
    id: "digital-05",
    category: "digital",
    title: "写真データの整理",
    question:
      "GoogleフォトやiCloudに写真を保存していますか？亡くなった後どうしたいですか？（家族に残す・削除など）",
    sensitive: false,
  },
  {
    id: "digital-06",
    category: "digital",
    title: "追悼アカウント設定",
    question:
      "AppleやGoogleの「亡くなった後のアカウント管理」機能を設定していますか？",
    sensitive: false,
  },
  {
    id: "digital-08",
    category: "digital",
    title: "声や姿を残すこと",
    question:
      "将来、AIなどの技術であなたの声や姿を再現して、ご家族に届けることについてどう思いますか？（OK・NGなど、希望を教えてください）",
    sensitive: false,
  },

  // --- Legal (12 questions) ---
  {
    id: "legal-01",
    category: "legal",
    title: "法定相続人の確認",
    question:
      "ご家族の構成を教えてください。配偶者、お子さん、ご両親、ご兄弟はいらっしゃいますか？",
    sensitive: false,
  },
  {
    id: "legal-02",
    category: "legal",
    title: "相続財産の全体像",
    question:
      "相続の対象になる財産を整理しましょう。預貯金、不動産、有価証券のほかに、借入金や連帯保証もありますか？",
    sensitive: true,
  },
  {
    id: "legal-03",
    category: "legal",
    title: "遺言書の種類と保管",
    question:
      "遺言書は作成されていますか？自筆証書・公正証書のどちらですか？保管場所を教えてください。",
    sensitive: true,
  },
  {
    id: "legal-04",
    category: "legal",
    title: "遺言を届ける人",
    question: "遺言書の内容を実行してくれる人（遺言執行者）は決めていますか？",
    sensitive: false,
  },
  {
    id: "legal-05",
    category: "legal",
    title: "生前贈与の意向",
    question:
      "ご存命のうちに財産を贈与したいとお考えですか？贈与契約書は作成していますか？",
    sensitive: true,
  },
  {
    id: "legal-06",
    category: "legal",
    title: "生命保険の活用",
    question:
      "生命保険の受取人はどなたですか？リビングニーズ特約はご存知ですか？",
    sensitive: true,
  },
  {
    id: "legal-07",
    category: "legal",
    title: "税金がかからない仕組みの活用",
    question:
      "毎年110万円まで税金がかからずにお金を渡せる仕組み（暦年贈与）や、お孫さんの教育資金を渡す制度は使われていますか？",
    sensitive: true,
  },
  {
    id: "legal-08",
    category: "legal",
    title: "不動産の相続登記",
    question:
      "不動産をお持ちの場合、相続登記の義務化（令和6年4月施行、3年以内に登記必要）はご存知ですか？",
    sensitive: false,
  },
  {
    id: "legal-09",
    category: "legal",
    title: "遺産分割の希望",
    question: "財産の分け方について、ご家族と話し合われたことはありますか？",
    sensitive: true,
  },
  {
    id: "legal-10",
    category: "legal",
    title: "寄付のご希望",
    question: "財産の一部を団体や施設に寄付したいお気持ちはありますか？",
    sensitive: false,
  },
  {
    id: "legal-11",
    category: "legal",
    title: "借金の引き継ぎについて",
    question:
      "もしお借り入れがある場合、ご家族がそれを引き継がなくて済む方法（相続放棄）について考えたことはありますか？",
    sensitive: true,
  },
  {
    id: "legal-12",
    category: "legal",
    title: "養子縁組の意向",
    question: "養子縁組をされている、または検討されていることはありますか？",
    sensitive: false,
  },

  // --- Trust (11 questions) ---
  {
    id: "trust-01",
    category: "trust",
    title: "家族信託の検討",
    question:
      "認知症などに備えて、信頼できるご家族に財産管理を任せる「家族信託」をご存知ですか？",
    sensitive: false,
  },
  {
    id: "trust-02",
    category: "trust",
    title: "信託の役割分担",
    question:
      "家族信託を検討される場合、財産を預ける人・預かる人・利益を受ける人は誰を想定しますか？",
    sensitive: false,
  },
  {
    id: "trust-03",
    category: "trust",
    title: "空き家対策",
    question:
      "ご自宅が将来空き家になる心配はありますか？売却・賃貸・解体など、どうしたいですか？",
    sensitive: false,
  },
  {
    id: "trust-04",
    category: "trust",
    title: "ペット信託",
    question:
      "ペットの飼育ができなくなった時に備えて、飼育費と世話を託す「ペット信託」に興味はありますか？",
    sensitive: false,
  },
  {
    id: "trust-05",
    category: "trust",
    title: "死後事務委任",
    question:
      "亡くなった後の手続き（届出、公共料金の解約、役所手続きなど）を誰にお願いしたいですか？",
    sensitive: false,
  },
  {
    id: "trust-06",
    category: "trust",
    title: "任意後見の検討",
    question:
      "判断能力が低下した時に備えて、信頼できる方に財産管理や契約をお願いする「任意後見」をご存知ですか？",
    sensitive: false,
  },
  {
    id: "trust-07",
    category: "trust",
    title: "任意後見受任者",
    question: "任意後見人になってほしい人は決まっていますか？",
    sensitive: false,
  },
  {
    id: "trust-08",
    category: "trust",
    title: "身元保証人",
    question: "入院や施設入居時の身元保証人は確保できていますか？",
    sensitive: false,
  },
  {
    id: "trust-09",
    category: "trust",
    title: "見守り契約",
    question: "定期的に安否を確認してくれる「見守り契約」に興味はありますか？",
    sensitive: false,
  },
  {
    id: "trust-10",
    category: "trust",
    title: "親なき後の備え",
    question:
      "ご家族の中に、将来的に生活支援が必要な方（障がい、持病など）はいらっしゃいますか？",
    sensitive: false,
  },
  {
    id: "trust-11",
    category: "trust",
    title: "信頼できる専門家",
    question:
      "終活に関して相談できる専門家（行政書士、司法書士、税理士など）はいますか？",
    sensitive: false,
  },

  // --- Support (8 questions) ---
  {
    id: "support-01",
    category: "support",
    title: "判断が難しくなったときの支援",
    question:
      "判断力が低下したときに、信頼できる方に代わりに手続きをしてもらう「成年後見制度」をご存知ですか？利用を検討されたことはありますか？",
    sensitive: false,
  },
  {
    id: "support-02",
    category: "support",
    title: "生活保護の相談",
    question:
      "生活費にお困りの場合、生活保護制度について相談されたことはありますか？",
    sensitive: true,
  },
  {
    id: "support-03",
    category: "support",
    title: "葬儀費用の補助金",
    question:
      "健康保険から葬儀費用の補助金（葬祭費・埋葬料）が出ることをご存知ですか？",
    sensitive: false,
  },
  {
    id: "support-04",
    category: "support",
    title: "自宅を使った生活資金の仕組み",
    question:
      "自宅に住み続けながら、家を担保にして生活資金を借りる仕組み（リバースモーゲージ）に興味はありますか？",
    sensitive: false,
  },
  {
    id: "support-05",
    category: "support",
    title: "自宅を売って住み続ける方法",
    question:
      "自宅を売却した後も、家賃を払ってそのまま住み続ける仕組み（リースバック）をご存知ですか？",
    sensitive: false,
  },
  {
    id: "support-06",
    category: "support",
    title: "遺族年金の確認",
    question:
      "ご自身が亡くなった後、ご家族が受け取れる遺族年金について確認されていますか？",
    sensitive: false,
  },
  {
    id: "support-07",
    category: "support",
    title: "日常生活自立支援",
    question:
      "福祉サービスの利用や日常的な金銭管理をサポートする「日常生活自立支援事業」をご存知ですか？",
    sensitive: false,
  },
  {
    id: "support-08",
    category: "support",
    title: "介護保険の利用状況",
    question:
      "介護保険サービスは利用されていますか？要介護認定は受けていますか？",
    sensitive: false,
  },
] as const;

/**
 * Get all questions belonging to a specific category.
 */
export function getQuestionsByCategory(
  category: QuestionCategory,
): readonly EndingNoteQuestion[] {
  return QUESTIONS.filter((q) => q.category === category);
}

/**
 * Pick the category with the lowest completion rate.
 * Falls back to "memories" when no progress data is available.
 */
export function pickLeastProgressedCategory(
  coveredQuestionIds: ReadonlySet<string>,
): QuestionCategory {
  let bestCategory: QuestionCategory = "memories";
  let lowestRate = 1;
  for (const cat of QUESTION_CATEGORIES) {
    const questions = getQuestionsByCategory(cat.id);
    const answered = questions.filter((q) =>
      coveredQuestionIds.has(q.id),
    ).length;
    const rate = questions.length > 0 ? answered / questions.length : 0;
    if (rate < lowestRate) {
      lowestRate = rate;
      bestCategory = cat.id;
    }
  }
  return bestCategory;
}

/**
 * Build a compact representation of all questions grouped by category,
 * showing progress and listing only unanswered items (ID + title).
 */
export function buildAllQuestionsCompact(
  coveredIds: ReadonlySet<string>,
): string {
  const parts: string[] = [];
  for (const cat of QUESTION_CATEGORIES) {
    const questions = getQuestionsByCategory(cat.id);
    const unanswered = questions.filter((q) => !coveredIds.has(q.id));
    const answeredCount = questions.length - unanswered.length;

    parts.push(`[${cat.label}]（${answeredCount}/${questions.length}完了）`);
    if (unanswered.length > 0) {
      for (const q of unanswered) {
        parts.push(`  - ${q.id}: ${q.title}`);
      }
    } else {
      parts.push("  （全て回答済み）");
    }
  }
  return parts.join("\n");
}

export { QUESTIONS };
