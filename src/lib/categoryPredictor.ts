import type { Category, Transaction } from '@/services/db/db';

export interface CategoryPrediction {
  category: Category;
  confidence: number; // 0 to 1
  reason: 'history_exact' | 'history_keyword' | 'semantic_lexicon';
  matchedKeyword?: string;
}

// Common semantic clusters for cold-start category prediction
interface LexiconCluster {
  keywords: string[];
  categoryMatchers: (name: string) => boolean;
  type: 'expense' | 'income';
}

const SEMANTIC_CLUSTERS: LexiconCluster[] = [
  // 1. Food & Dining (飲食 / 餐飲)
  {
    type: 'expense',
    keywords: [
      '早餐', '午餐', '晚餐', '宵夜', '早午餐', '便當', '飯', '麵', '吃', '喝', '餓',
      '咖啡', '拿鐵', '美式', '卡布奇諾', '星巴克', '路易莎', 'cama', 'cafe', 'coffee',
      '奶茶', '飲料', '珍奶', '手搖', '麥當勞', '肯德基', '摩斯', '漢堡王', 'subway',
      '火鍋', '牛排', '拉麵', '壽司', '燒肉', '小吃', '水餃', '滷肉飯', '甜點', '蛋糕',
      '麵包', '外送', '外賣', 'ubereats', 'uber eats', 'foodpanda', '熊貓',
      'food', 'dining', 'lunch', 'dinner', 'breakfast', 'brunch', 'meal', 'drink',
    ],
    categoryMatchers: (name: string) => {
      const n = name.toLowerCase();
      return (
        n.includes('food') ||
        n.includes('dining') ||
        n.includes('meal') ||
        n.includes('drink') ||
        n.includes('餐') ||
        n.includes('食') ||
        n.includes('吃') ||
        n.includes('飲') ||
        n.includes('咖')
      );
    },
  },
  // 2. Transportation (交通 / 出行)
  {
    type: 'expense',
    keywords: [
      '捷運', '地鐵', '公車', '巴士', '高鐵', '火車', '台鐵', '客運', '輕軌',
      '計程車', '小黃', '打車', 'uber', '滴滴', 'yoxi', 'line taxi', 'taxi',
      '加油', '油錢', '汽油', '柴油', '中油', '台塑', 'gas',
      '停車', '停車費', '停車場', 'parking', '過路費', 'etc',
      '機票', '高鐵票', '火車票', '悠遊卡', '一卡通', '交通卡',
      '機車', '保養', '維修', '洗車', '驗車', 'youbike', '共享單車',
      'transport', 'transportation', 'commute', 'flight', 'transit',
    ],
    categoryMatchers: (name: string) => {
      const n = name.toLowerCase();
      return (
        n.includes('transport') ||
        n.includes('traffic') ||
        n.includes('transit') ||
        n.includes('commute') ||
        n.includes('交') ||
        n.includes('車') ||
        n.includes('行') ||
        n.includes('運')
      );
    },
  },
  // 3. Shopping & Groceries (購物 / 日常雜貨)
  {
    type: 'expense',
    keywords: [
      '超商', '便利商店', '7-11', '711', '全家', '萊爾富', 'ok超商',
      '超市', '全聯', '家樂福', '好市多', 'costco', '大潤發', '愛買',
      '買菜', '生鮮', '水果', '蔬菜', '肉品', '市場', '雜貨',
      '日用品', '衛生紙', '沐浴乳', '洗髮精', '牙膏', '清潔劑',
      '網購', '淘寶', '蝦皮', 'momo', 'pchome', 'amazon', '博客來',
      '衣服', '褲子', '外套', '鞋子', '飾品', '化妝品', '保養品',
      'shopping', 'groceries', 'grocery', 'market', 'store', 'cloth',
    ],
    categoryMatchers: (name: string) => {
      const n = name.toLowerCase();
      return (
        n.includes('shop') ||
        n.includes('grocer') ||
        n.includes('market') ||
        n.includes('store') ||
        n.includes('購') ||
        n.includes('買') ||
        n.includes('日用') ||
        n.includes('超') ||
        n.includes('雜')
      );
    },
  },
  // 4. Entertainment & Leisure (娛樂 / 休閒)
  {
    type: 'expense',
    keywords: [
      '電影', '戲院', '威秀', '國賓', '遊戲', 'steam', 'switch', 'ps5', 'xbox',
      'netflix', 'spotify', 'youtube', 'disney', '動漫', '漫畫', '展覽',
      '唱歌', 'ktv', '錢櫃', '好樂迪', '門票', '演唱會', '音樂會', '桌遊',
      '旅遊', '旅行', '飯店', '旅館', 'airbnb', '機加酒', '渡假',
      'entertainment', 'movie', 'game', 'play', 'leisure', 'travel',
    ],
    categoryMatchers: (name: string) => {
      const n = name.toLowerCase();
      return (
        n.includes('entertain') ||
        n.includes('game') ||
        n.includes('play') ||
        n.includes('leisure') ||
        n.includes('travel') ||
        n.includes('娛') ||
        n.includes('樂') ||
        n.includes('遊') ||
        n.includes('休閒')
      );
    },
  },
  // 5. Housing & Utilities (居住 / 水電帳單)
  {
    type: 'expense',
    keywords: [
      '房租', '租金', '押金', '管理費', '物業費', '修繕', '家具', '家電',
      '水費', '電費', '瓦斯', '天然氣', '電話費', '手機費', '電信費',
      '寬頻', '光纖', '網路費', '中華電信', '遠傳', '台灣大哥大',
      'housing', 'utilities', 'utility', 'rent', 'bill', 'electric', 'water',
    ],
    categoryMatchers: (name: string) => {
      const n = name.toLowerCase();
      return (
        n.includes('hous') ||
        n.includes('utilit') ||
        n.includes('rent') ||
        n.includes('bill') ||
        n.includes('住') ||
        n.includes('房') ||
        n.includes('水電') ||
        n.includes('帳單')
      );
    },
  },
  // 6. Healthcare & Medical (醫療 / 健康)
  {
    type: 'expense',
    keywords: [
      '看病', '診所', '醫院', '掛號', '掛號費', '健保', '藥局', '買藥', '藥品',
      '牙醫', '洗牙', '拔牙', '眼科', '眼鏡', '隱形眼鏡', '健檢', '體檢',
      '復健', '中醫', '推拿', '疫苗', '維他命', '保健品',
      'healthcare', 'health', 'medical', 'doctor', 'clinic', 'medicine', 'pharmacy',
    ],
    categoryMatchers: (name: string) => {
      const n = name.toLowerCase();
      return (
        n.includes('health') ||
        n.includes('medic') ||
        n.includes('doctor') ||
        n.includes('care') ||
        n.includes('醫') ||
        n.includes('健') ||
        n.includes('藥') ||
        n.includes('療')
      );
    },
  },
  // 7. Salary & Income (薪水 / 收入)
  {
    type: 'income',
    keywords: [
      '薪水', '薪資', '月薪', '工資', '獎金', '年終', '分紅', '業績獎金', '加班費',
      '接案', '兼職', '副業', '外快', '稿費', '鐘點費', '佣金',
      '投資', '股利', '股息', '利息', '定存', '基金', '獲利', '賣股票',
      'salary', 'wage', 'income', 'bonus', 'freelance', 'investment', 'dividend',
    ],
    categoryMatchers: (name: string) => {
      const n = name.toLowerCase();
      return (
        n.includes('salary') ||
        n.includes('income') ||
        n.includes('wage') ||
        n.includes('bonus') ||
        n.includes('freelance') ||
        n.includes('invest') ||
        n.includes('薪') ||
        n.includes('工資') ||
        n.includes('收') ||
        n.includes('獎') ||
        n.includes('投')
      );
    },
  },
];

