// デモ用データ（価格・需要はサンプルです。アプリ内の「価格メモ」から実際の値に書き換えられます）

const STORES = [
  { id: 'A', name: 'こまちマート', type: '近所のスーパー', minutes: 4, color: '#7f9f7a' },
  { id: 'B', name: 'ひだまり業務館', type: '業務用・大容量', minutes: 11, color: '#c9775a' },
  { id: 'C', name: 'さくらドラッグ', type: 'ドラッグストア', minutes: 6, color: '#7fa6bf' },
];

// 店と店のあいだの移動時間（分）
const BETWEEN = { AB: 9, AC: 5, BC: 8 };

// keep: short = 日持ちしない / freeze = 冷凍できる / long = 日持ちする
const INGREDIENTS = {
  chicken_thigh: { name: '鶏もも肉', pack: 300, unit: 'g', packLabel: '300gパック', keep: 'freeze', prices: { A: 528, B: 438, C: null } },
  chicken_breast: { name: '鶏むね肉', pack: 300, unit: 'g', packLabel: '300gパック', keep: 'freeze', prices: { A: 318, B: 258, C: null } },
  pork: { name: '豚こま肉', pack: 200, unit: 'g', packLabel: '200gパック', keep: 'freeze', prices: { A: 418, B: 338, C: null } },
  bacon: { name: 'ベーコン', pack: 4, unit: '枚', packLabel: '4枚入り', keep: 'freeze', prices: { A: 198, B: 248, C: 228 } },
  egg: { name: '卵', pack: 10, unit: '個', packLabel: '10個入り', keep: 'long', prices: { A: 278, B: 268, C: 238 } },
  tofu: { name: '豆腐', pack: 1, unit: '丁', packLabel: '1丁', keep: 'short', prices: { A: 68, B: 58, C: 48 } },
  natto: { name: '納豆', pack: 3, unit: 'パック', packLabel: '3パック', keep: 'short', prices: { A: 98, B: 88, C: 78 } },
  milk: { name: '牛乳', pack: 1000, unit: 'ml', packLabel: '1L', keep: 'short', prices: { A: 248, B: 238, C: 218 } },
  onion: { name: '玉ねぎ', pack: 3, unit: '個', packLabel: '3個入り', keep: 'long', prices: { A: 154, B: 158, C: null } },
  carrot: { name: 'にんじん', pack: 3, unit: '本', packLabel: '3本入り', keep: 'long', prices: { A: 138, B: 148, C: null } },
  potato: { name: 'じゃがいも', pack: 4, unit: '個', packLabel: '4個入り', keep: 'long', prices: { A: 168, B: 178, C: null } },
  cabbage: { name: 'キャベツ', pack: 1, unit: '玉', packLabel: '1玉', keep: 'short', prices: { A: 238, B: 198, C: null } },
  moyashi: { name: 'もやし', pack: 1, unit: '袋', packLabel: '1袋', keep: 'short', prices: { A: 38, B: 29, C: 25 } },
  negi: { name: '長ねぎ', pack: 2, unit: '本', packLabel: '2本入り', keep: 'short', prices: { A: 158, B: 168, C: null } },
  shimeji: { name: 'しめじ', pack: 1, unit: 'パック', packLabel: '1パック', keep: 'short', prices: { A: 84, B: 88, C: null } },
  komatsuna: { name: '小松菜', pack: 1, unit: '束', packLabel: '1束', keep: 'short', prices: { A: 158, B: 178, C: null } },
  tuna: { name: 'ツナ缶', pack: 3, unit: '缶', packLabel: '3缶パック', keep: 'long', prices: { A: 348, B: 298, C: 318 } },
  tomato_can: { name: 'トマト缶', pack: 1, unit: '缶', packLabel: '1缶', keep: 'long', prices: { A: 96, B: 98, C: 118 } },
  pasta: { name: 'パスタ', pack: 500, unit: 'g', packLabel: '500g', keep: 'long', prices: { A: 148, B: 158, C: 168 } },
  pork_mince: { name: '豚ひき肉', pack: 200, unit: 'g', packLabel: '200gパック', keep: 'freeze', prices: { A: 378, B: 318, C: null } },
  salmon: { name: '鮭の切り身', pack: 2, unit: '切れ', packLabel: '2切れ', keep: 'freeze', prices: { A: 398, B: 378, C: null } },
  eggplant: { name: 'なす', pack: 3, unit: '本', packLabel: '3本入り', keep: 'short', prices: { A: 198, B: 178, C: null } },
  daikon: { name: '大根', pack: 1, unit: '本', packLabel: '1本', keep: 'short', prices: { A: 168, B: 148, C: null } },
  green_pepper: { name: 'ピーマン', pack: 4, unit: '個', packLabel: '4個入り', keep: 'short', prices: { A: 148, B: 138, C: null } },
};

