import type { Category, FoodKind, IsoDate, StorageLocation } from './food'

type DaysByLocation = Record<StorageLocation, number>

/** カテゴリ × 保存場所の目安日数（D-24） */
const CATEGORY_DAYS: Record<Category, DaysByLocation> = {
  meat: { fridge: 3, freezer: 30, vegetable: 3, pantry: 1 },
  fish: { fridge: 2, freezer: 30, vegetable: 2, pantry: 1 },
  egg: { fridge: 14, freezer: 30, vegetable: 14, pantry: 7 },
  dairy: { fridge: 7, freezer: 30, vegetable: 7, pantry: 3 },
  soy: { fridge: 4, freezer: 30, vegetable: 4, pantry: 2 },
  leafy: { fridge: 4, freezer: 30, vegetable: 5, pantry: 2 },
  root: { fridge: 14, freezer: 30, vegetable: 21, pantry: 14 },
  mushroom: { fridge: 5, freezer: 30, vegetable: 5, pantry: 2 },
  fruit: { fridge: 7, freezer: 30, vegetable: 7, pantry: 5 },
  processed: { fridge: 7, freezer: 30, vegetable: 7, pantry: 3 },
  staple: { fridge: 5, freezer: 30, vegetable: 5, pantry: 30 },
  seasoning: { fridge: 90, freezer: 180, vegetable: 90, pantry: 180 },
}

type FoodOverride = {
  category: Category
  keywords: string[]
  days: Partial<DaysByLocation>
}

/** 主要食材の個別値。同じカテゴリで食材名にキーワードを含めば、定義された保存場所についてカテゴリ値より優先する（D-24） */
const FOOD_OVERRIDES: FoodOverride[] = [
  {
    category: 'meat',
    keywords: ['ひき肉', '挽肉', '挽き肉', 'ミンチ', '合いびき'],
    days: { fridge: 2, freezer: 21 },
  },
  { category: 'fish', keywords: ['刺身'], days: { fridge: 1 } },
  { category: 'leafy', keywords: ['もやし'], days: { fridge: 2, vegetable: 2 } },
  { category: 'meat', keywords: ['鶏'], days: { fridge: 2 } },
  { category: 'soy', keywords: ['納豆'], days: { fridge: 10 } },
  { category: 'staple', keywords: ['ご飯'], days: { fridge: 2 } },
  { category: 'staple', keywords: ['パン'], days: { pantry: 3, freezer: 14 } },
]

export function estimateExpiryDays({ name, category, location }: FoodKind): number {
  const override = FOOD_OVERRIDES.find(
    (o) =>
      o.category === category &&
      o.days[location] !== undefined &&
      o.keywords.some((k) => name.includes(k)),
  )
  return override?.days[location] ?? CATEGORY_DAYS[category][location]
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function estimateExpiresOn(food: FoodKind, registeredOn: IsoDate): IsoDate {
  return addDays(registeredOn, estimateExpiryDays(food))
}

/** 「期限が近い」= 今日〜2日後（D-25） */
const SOON_DAYS = 2

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'unknown'

export function expiryStatus(expiresOn: IsoDate | null, today: IsoDate): ExpiryStatus {
  if (expiresOn === null) return 'unknown'
  if (expiresOn < today) return 'expired'
  if (expiresOn <= addDays(today, SOON_DAYS)) return 'soon'
  return 'ok'
}

/** 端末のローカル日付（日本時間で使う前提）を YYYY-MM-DD にする */
export function toIsoDate(date: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
