// 最後の提案結果を端末に保存し、タブを移っても・開き直しても表示する（D-43）
import { z } from 'zod'
import {
  DishSchema,
  MealConditionsSchema,
  SuggestionSchema,
} from '../../supabase/functions/_shared/meals.ts'
import type { KeyValueStore } from '../offline/offlineCache'
import type { MealConditions, MealSuggestion } from './MealsApi'

export type LastSuggestions = { conditions: MealConditions; suggestions: MealSuggestion[] }

const KEY = 'souschef:last-suggestions'

// 汁物（D-44）が入る前に保存した結果は、汁物なしの提案として読む。
// 副菜のレンジ（D-50）が入る前の結果は、スキーマの既定値で「どちらでも」になる
const StoredSchema = z.object({
  conditions: MealConditionsSchema.extend({ soup: z.boolean().default(false) }),
  suggestions: z.array(SuggestionSchema.extend({ soup: DishSchema.nullable().default(null) })),
})

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
