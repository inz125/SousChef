/** 夫婦それぞれの苦手・アレルギー（D-13）。アレルギーは提案から絶対に除外する */
export type MemberPreferences = {
  email: string
  displayName: string
  dislikes: string[]
  allergies: string[]
}

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
