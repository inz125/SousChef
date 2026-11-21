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

/**
 * 設定のチップの一覧に、入力した名前を足す（D-81）。「、」「,」で分け、前後の空白と空は除く。
 * すでにある名前は足さずに duplicates で返す
 */
export function addChips(
  existing: string[],
  input: string,
): { names: string[]; duplicates: string[] } {
  const typed = input
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const duplicates = [...new Set(typed.filter((n) => existing.includes(n)))]
  const added = [...new Set(typed.filter((n) => !existing.includes(n)))]
  return { names: [...existing, ...added], duplicates }
}