// AIのAPIキーがないときに使う、デモ用の「献立名 → 食材」辞書（1人分）
const DISH_DICTIONARY = [
  { keys: ['麻婆なす', 'マーボーなす', '麻婆茄子'], name: '麻婆なす', tag: '主菜', uses: { pork_mince: 100, eggplant: 2, negi: 0.5 } },
  { keys: ['麻婆豆腐', 'マーボー豆腐'], name: '麻婆豆腐', tag: '主菜', uses: { pork_mince: 100, tofu: 1, negi: 0.5 } },
  { keys: ['ハンバーグ'], name: 'ハンバーグ', tag: '主菜', uses: { pork_mince: 150, onion: 0.5, egg: 1 } },
  { keys: ['ピーマンの肉詰め', '肉詰め'], name: 'ピーマンの肉詰め', tag: '主菜', uses: { pork_mince: 100, green_pepper: 2 } },
  { keys: ['青椒肉絲', 'チンジャオロース'], name: 'チンジャオロース', tag: '主菜', uses: { pork: 100, green_pepper: 3 } },
  { keys: ['野菜炒め'], name: '野菜炒め', tag: '主菜', uses: { pork: 80, cabbage: 0.25, moyashi: 0.5, carrot: 0.5 } },
  { keys: ['照り焼き', 'てりやき'], name: '鶏の照り焼き', tag: '主菜', uses: { chicken_thigh: 150 } },
  { keys: ['鮭のホイル焼き', 'ホイル焼き'], name: '鮭のホイル焼き', tag: '主菜', uses: { salmon: 1, shimeji: 0.5, onion: 0.5 } },
  { keys: ['鮭', 'ムニエル', '焼き鮭'], name: '焼き鮭', tag: '主菜', uses: { salmon: 1 } },
  { keys: ['オムライス'], name: 'オムライス', tag: '主食', uses: { chicken_thigh: 80, onion: 0.5, egg: 2 } },
  { keys: ['カルボナーラ'], name: 'カルボナーラ', tag: '主食', uses: { bacon: 2, egg: 1, milk: 50, pasta: 100 } },
  { keys: ['豚汁', 'とん汁'], name: '豚汁', tag: '汁物', uses: { pork: 50, daikon: 0.25, carrot: 0.5, negi: 0.5, tofu: 0.5 } },
  { keys: ['なすの味噌汁', 'なすのみそ汁'], name: 'なすのみそ汁', tag: '汁物', uses: { eggplant: 1, negi: 0.5 } },
  { keys: ['大根サラダ', '大根とツナ'], name: '大根とツナのサラダ', tag: '副菜', uses: { daikon: 0.25, tuna: 1 } },
  { keys: ['卵焼き', 'たまご焼き', '玉子焼き'], name: '卵焼き', tag: '副菜', uses: { egg: 2 } },
  { keys: ['冷奴', '冷ややっこ'], name: '冷奴', tag: '副菜', uses: { tofu: 0.5, negi: 0.25 } },
];

