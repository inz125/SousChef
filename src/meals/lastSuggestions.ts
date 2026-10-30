// 最後の提案結果を端末に保存し、タブを移っても・開き直しても表示する（D-43）
import { z } from 'zod'
import {
  DishSchema,
  MealConditionsSchema,
  MealOutlineSchema,
  SuggestionSchema,
} from '../../supabase/functions/_shared/meals.ts'
import type { KeyValueStore } from '../offline/offlineCache'
import { outlineOf, type MealConditions, type MealOutline, type MealSuggestion } from './MealsApi'

/** 案と、できていればそのレシピ（D-63） */
export type Plan = { outline: MealOutline; recipe: MealSuggestion | null }

export type LastSuggestions = { conditions: MealConditions; plans: Plan[] }

const KEY = 'souschef:last-suggestions'

// 汁物（D-44）が入る前に保存した結果は、汁物なしの提案として読む。
// 副菜のレンジ（D-50）が入る前の結果は、スキーマの既定値で「どちらでも」になる
const ConditionsSchema = MealConditionsSchema.extend({ soup: z.boolean().default(false) })

const StoredSchema = z.union([
  z.object({
    conditions: ConditionsSchema,
    plans: z.array(z.object({ outline: MealOutlineSchema, recipe: SuggestionSchema.nullable() })),
  }),
  // 2 段階（D-63）になる前は、レシピつきの案だけを保存していた
  z
    .object({
      conditions: ConditionsSchema,
      suggestions: z.array(SuggestionSchema.extend({ soup: DishSchema.nullable().default(null) })),
    })
    .transform(({ conditions, suggestions }) => ({
      conditions,
      plans: suggestions.map((s) => ({ outline: outlineOf(s), recipe: s })),
    })),
])

export function loadLastSuggestions(store: KeyValueStore): LastSuggestions | null {
  const saved = store.get(KEY)
  if (saved === null) return null
  try {
    const parsed = StoredSchema.safeParse(JSON.parse(saved))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveLastSuggestions(store: KeyValueStore, last: LastSuggestions) {
  store.set(KEY, JSON.stringify(last))
}