/**
 * Predicts the most relevant category given a user's transaction note,
 * prioritizing personalized historical correlations, and gracefully falling back to semantic rules.
 */
export function predictCategoryFromNote(
  note: string,
  type: 'expense' | 'income',
  categories: Category[],
  transactions: Transaction[]
): CategoryPrediction | null {
  const cleanNote = note.trim().toLowerCase();
  if (!cleanNote || categories.length === 0) return null;

  const validCategoryMap = new Map<string, Category>();
  categories.filter(c => c.type === type && !c.deleted).forEach(c => {
    validCategoryMap.set(c.id, c);
  });

  if (validCategoryMap.size === 0) return null;

  // Tier 1: Historical transactions correlation score
  const categoryScores = new Map<string, number>();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  transactions.forEach(t => {
    if (t.deleted || t.type !== type || !t.category || !t.note) return;
    if (!validCategoryMap.has(t.category)) return;

    const tNote = t.note.trim().toLowerCase();
    if (!tNote) return;

    let points = 0;
    // Exact full match has maximum weight
    if (tNote === cleanNote) {
      points += 12;
    } else if (cleanNote.includes(tNote) && tNote.length >= 2) {
      points += 6;
    } else if (tNote.includes(cleanNote) && cleanNote.length >= 2) {
      points += 5;
    }

    if (points > 0) {
      const isRecent = new Date(t.date).getTime() >= thirtyDaysAgo;
      const multiplier = isRecent ? 1.5 : 1.0;
      const current = categoryScores.get(t.category) || 0;
      categoryScores.set(t.category, current + points * multiplier);
    }
  });

  if (categoryScores.size > 0) {
    let topCatId = '';
    let highestScore = -1;

    for (const [catId, score] of categoryScores.entries()) {
      if (score > highestScore) {
        highestScore = score;
        topCatId = catId;
      }
    }

    if (topCatId && validCategoryMap.has(topCatId) && highestScore >= 5) {
      const cat = validCategoryMap.get(topCatId)!;
      return {
        category: cat,
        confidence: Math.min(1, highestScore / 20),
        reason: highestScore >= 12 ? 'history_exact' : 'history_keyword',
      };
    }
  }

  // Tier 2: Semantic Lexicon Fallback (Zero-shot keywords for cold start)
  for (const cluster of SEMANTIC_CLUSTERS) {
    if (cluster.type !== type) continue;

    for (const kw of cluster.keywords) {
      if (cleanNote.includes(kw)) {
        // Find matching category in the user's available categories
        const matched = Array.from(validCategoryMap.values()).find(c => cluster.categoryMatchers(c.name));
        if (matched) {
          return {
            category: matched,
            confidence: 0.8,
            reason: 'semantic_lexicon',
            matchedKeyword: kw,
          };
        }
      }
    }
  }

  return null;
}