// uses は1人分。pop は地域の人気度（お店側の需要予測に使うサンプル値）
const RECIPES = [
  { id: 'oyako', name: '親子丼', tag: '主菜', pop: 0.12, uses: { chicken_thigh: 150, egg: 2, onion: 0.5 } },
  { id: 'negishio', name: '鶏むねのねぎ塩炒め', tag: '主菜', pop: 0.08, uses: { chicken_breast: 150, negi: 1, moyashi: 0.5 } },
  { id: 'nikujaga', name: '肉じゃが', tag: '主菜', pop: 0.09, uses: { pork: 100, potato: 2, carrot: 0.5, onion: 0.5 } },
  { id: 'kaiko', name: '豚キャベツのみそ炒め', tag: '主菜', pop: 0.10, uses: { pork: 100, cabbage: 0.25, carrot: 0.5 } },
  { id: 'umani', name: '豆腐と豚こまのうま煮', tag: '主菜', pop: 0.06, uses: { tofu: 1, pork: 50, negi: 0.5 } },
  { id: 'saute', name: '鶏むねときのこのソテー', tag: '主菜', pop: 0.07, uses: { chicken_breast: 150, shimeji: 0.5 } },
  { id: 'stew', name: '鶏もものクリームシチュー', tag: '主菜', pop: 0.07, uses: { chicken_thigh: 150, milk: 300, potato: 1, carrot: 0.5, onion: 0.5 } },
  { id: 'pasta_tomato', name: 'ベーコンのトマトパスタ', tag: '主食', pop: 0.08, uses: { tomato_can: 1, bacon: 2, onion: 0.5, pasta: 100 } },
  { id: 'tkg', name: '納豆たまごごはん', tag: '主食', pop: 0.10, uses: { natto: 1, egg: 1 } },
  { id: 'potofu', name: 'キャベツのポトフ', tag: '汁物', pop: 0.05, uses: { bacon: 2, cabbage: 0.25, potato: 1, carrot: 0.5, onion: 0.5 } },
  { id: 'miso', name: 'しめじと豆腐のみそ汁', tag: '汁物', pop: 0.12, uses: { shimeji: 0.5, tofu: 0.5, negi: 0.5 } },
  { id: 'egg_soup', name: 'キャベツと卵のスープ', tag: '汁物', pop: 0.06, uses: { cabbage: 0.25, egg: 1 } },
  { id: 'namul', name: 'もやしとにんじんのナムル', tag: '副菜', pop: 0.06, uses: { moyashi: 1, carrot: 0.5 } },
  { id: 'ohitashi', name: '小松菜とツナのおひたし', tag: '副菜', pop: 0.05, uses: { komatsuna: 0.5, tuna: 1 } },
  { id: 'komatsuna_egg', name: '小松菜と卵の炒めもの', tag: '副菜', pop: 0.05, uses: { komatsuna: 0.5, egg: 2 } },
  { id: 'shiomomi', name: '塩もみキャベツ', tag: '副菜', pop: 0.05, uses: { cabbage: 0.25 } },
];

const SAMPLE_MENU = { oyako: 1, nikujaga: 1, pasta_tomato: 1, miso: 2, kaiko: 1 };

// お店側デモ：地域のアプリ登録者数と、各店を使う人の割合
const REGION_USERS = 1200;
const STORE_SHARE = { A: 0.42, B: 0.33, C: 0.25 };

// 予定在庫 ÷ 需要予測 の倍率（デモ用）
const STOCK_FACTOR = {
  cabbage: 1.7, komatsuna: 1.9, tofu: 1.5, moyashi: 1.35, shimeji: 1.3, milk: 1.25,
  chicken_breast: 0.7, egg: 0.85, natto: 0.9, negi: 1.1,
};

// レシート読み取り用：食材名の別の書き方
const ALIASES = {
  chicken_thigh: ['鶏もも', '若鶏もも', 'とりもも', 'チキンもも'],
  chicken_breast: ['鶏むね', '若鶏むね', 'とりむね', '鶏胸'],
  pork: ['豚こま', '豚小間', '豚切落し', '豚切り落とし', '豚こま切'],
  pork_mince: ['豚ひき', '豚挽', '豚ミンチ'],
  bacon: ['ベーコン'],
  egg: ['たまご', '玉子', '鶏卵', 'タマゴ'],
  tofu: ['とうふ', '絹ごし', '木綿'],
  natto: ['なっとう'],
  milk: ['ぎゅうにゅう', '成分無調整'],
  onion: ['たまねぎ', 'タマネギ', '玉葱'],
  carrot: ['人参', 'ニンジン'],
  potato: ['馬鈴薯', 'ジャガイモ', 'じゃが芋', 'メークイン', '男爵'],
  cabbage: ['きゃべつ'],
  moyashi: ['モヤシ'],
  negi: ['長ネギ', '白ねぎ', '白ネギ', '根深ねぎ'],
  shimeji: ['シメジ', 'ぶなしめじ'],
  komatsuna: ['こまつな'],
  tuna: ['ツナ', 'シーチキン'],
  tomato_can: ['カットトマト', 'ホールトマト', 'トマト水煮'],
  pasta: ['スパゲッティ', 'スパゲティ'],
  salmon: ['鮭', 'さけ', '秋鮭', '銀鮭'],
  eggplant: ['茄子', 'ナス'],
  daikon: ['だいこん'],
  green_pepper: ['ぴーまん'],
};

