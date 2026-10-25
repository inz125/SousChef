/** 食材カテゴリ（D-23） */
export const CATEGORIES = {
  meat: '肉',
  fish: '魚介',
  egg: '卵',
  dairy: '乳製品',
  soy: '豆腐・大豆製品',
  leafy: '葉野菜',
  root: '根菜・いも',
  mushroom: 'きのこ',
  fruit: '果物',
  processed: '加工品',
  staple: '主食',
  seasoning: '調味料・乾物',
} as const

export type Category = keyof typeof CATEGORIES

/** 保存場所（D-10） */
export const LOCATIONS = {
  fridge: '冷蔵',
  freezer: '冷凍',
  vegetable: '野菜室',
  pantry: '食品庫',
} as const

export type StorageLocation = keyof typeof LOCATIONS

/** YYYY-MM-DD 形式の日付 */
export type IsoDate = string

export type FoodKind = {
  name: string
  category: Category
  location: StorageLocation
}
