import { currentSource, type IngredientSource } from './cooking'
import type { InventoryItem } from './inventory'

/** 買い物リストの品物（D-72）。名前だけを持つ */
export type ShoppingItem = {
  id: string
  name: string
  checked: boolean
  createdAt: string
}

/**
 * 名前の照らし合わせ（D-69 と同じ）: 名前が同じか、片方がもう片方を含む。
 * サーバのトリガー（public.names_match）と同じ判定
 */
export const namesMatch = (a: string, b: string) => a === b || a.includes(b) || b.includes(a)

/** 常備食品（D-71）に当たる食材か */
export const isStocked = (name: string, stocked: string[]) =>
  stocked.some((s) => namesMatch(s, name))

/**
 * 在庫を「少ない」にした・在庫から消したときに買い物リストへ自動で載る常備食品の名前（D-73）。
 * 実際に載せるのはサーバのトリガー。画面はお知らせの出し方を決めるのに使う。
 * items は変更前の在庫（changed を含んでいてよい）
 */
export function autoShoppingNames(
  changed: InventoryItem,
  items: InventoryItem[],
  stocked: string[],
): string[] {
  return stocked.filter(
    (s) =>
      namesMatch(s, changed.name) &&
      !items.some((i) => i.id !== changed.id && i.quantity === 'enough' && namesMatch(s, i.name)),
  )
}

/** チェックしていない品物を入れた順、その下にチェックした品物（D-72） */
export function orderShopping(items: ShoppingItem[]): ShoppingItem[] {
  const byCreated = (a: ShoppingItem, b: ShoppingItem) => a.createdAt.localeCompare(b.createdAt)
  return [
    ...items.filter((i) => !i.checked).toSorted(byCreated),
    ...items.filter((i) => i.checked).toSorted(byCreated),
  ]
}

/** チェックしていない同じ名前の品物があるか（D-74。重ねて載せない） */
export const hasUnchecked = (items: ShoppingItem[], name: string) =>
  items.some((i) => !i.checked && i.name === name)

/** レシピの材料のうち、買い物リストへ入れる「買い足し」の名前（D-74。印は D-69 で見直したあと） */
export function buyNames(
  ingredients: { name: string; source: IngredientSource }[],
  stock: InventoryItem[] | null,
): string[] {
  return ingredients.filter((i) => currentSource(i, stock) === 'buy').map((i) => i.name)
}