const SAMPLE_RECEIPT = `ひだまり業務館
2026年10月05日 18:42
若鶏もも肉 300g        ¥428
豚こま切落し 200g      ¥338
キャベツ              ¥178
カットトマト缶 400g    ¥95
小計                ¥1,039
合計                ¥1,122`;

// お店側デモ：時間帯ごとの来店予測（人）
const HOURLY_BASE = { 10: 40, 11: 55, 12: 70, 13: 60, 14: 45, 15: 40, 16: 55, 17: 85, 18: 120, 19: 110, 20: 70, 21: 40 };
const HOURLY_SCALE = { A: 1, B: 0.8, C: 0.6 };

// わけあいデモ：同じ大学・寮で、同じ食材を分けたい人の数（サンプル）
const SHARE_DEMO = { cabbage: 3, komatsuna: 2, negi: 2, moyashi: 1, tofu: 1, shimeji: 2, milk: 1, natto: 1, eggplant: 2, daikon: 3, green_pepper: 2, chicken_thigh: 2, chicken_breast: 2, pork: 2, pork_mince: 1, salmon: 1, bacon: 1 };

// 場所（デモ）：エリアごとの近くのお店。店名は架空です
const AREAS = [
  {
    id: 'musashisakai', name: '武蔵境駅周辺', center: [35.7022, 139.5436],
    stores: [
      { name: 'こまちマート 境店', type: '近所のスーパー', walk: 4 },
      { name: 'ひだまり業務館 境南店', type: '業務用・大容量', walk: 11 },
      { name: 'さくらドラッグ 境駅前店', type: 'ドラッグストア', walk: 6 },
    ],
    between: { AB: 9, AC: 5, BC: 8 }, priceScale: { A: 1, B: 1, C: 1 },
  },
  {
    id: 'mitaka', name: '三鷹駅周辺', center: [35.7027, 139.5607],
    stores: [
      { name: 'みずほマート 三鷹北口店', type: '近所のスーパー', walk: 5 },
      { name: 'まんぷく業務市場 三鷹店', type: '業務用・大容量', walk: 13 },
      { name: 'あおばドラッグ 三鷹店', type: 'ドラッグストア', walk: 3 },
    ],
    between: { AB: 10, AC: 4, BC: 11 }, priceScale: { A: 1.03, B: 0.98, C: 1.02 },
  },
  {
    id: 'kichijoji', name: '吉祥寺駅周辺', center: [35.7031, 139.5797],
    stores: [
      { name: 'ことりマート 吉祥寺店', type: '近所のスーパー', walk: 6 },
      { name: 'まんぷく業務市場 吉祥寺店', type: '業務用・大容量', walk: 14 },
      { name: 'あおばドラッグ 吉祥寺北口店', type: 'ドラッグストア', walk: 3 },
    ],
    between: { AB: 10, AC: 4, BC: 11 }, priceScale: { A: 1.06, B: 1.02, C: 1 },
  },
  {
    id: 'ariake', name: '有明周辺', center: [35.6343, 139.7907],
    stores: [
      { name: 'うみかぜマート 有明店', type: '近所のスーパー', walk: 7 },
      { name: 'ひだまり業務館 豊洲店', type: '業務用・大容量', walk: 18 },
      { name: 'さくらドラッグ 有明ガーデン店', type: 'ドラッグストア', walk: 5 },
    ],
    between: { AB: 14, AC: 4, BC: 15 }, priceScale: { A: 1.08, B: 1.04, C: 1.02 },
  },
];

const TRANSPORTS = {
  walk: { label: '徒歩', factor: 1 },
  bike: { label: '自転車', factor: 0.4 },
  car: { label: '車', factor: 0.35 },
};

const SHARE_SCOPES = {
  dorm: '同じ寮',
  univ: '同じ大学',
  off: '使わない',
};
