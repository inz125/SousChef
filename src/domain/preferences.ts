/** 夫婦それぞれの苦手・アレルギー（D-13）。アレルギーは提案から絶対に除外する */
export type MemberPreferences = {
  email: string
  displayName: string
  dislikes: string[]
  allergies: string[]
}

/** 常備している調味料の初期値（D-32）。在庫に登録しなくても使える前提で提案する */
export const DEFAULT_STAPLES = [
  '塩',
  'こしょう',
  '砂糖',
  '醤油',
  'みりん',
  '酒',
  '酢',
  '味噌',
  'サラダ油',
  'ごま油',
  '顆粒だし',
  'マヨネーズ',
  'ケチャップ',
]

/** 「セロリ、パクチー」のような入力を一覧にする */
export function parseList(text: string): string[] {
  const items = text
    .split(/[、,，\n\s　]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set(items)]
}

export function formatList(items: string[]): string {
  return items.join('、')
}
