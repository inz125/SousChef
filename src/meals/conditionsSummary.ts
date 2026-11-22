import { NOODLE_LABELS } from '../../supabase/functions/_shared/meals.ts'
import type { MealConditions } from './MealsApi'

/** 調理時間の言葉。確認画面（D-77）と要約（D-86）で共通にする */
export const minutesLabel = (m: MealConditions['maxMinutes']) =>
  m === null ? '指定なし' : `${m} 分`
/** 在庫のみ / 買い足し OK の言葉 */
export const shoppingLabel = (allow: boolean) => (allow ? '買い足し OK' : '在庫のみ')

/** 表示中の案を提案したときの条件を「・」でつないだ要約（D-86） */
export function conditionsSummary(c: MealConditions): string {
  const staple = c.riceCooked ? 'ご飯あり' : c.noodle ? NOODLE_LABELS[c.noodle] : '主食なし'
  const side = !c.sideDish ? '副菜なし' : c.sideMicrowave ? '副菜はレンジで' : '副菜あり'
  const mood = c.mood.trim()
  return [
    c.maxMinutes === null ? '時間指定なし' : minutesLabel(c.maxMinutes),
    shoppingLabel(c.allowShopping),
    staple,
    ...(c.mustUse.length > 0 ? [`使う: ${c.mustUse.join('、')}`] : []),
    c.soup ? '汁物あり' : '汁物なし',
    side,
    ...(mood ? [`気分: ${mood}`] : []),
  ].join('・')
}
